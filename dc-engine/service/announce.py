"""
Tells the backend "I am up". The engine side of the engine-state handshake.

The backend keeps its own record of whether the engine is up. It learns "down" when a hand-over
fails, and learns "up" from this ping (or from its own check when the backend restarts). The
engine never tracks the backend's state and never announces that it is going down.

Two ways to send it:

  1. Automatically, once, when the engine API starts. Fire and forget: a background thread sends
     one POST and moves on, whatever the answer is -- nothing answers, an error, a refusal, all
     the same. Nothing is retried.

  2. By a developer, on demand, to say "the engine is up" to a backend that has marked it down
     (for example after a network blip, or Redis recovering without the engine restarting):

         docker exec dc-engine-api-1 python -m service.announce

     That prints what happened and exits non-zero if the backend could not be told.

Needs BACKEND_URL (for example http://host.docker.internal:3000) and the shared secret
DC_ENGINE_CALLBACK_SECRET, the one the backend already uses for engine callbacks. With BACKEND_URL
unset it does nothing, which is how an engine with no backend is run.
"""

import datetime
import json
import logging
import os
import sys
import threading
import urllib.error
import urllib.request

log = logging.getLogger("dc_engine.announce")

ENDPOINT = "/api/engine/started"


def send() -> str:
    """Send one announcement. Returns a short description of the outcome; raises on failure."""
    base = (os.getenv("BACKEND_URL") or "").rstrip("/")
    secret = os.getenv("DC_ENGINE_CALLBACK_SECRET") or ""

    if not base:
        raise RuntimeError("BACKEND_URL is not set")

    body = {"engine": "dc-engine", "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    request = urllib.request.Request(
        base + ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-dc-engine-secret": secret},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return f"the backend at {base} answered {response.status}"
    except urllib.error.HTTPError as exc:
        # The backend was reached and refused (for example a wrong secret). Still an answer.
        raise RuntimeError(f"the backend at {base} refused it with HTTP {exc.code}") from exc


def _fire_and_forget() -> None:
    try:
        log.info("announced startup: %s", send())
    except Exception as exc:  # noqa: BLE001 -- by design the result is not our concern
        log.info("startup announcement not delivered (%s); not retrying", exc)


def start_announcing() -> None:
    threading.Thread(target=_fire_and_forget, name="announce-started", daemon=True).start()


if __name__ == "__main__":
    # The developer command. Unlike the automatic ping, the person running it wants the answer.
    try:
        print("Told the backend the engine is up:", send())
    except Exception as exc:  # noqa: BLE001
        print("Could not tell the backend:", exc)
        sys.exit(1)
