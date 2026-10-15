"""
Audit every stored custom check against the save-time SQL validator.

Read-only. Lists the checks whose sql_query the new validator would reject, so
they can be rewritten before the validator starts enforcing it on save.

This is the authoritative answer for Batch 0 check 8 and deploy step 10 -- it
runs the exact same function the application runs (validate_custom_check_sql),
rather than a coarse text scan.

Usage:
    python scripts/audit_custom_check_sql.py

Reads the target database from .env (RDS_*), like the rest of the app.
Exit code is 0 when every check passes, 1 when any would be rejected.
"""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from sqlalchemy import text  # noqa: E402

from Data_Code.common.database import get_engine  # noqa: E402
from Data_Code.custom_checks.functions import validate_custom_check_sql  # noqa: E402


def main() -> int:
    engine = get_engine()
    print(f"Target database: {engine.url.database}\n")

    # Raw SELECT of just the three columns this needs, not the ORM: this runs
    # as a Batch 0 pre-check, before the Batch 1 migration adds
    # source_table_name, so the ORM's view of the table doesn't match the
    # database yet.
    with engine.connect() as conn:
        checks = conn.execute(text(
            "SELECT check_id, check_name, sql_query "
            "FROM custom_business_checks_config ORDER BY check_id"
        )).fetchall()

    if not checks:
        print("No custom checks stored -- nothing to audit.")
        return 0

    rejected = []
    for check_id, check_name, sql_query in checks:
        try:
            source_table = validate_custom_check_sql(sql_query)
        except Exception as e:
            rejected.append((check_id, check_name, sql_query, str(e)))
        else:
            print(f"  OK      {check_id}  source table: {source_table}")

    for check_id, check_name, sql_query, reason in rejected:
        print(f"\n  REJECT  {check_id} ({check_name})")
        print(f"          {reason}")
        print(f"          sql_query: {(sql_query or '').strip()[:300]}")

    print(
        f"\n{len(checks) - len(rejected)} of {len(checks)} custom check(s) pass. "
        f"{len(rejected)} need rewriting."
    )
    return 1 if rejected else 0


if __name__ == "__main__":
    sys.exit(main())
