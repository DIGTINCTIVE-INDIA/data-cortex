"""
Simple manual trigger: runs a config payload through the real pipeline entry
point (dc_engine.run_dc_engine). Points at the local `data_cortex` database
by default.

Usage:
    python trigger.py                          # reads config.json in this same folder
    python trigger.py path\\to\\my.json          # reads a specific config file
    python trigger.py --json '[{"user_id": "..."}, {"check_type": "traditional", "config_id": "DBC001", "checklist": "default"}]'
                                                # payload passed directly, e.g. by an external caller/process
"""
import os
import sys
import json
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(PROJECT_ROOT, "logs", "pipeline_engine.log")


class _Tee:
    """Writes to the real stream and appends the same bytes to LOG_PATH, so
    every trigger.py run (however it's invoked -- manually, or spawned by
    core-server when someone clicks Run in the UI) is watchable live via
    `Get-Content -Wait` / `tail -f` on LOG_PATH, not just printed to whichever
    process happened to spawn it."""

    def __init__(self, stream, log_file):
        self._stream = stream
        self._log_file = log_file

    def write(self, data):
        self._stream.write(data)
        self._log_file.write(data)
        self._log_file.flush()

    def flush(self):
        self._stream.flush()
        self._log_file.flush()


os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
_log_file = open(LOG_PATH, "a", encoding="utf-8")
_log_file.write(f"\n{'=' * 80}\n[{datetime.now().isoformat()}] trigger.py run (pid={os.getpid()})\n{'=' * 80}\n")
_log_file.flush()
sys.stdout = _Tee(sys.stdout, _log_file)
sys.stderr = _Tee(sys.stderr, _log_file)

# # Point the app at the local data_cortex database.
# os.environ.setdefault("RDS_TYPE", "postgresql")
# os.environ.setdefault("RDS_HOST", "localhost")
# os.environ.setdefault("RDS_PORT", "5432")
# os.environ.setdefault("RDS_USERNAME", "postgres")
# os.environ.setdefault("RDS_PASSWORD", "password")
# os.environ.setdefault("RDS_DATABASE", "data_cortex")
# os.environ.setdefault("RDS_SCHEMA", "public")
# os.environ.setdefault("RDS_RESULTS_SCHEMA", "public")
# os.environ.setdefault(
#     "DATABASE_URL",
#     "postgresql+psycopg2://postgres:password@localhost:5432/data_cortex",
# )

sys.path.insert(0, PROJECT_ROOT)

if len(sys.argv) > 1 and sys.argv[1] == "--json":
    if len(sys.argv) < 3:
        print("Usage: python trigger.py --json '<json payload>'")
        sys.exit(1)
    payload = json.loads(sys.argv[2])
    print("Loaded config from: --json argument")
else:
    config_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROJECT_ROOT, "config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    print(f"Loaded config from: {config_path}")

print(f"Payload: {payload}")

import dc_engine  # noqa: E402

status = dc_engine.run_dc_engine(payload)

print()
print("STATUS:", status)
