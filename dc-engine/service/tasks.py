"""
The worker side. This module imports dc_engine (~160MB RSS) and is loaded ONLY
by the Celery worker -- never by the API, which dispatches by name instead.

One task == one check run. That granularity is forced, not chosen: dc_engine
keeps per-run state in module globals (job_id, job_timestamp, system_logs,
validation_logs) and database.py caches a module-global _engine/_Session, so two
runs sharing a process would cross-contaminate job ids, logs and user
attribution. Hence prefork (process per run), never a thread/gevent pool.
"""
import logging
import os
import traceback
from datetime import datetime, timezone

from celery.signals import worker_process_init

from Data_Code.common.failure_text import explain_failure
from service.celery_app import app

log = logging.getLogger("dc_engine.tasks")

# Imported at MODULE level on purpose, despite costing ~160MB. Celery's prefork
# parent imports this once and then forks, so every child inherits the loaded
# engine as copy-on-write shared pages -- one import, shared RAM, and no stall
# on a child's first task. Deferring it inside the task instead makes each child
# import independently AFTER the fork: N separate 160MB copies, nothing shared,
# and 3.2s added to the first task each child runs.
# The API never imports this module (it dispatches by name), so it pays none of it.
import dc_engine


@worker_process_init.connect
def _dispose_inherited_connections(**_kwargs):
    """
    Drop any SQLAlchemy connections inherited across the fork.

    database.py caches the engine in a module global. If anything touches the DB
    in the Celery parent before it forks, every child inherits the SAME live TCP
    socket and their traffic interleaves on one connection -- surfacing under
    load as random InvalidRequest/decode errors that look like flaky checks
    rather than a fork bug. dispose() forces each child to open its own.
    """
    try:
        from Data_Code.common.database import get_engine
        get_engine().dispose()
    except Exception:
        # A worker that can't reach the DB yet must still boot; the task itself
        # will surface the real connection error with proper job context.
        pass


class RunFailed(Exception):
    """
    A run that failed for a reason the engine UNDERSTANDS: a client problem (table not found, wrong
    password, no checks ticked) or a service problem (the database is briefly unavailable).

    It is raised in place of the original exception, carrying its type and message
    ("ValueError: No field rules ..."), so the Jobs page still shows the same title and reason. The
    task lists it in `throws`, which tells Celery this is an expected outcome: it is logged as one
    line instead of an ERROR with a stack trace, and the log keeps its real errors for real bugs.
    The original exception and traceback stay attached (`__cause__`), so nothing is lost.
    """


@app.task(
    name="dc.run_check",
    bind=True,
    acks_late=True,                 # a run lost to a worker crash is redelivered
    reject_on_worker_lost=True,
    max_retries=0,                  # checks are not idempotent -- never auto-retry
    throws=(RunFailed,),
)
def run_check(self, payload):
    """
    payload is the engine's native 2-element config, exactly as config.json:
        [{"user_id": "<uuid>"},
         {"check_type": "traditional", "config_id": "DBC0001", "checklist": "default"}]
    """
    # acks_late means a task whose worker died gets redelivered. Usually that is
    # what you want -- the first attempt never finished. The exception is a run
    # that COMPLETED and whose ack was lost: re-running it would write a second
    # set of rows into results under a fresh job_id. One lookup rules that out.
    # Deliberately only SUCCESS: a failed attempt should still be retryable.
    prior = app.AsyncResult(self.request.id)
    if prior.successful():
        return {"status": "already_completed", "task_id": self.request.id, "duplicate": True}

    # The task id IS the run id the API handed back, so the job id can be derived from it.
    # Wall-clock bounds of the run, measured here because this is the only place that
    # knows them. The product used to infer them from result-row timestamps, which are
    # the job's start time rather than when it finished, so durations were guesses.
    started_at = datetime.now(timezone.utc)

    try:
        status = dc_engine.run_dc_engine(payload, run_id=self.request.id)
    except Exception as exc:  # noqa: BLE001 -- every failure is classified below
        info = explain_failure(exc, traceback.format_exc())

        if info["business"] and info["kind"] != "server":
            # Client or service problem: an expected outcome, named. One log line, no stack trace.
            log.warning("RUN FAILED [%s] %s: %s (run %s)", info["kind"], info["title"], info["reason"], self.request.id)
            raise RunFailed(f"{type(exc).__name__}: {exc}") from exc

        # The engine's own fault, or no known cause: keep the full error and traceback in the log.
        log.error("RUN FAILED [%s] %s (run %s)", info["kind"], info["title"], self.request.id, exc_info=True)
        raise

    return {
        "status": status,
        "task_id": self.request.id,
        "started_at": started_at.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
