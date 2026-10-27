"""
dc-engine HTTP front door.

Receives a JSON payload, enqueues a run, returns immediately. Nothing else --
no file handling, no uploads, no config assembly (that's the backend's job).

Hard rule: this module must never import dc_engine, directly or transitively.
Doing so takes the API process from ~20MB to ~160MB and pays that again per
uvicorn worker. Runs are dispatched by task NAME via send_task, so neither
tasks.py nor the engine is ever loaded here.
"""
import hashlib
import json
import logging
import os
import re
import time
import uuid
from typing import Any, List, Optional, Union

import redis
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from Data_Code.common.failure_text import explain_failure, readable_failure
from service.announce import start_announcing
from service.celery_app import app as celery_app

api = FastAPI(title="dc-engine", version="2.0.0")


@api.on_event("startup")
def _announce_startup():
    # Tell the backend the engine is up, so runs it held while we were down are sent now. In its
    # own thread and never raises: the backend being down must not stop the engine starting.
    start_announcing()

# uvicorn's access log is off (the healthcheck alone was ~14% of all log lines).
# This logs the events worth seeing instead -- one line per enqueue, carrying the
# run_id so an API line can be matched to the worker line that executed it.
log = logging.getLogger("dc.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

# Separate logical DB from the broker (0) and results (1), so flushing one
# never takes the others with it.
_redis = redis.Redis.from_url(
    os.getenv("IDEMPOTENCY_REDIS_URL", "redis://redis:6379/2"),
    decode_responses=True,
)

# How long a repeated idempotency key is answered with the original run: 5 seconds,
# for the claim before the run is queued and for the confirmed run alike. It is there to
# absorb a double click or an immediate retry; a request after that is a new run, not a
# replay. A caller that retries later than this (a slow Airflow retry, say) gets a second run.
CLAIM_TTL_SECONDS = 5
COMPLETED_TTL_SECONDS = 5

# The engine already branches on these prefixes internally
# (execution_df_generator.py: config_id.str.startswith("DBC"/"FBC")), so the
# convention is load-bearing whether or not the caller restates it. Deriving it
# here removes a whole class of caller error -- a payload claiming
# check_type="custom_check" alongside config_id="DBC0001" is not expressible.
_PREFIX_TO_CHECK_TYPE = {
    "DBC": "traditional",    # db_based_checks_config
    "FBC": "traditional",    # file_based_checks_config
    "CBC": "custom_check",   # custom_business_checks_config
    # Kept alongside CBC because Data_Code/custom_checks/functions.py:446 still
    # generates ids with prefix="CB". Accepting both means neither an existing
    # CB id nor a new CBC one is rejected. Order does not matter here -- the
    # pattern is built longest-prefix-first below, so CBC0001 can never be
    # mis-parsed as CB followed by a non-numeric "C0001".
    "CB": "custom_check",
}

# Longest prefix first so a future longer code can never be shadowed by a
# shorter one that happens to be its prefix. Python's alternation is ordered,
# so this ordering is load-bearing, not cosmetic.
_PREFIXES_LONGEST_FIRST = sorted(_PREFIX_TO_CHECK_TYPE, key=len, reverse=True)
_CONFIG_ID_PATTERN = re.compile(r"^(" + "|".join(_PREFIXES_LONGEST_FIRST) + r")([0-9]+)$")

_EXPECTED_SHAPE = ", ".join(p + "<digits>" for p in sorted(_PREFIX_TO_CHECK_TYPE))


def _parse_config_id(raw: Any) -> tuple[str, str]:
    """
    Validate a config_id and derive its check type from the prefix.

    Returns (normalized_config_id, check_type). Raises HTTPException(400) with a
    specific reason -- the whole point of parsing here is that a malformed id
    fails at submit, in front of the caller, instead of surfacing as a confusing
    "no checks to execute" from a worker minutes later.
    """
    if not isinstance(raw, str):
        raise HTTPException(
            status_code=400,
            detail="config_id must be a string, got " + type(raw).__name__,
        )

    # Trim only. Case is deliberately NOT normalized: the downstream lookup is an
    # exact match on the DB, so silently upper-casing "dbc0001" would convert a
    # caller typo into a "config not found" deep in a worker rather than a clear
    # 400 here. Reject it and say so.
    config_id = raw.strip()
    if not config_id:
        raise HTTPException(status_code=400, detail="config_id must not be empty")

    match = _CONFIG_ID_PATTERN.match(config_id)
    if not match:
        hint = ""
        if config_id.upper() != config_id and _CONFIG_ID_PATTERN.match(config_id.upper()):
            hint = " Config ids are upper-case; did you mean " + repr(config_id.upper()) + "?"
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot determine check type from config_id " + repr(config_id)
                + ". Expected one of: " + _EXPECTED_SHAPE + "." + hint
            ),
        )

    return config_id, _PREFIX_TO_CHECK_TYPE[match.group(1)]


class RunRequest(BaseModel):
    # Union accepts a list so the batch SHAPE is reserved in the contract now and
    # callers get a deliberate 501 rather than a schema error -- but it is
    # rejected below. Two reasons it stays blocked: the engine keeps only the
    # FIRST element's check_type and silently runs the rest as that type
    # (dc_engine.py:166), so a mixed-prefix batch is quietly wrong; and batching
    # serialises the configs inside one worker, which is the opposite of what
    # concurrency testing needs.
    config_id: Union[str, List[str]] = Field(
        ...,
        description="DBC*/FBC* (traditional) or CB* (custom). Prefix decides the type. A list is reserved, not yet supported.",
    )
    user_id: str = Field(..., description="Must exist in the product DB users table")
    idempotency_key: Optional[str] = Field(
        None,
        description=(
            "Stable across retries of ONE attempt, different for a new attempt. "
            "Airflow should pass its dag_run_id. Omitted = no replay protection."
        ),
    )
    run_id: Optional[str] = Field(
        None,
        description=(
            "A UUID chosen by the caller. The backend sets it when it holds a run while the "
            "engine is unreachable, so the run keeps ONE id from the click to the result; "
            "sending the same run_id again returns the existing run instead of starting a second. "
            "Omitted = the engine picks one."
        ),
    )
    priority: int = Field(
        5,
        ge=0,
        le=9,
        description="9 = most urgent, 0 = least. Default 5. A UI click should outrank a scheduled batch.",
    )


class RunAccepted(BaseModel):
    run_id: str
    state: str
    duplicate: bool = False
    submitted_at: float


def _to_broker_priority(api_priority: int) -> int:
    """
    Flip the caller-facing scale to the broker's.

    Redis/kombu treat 0 as the MOST urgent, which is the reverse of RabbitMQ and
    the reverse of what everyone assumes. Rather than document a backwards scale
    and have callers get it wrong in a way nothing detects, the API takes the
    intuitive "9 = most urgent" and inverts here, in one place.
    """
    return 9 - api_priority


def _request_hash(config_ids: Union[str, List[str]], user_id: str) -> str:
    """
    Fingerprint of the WORK being requested: the config id(s) plus the acting
    user, and nothing else.

    Two separate protections, and both are needed:

      * user_id is in the redis KEY, so two different users sending the same
        idempotency_key never collide -- user B's click is always its own run.
        It also stops A guessing B's key to learn B's run_id.
      * user_id is in this HASH as well, so a key that somehow crossed users
        would be caught as a mismatch rather than replayed.

    Built from a canonical JSON form (sorted ids, sorted keys, no whitespace) so
    the same request always hashes identically, and so adding batch support later
    does not silently change the fingerprint of existing single-id requests.
    """
    ids = [config_ids] if isinstance(config_ids, str) else sorted(config_ids)
    canonical = json.dumps({"config_ids": ids, "user_id": user_id}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


@api.get("/health")
def health():
    """Liveness plus dependency reachability -- a 200 here with a dead broker
    would let a load test queue thousands of runs that never execute."""
    try:
        conn = celery_app.connection()
        conn.ensure_connection(max_retries=1, timeout=2)
        conn.release()
        broker = "up"
    except Exception as exc:
        broker = "down: " + type(exc).__name__
    try:
        _redis.ping()
        idem = "up"
    except Exception as exc:
        idem = "down: " + type(exc).__name__
    return {"status": "ok", "broker": broker, "idempotency_store": idem}


@api.post("/v1/runs", response_model=RunAccepted)
def submit_run(req: RunRequest, response: Response):
    """
    Enqueue one check run. Returns immediately -- this never blocks on
    execution, so the API stays flat under load and the queue absorbs the burst.

      202 + duplicate=false  -> a new run was created
      200 + duplicate=true   -> this attempt was already submitted; same run_id
      400                    -> malformed/unrecognised config_id
      409                    -> key reused with a different payload (caller bug)
      501                    -> a list of config_ids (reserved, not implemented)
      503                    -> broker unreachable; claim released, safe to retry
    """
    if isinstance(req.config_id, list):
        raise HTTPException(
            status_code=501,
            detail=(
                "Multiple config_ids are not supported yet -- send one per request. "
                "The engine would run them serially inside a single worker, and a "
                "mixed-prefix list is silently coerced to the first entry's check type."
            ),
        )

    config_id, check_type = _parse_config_id(req.config_id)

    # Rebuilt into the engine's native 2-element shape. The custom path takes
    # check_id and rejects config_id/checklist outright, so the two payloads are
    # not interchangeable (Data_Code/custom_checks/functions.py).
    if check_type == "custom_check":
        check_item = {"check_type": check_type, "check_id": config_id}
    else:
        # "default" is hardcoded because nothing downstream reads it:
        # tc_json_validator validates the field and no execution path consumes
        # it. Accepting it from callers would imply a behaviour that isn't there.
        check_item = {"check_type": check_type, "config_id": config_id, "checklist": "default"}
    payload = [{"user_id": req.user_id}, check_item]

    if req.run_id:
        try:
            run_id = str(uuid.UUID(req.run_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="run_id must be a UUID")
    else:
        run_id = str(uuid.uuid4())
    key = ("idem:" + req.user_id + ":" + req.idempotency_key) if req.idempotency_key else None
    req_hash = _request_hash(config_id, req.user_id)

    # True only if THIS request won the claim, so the TTL extension below never
    # touches a key another request owns.
    owns_claim = False

    if key:
        # run_id is generated BEFORE the claim and stored as the value, so there
        # is no window where the key exists but its run_id is unknown. NX makes
        # exactly one concurrent caller the winner.
        try:
            claimed = _redis.set(
                key,
                json.dumps({"run_id": run_id, "request_hash": req_hash}),
                nx=True,
                ex=CLAIM_TTL_SECONDS,
            )
            existing = None if claimed else _redis.get(key)
        except redis.RedisError as exc:
            # Fail CLOSED, and as 503 rather than a bare 500: 503 tells the
            # caller this is transient and safe to retry, where 500 reads as a
            # bug. Closed rather than open because proceeding without the claim
            # is exactly the duplicate run this endpoint exists to prevent --
            # and the store shares a server with the broker, so if it is
            # unreachable the enqueue was almost certainly going to fail anyway.
            log.error("idempotency store unreachable: %s", exc)
            raise HTTPException(
                status_code=503,
                detail="idempotency store unavailable: " + type(exc).__name__,
            )

        owns_claim = bool(claimed)

        if not claimed:
            if existing is None:
                # Claim expired between the SET and the GET. Proceed as fresh
                # rather than 500: the worst case is the duplicate we were
                # avoiding, which beats failing a legitimate request. Note
                # owns_claim stays False, so we will not extend a key that may
                # by now belong to a different request.
                log.warning("idempotency key %s vanished mid-check; proceeding as new", key)
            else:
                try:
                    prior = json.loads(existing)
                    prior_hash = prior["request_hash"]
                    prior_run_id = prior["run_id"]
                except (ValueError, KeyError, TypeError):
                    # Unreadable value -- a corrupt entry, or one written by an
                    # older version with a different shape. Treating it as a
                    # replay would hand back a garbage run_id, so refuse and let
                    # the caller use a fresh key rather than guess.
                    log.error("corrupt idempotency entry at %s: %r", key, existing)
                    raise HTTPException(
                        status_code=409,
                        detail="idempotency key holds an unreadable record; retry with a new key",
                    )
                if prior_hash != req_hash:
                    # Silently returning the prior run_id would leave the caller
                    # watching a run for a DIFFERENT config while theirs never
                    # started. Fail loudly instead.
                    raise HTTPException(
                        status_code=409,
                        detail="idempotency key already used with a different payload",
                    )
                state = celery_app.AsyncResult(prior_run_id).state
                if state in ("FAILURE", "REVOKED"):
                    # A failed or cancelled attempt is not worth replaying: the caller is
                    # retrying precisely because it did not work, often after fixing
                    # something. Hand the key to this request and run again.
                    log.info(
                        "RETRY after %s run_id=%s key=%s", state, prior_run_id, req.idempotency_key
                    )
                    try:
                        _redis.set(
                            key,
                            json.dumps({"run_id": run_id, "request_hash": req_hash}),
                            ex=CLAIM_TTL_SECONDS,
                        )
                    except redis.RedisError as exc:
                        log.error("idempotency store unreachable: %s", exc)
                        raise HTTPException(
                            status_code=503,
                            detail="idempotency store unavailable: " + type(exc).__name__,
                        )
                    owns_claim = True
                else:
                    log.info(
                        "REPLAY run_id=%s key=%s state=%s",
                        prior_run_id, req.idempotency_key, state,
                    )
                    response.status_code = 200
                    return RunAccepted(
                        run_id=prior_run_id,
                        state=state,
                        duplicate=True,
                        submitted_at=time.time(),
                    )

    # A caller-chosen run_id is claimed once, so a retry of the same hand-over (the backend
    # re-sending a held run, or sending it twice after a crash) returns the run that exists
    # instead of starting a second one.
    owns_run_id = False

    if req.run_id:
        try:
            owns_run_id = bool(_redis.set("run:" + run_id, "1", nx=True, ex=7 * 24 * 3600))
        except redis.RedisError as exc:
            log.error("run id store unreachable: %s", exc)
            raise HTTPException(status_code=503, detail="run id store unavailable: " + type(exc).__name__)

        if not owns_run_id:
            log.info("REPLAY run_id=%s (already accepted)", run_id)
            response.status_code = 200
            return RunAccepted(
                run_id=run_id,
                state=celery_app.AsyncResult(run_id).state,
                duplicate=True,
                submitted_at=time.time(),
            )

    try:
        celery_app.send_task(
            "dc.run_check",
            args=[payload],
            task_id=run_id,
            priority=_to_broker_priority(req.priority),
        )
    except Exception as exc:
        if owns_run_id:
            try:
                _redis.delete("run:" + run_id)
            except redis.RedisError:
                log.warning("could not release run id %s", run_id)
        # Release the claim so the caller's retry is not permanently answered
        # with a run_id for a task that was never enqueued. Guarded by
        # owns_claim: on the expired-claim path above another request may now
        # hold this key, and deleting it would strip THEIR replay protection.
        if key and owns_claim:
            try:
                _redis.delete(key)
            except redis.RedisError:
                # Best effort. The short claim TTL expires it anyway.
                log.warning("could not release claim %s", key)
        log.error("ENQUEUE FAILED run_id=%s: %s", run_id, exc)
        raise HTTPException(status_code=503, detail="could not enqueue: " + type(exc).__name__)

    if key and owns_claim:
        try:
            _redis.expire(key, COMPLETED_TTL_SECONDS)
        except redis.RedisError:
            # The run is already queued; losing the extension only shortens the
            # replay window to CLAIM_TTL_SECONDS. Not worth failing the request.
            log.warning("could not extend claim %s to full TTL", key)

    log.info(
        "ENQUEUED run_id=%s config_id=%s check_type=%s priority=%s user_id=%s key=%s",
        run_id, config_id, check_type, req.priority, req.user_id, req.idempotency_key,
    )
    response.status_code = 202
    return RunAccepted(run_id=run_id, state="QUEUED", duplicate=False, submitted_at=time.time())


@api.get("/v1/runs/{run_id}")
def get_run(run_id: str):
    """
    PENDING means queued *or* unknown -- Celery cannot tell an unstarted task
    from a nonexistent one, so do not read it as proof the run exists.
    """
    res = celery_app.AsyncResult(run_id)
    body: dict[str, Any] = {"run_id": run_id, "state": res.state}
    if res.successful():
        body["result"] = res.result
    elif res.failed():
        # Read by people in the Jobs page. A short title and a plain reason for the business
        # reader, and the raw exception plus traceback for the developer (capped, so one huge
        # error cannot bloat the record). The same detail also stays in the worker log.
        info = explain_failure(res.result, res.traceback or "")
        body["error"] = info["reason"]
        body["error_title"] = info["title"]
        # client = the person can fix it, service = a dependency is unavailable (try again),
        # server = the engine is at fault or the cause is unknown.
        body["error_kind"] = info["kind"]
        body["error_detail"] = info["detail"][:20000]
        # A failed task has no result payload, but Celery still records when it ended.
        if res.date_done:
            body["finished_at"] = res.date_done.isoformat()
    return body
