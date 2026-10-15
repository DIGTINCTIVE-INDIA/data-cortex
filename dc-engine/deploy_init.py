"""
One-click deploy bootstrap: creates every table on a fresh database, corrects
drifted schema on an existing one (never drops/truncates data), and hard-fails
if anything the ORM expects still doesn't match afterward -- an incompatible
schema blocks deployment instead of surfacing as a runtime crash mid-job.

Does NOT create any users -- that's a separate, manual step you run yourself
against the target database once this succeeds.

Reads connection info the same way the rest of the app does (.env via
Data_Code.common.database), so point .env at the target database before
running this -- it does not hardcode any host/db.

Usage:
    python deploy_init.py
"""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_ROOT)

from Data_Code.common.database import init_db, get_engine  # noqa: E402

engine = get_engine()
print(f"Target database: {engine.url.database}")

init_db(force=True)

print("Schema initialized/corrected and validated -- all ORM tables/columns present.")
print("No user was created. Create the first user manually against this database.")
