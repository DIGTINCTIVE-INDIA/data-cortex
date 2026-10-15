"""
Celery app shared by the API (which only enqueues) and the workers (which execute).

Deliberately imports nothing from the engine. The API imports this module to
dispatch by task NAME via send_task, so the ~160MB engine import stays out of
the API process entirely -- see tasks.py for the side that does pay it.
"""
import os

from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1")

app = Celery("dc_engine", broker=BROKER_URL, backend=RESULT_BACKEND)

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,

    # A check run is long and its duration varies wildly with table size. The
    # default prefetch of 4 lets one worker reserve several runs and sit on them
    # behind a slow one while other workers idle -- throughput collapses in
    # exactly the concurrency test this is built for.
    worker_prefetch_multiplier=1,

    # dc_engine keeps per-run state in module globals (job_id, job_timestamp,
    # system_logs, validation_logs) that are never reset between runs in a
    # process. Recycling the child bounds how far any leakage can carry.
    worker_max_tasks_per_child=50,

    # Report STARTED so the API can distinguish "queued" from "running" -- the
    # two look identical to a caller otherwise, which makes queue-depth
    # measurements meaningless.
    task_track_started=True,

    result_expires=int(os.getenv("CELERY_RESULT_EXPIRES", "86400")),
    broker_connection_retry_on_startup=True,

    # Priority support. Redis has no native priority queue, so kombu emulates it
    # with one Redis list per step ("celery", "celery\x06\x163", ...) and drains
    # them in order. Without priority_steps + queue_order_strategy the priority
    # argument is accepted and then silently ignored -- the single most common
    # way this feature appears to work but doesn't.
    #
    # IMPORTANT: on Redis, LOWER number = HIGHER priority (0 is most urgent).
    # That is the opposite of RabbitMQ. The API inverts it so callers get the
    # intuitive "9 = most urgent" -- see _to_broker_priority in api.py.
    task_queue_max_priority=9,
    task_default_priority=5,
    broker_transport_options={
        "priority_steps": list(range(10)),
        "sep": ":",
        "queue_order_strategy": "priority",
    },
)
