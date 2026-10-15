"""
Fetches connection metadata (db_schema, database_type) for the set of
connection_ids referenced by a job's execution dataframe.
"""
from typing import Any, Callable, Iterable

import pandas as pd

from trad_ct_id.db_connection import get_connection_details


def normalize_database_type(details: dict) -> Any:
    """
    Single choke point that turns whatever's actually stored in
    database_connection.database_type into the one concrete spelling every
    downstream dispatch (quote_identifier, cursor_factory, sql_tempelate's
    dict lookups, etc.) is written against: "postgresql".

    Two things get normalized here, both for the same reason -- so nothing
    downstream needs its own special case:
    - "rds" is a generic connection-layer database_type (used so the
      connector dispatch layer can pick host/mysql/postgres sub-behavior via
      additional_params.engine), not a concrete engine.
    - "postgres" is the actual value stored in the real database_type_enum
      on the shared/RDS metadata database (it only permits
      'postgres'/'mysql'/'snowflake', not 'postgresql') -- callers should
      always WRITE "postgres" to match that constraint, and this function is
      what lets every READ path keep assuming "postgresql" without change.
    """
    database_type = details.get("database_type")
    if database_type == "rds":
        return (details.get("additional_params") or {}).get("engine", "postgresql")
    if database_type == "postgres":
        return "postgresql"
    return database_type


def fetch_connection_metadata(connection: Any, allowed_connection_ids: Iterable[str], log_system: Callable) -> pd.DataFrame:
    """
    Returns one row per connection_id in allowed_connection_ids, with columns:
    connection_id, db_schema, database_type.

    ``connection`` is accepted for interface compatibility with the caller
    (ExecutionPipeline opens it via a ``with`` block) but isn't used here --
    connection metadata comes from the app's own database_connection table via
    get_connection_details, not from a source/target data connection.
    """
    connection_ids = list(allowed_connection_ids)
    rows = []

    for connection_id in connection_ids:
        try:
            details = get_connection_details(connection_id)
        except Exception as e:
            log_system(
                "CONNECTION_METADATA_FETCH_FAILED",
                "ERROR",
                f"Could not fetch connection metadata for {connection_id}: {str(e)}",
                {"connection_id": connection_id},
            )
            raise

        rows.append({
            "connection_id": connection_id,
            "db_schema": details.get("db_schema"),
            "database_type": normalize_database_type(details),
        })

    log_system(
        "CONNECTION_METADATA_FETCHED",
        "INFO",
        f"Fetched metadata for {len(rows)} connection(s)",
        {"connection_ids": connection_ids},
    )

    return pd.DataFrame(rows)
