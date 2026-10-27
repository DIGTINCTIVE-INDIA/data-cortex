import os
import json
import re
import uuid
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple, Callable

import pandas as pd
from sqlalchemy import text

# Internal imports
from .models import CustomCheckConfig
from Data_Code.connectors.db.manager import DatabaseConnectionManager
from Data_Code.common.database import get_db_session, get_engine, resolve_label_id
from Data_Code.common.id_generation import (
    CUSTOM_BUSINESS_CHECKS_CONFIG_ID_SEQ,
    next_sequential_id,
)
from Data_Code.common.failure_text import readable_failure
from Data_Code.common.sanitization import sanitize_identifier_fragment
from Data_Code.common.safe_cleanup import safe_close, safe_call
from Data_Code.common.exceptions import (
    DataCodePersistenceError,
    DataCodeQueryExecutionError,
    DataCodeValidationError,
)

from trad_ct_id.connection_metadata import normalize_database_type
from trad_ct_id.cursor_factory import get_cursor
from trad_ct_id.value_converter import quote_identifier
from trad_ct_id.table_processors import create_landing_table
from trad_ct_id.loaders.file_copy_loader import export_rows_to_csv
from trad_ct_id.invalid_table_loader import load_csv_postgresql, load_csv_snowflake, drop_err_table

# -----------------------------------------------------------------------------
# Template Management Functions
# -----------------------------------------------------------------------------

_REQUIRED_CUSTOM_CHECK_FIELDS = (
    "check_name",
    "sql_query",
    "workstream",
    "check_category",
    "data_source",
    "impacted_downstream",
    "source_connection_id",
    "target_connection_id",
    "target_table_prefix",
    "criticality",
    "error_message",
)


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _validate_custom_check_save_payload(
    payload: Dict[str, Any],
    log_validation_func: Callable,
) -> None:
    """Fail fast before DB write if any required (NN) field is missing."""
    errors = [
        f"{field} is required"
        for field in _REQUIRED_CUSTOM_CHECK_FIELDS
        if _is_blank(payload.get(field))
    ]
    if errors:
        msg = "Custom check validation failed: " + "; ".join(errors)
        log_validation_func(msg, context={"validation_errors": errors})
        raise DataCodeValidationError(msg)


def _sanitize_table_identifier(name: str) -> str:
    return sanitize_identifier_fragment(name) or "invalid_rows"


def _result_table_name(target_table_prefix: str, outcome: str, check_id: str = "") -> str:
    """``outcome`` is ``err`` or ``valid`` → e.g. ``users_err``."""
    prefix = _sanitize_table_identifier(target_table_prefix or check_id)
    safe_outcome = "err" if outcome == "err" else "valid"
    return f"{prefix}_{safe_outcome}"


def _invalid_table_name(target_table_prefix: str, check_id: str) -> str:
    return _result_table_name(target_table_prefix, "err", check_id)


def _invalid_history_table_name(target_table_prefix: str, check_id: str) -> str:
    """
    ``<prefix>_err_hist`` -- the accumulating failure history, mirroring what
    the traditional pipeline maintains, so a "failures over time" query works
    the same way regardless of check family.
    """
    return f"{_invalid_table_name(target_table_prefix, check_id)}_hist"


def _valid_table_name(target_table_prefix: str, check_id: str) -> str:
    return _result_table_name(target_table_prefix, "valid", check_id)


# SQL shapes a custom check may not use. Each one either makes the source
# table ambiguous (so there is nothing to split into _err / _valid) or changes
# the row grain, which the err/valid model assumes is unchanged.
_UNSUPPORTED_SQL_CONSTRUCTS = (
    ("JOIN", r"\bjoin\b"),
    ("WITH / CTE", r"\bwith\b"),
    ("UNION", r"\bunion\b"),
    ("INTERSECT", r"\bintersect\b"),
    ("EXCEPT", r"\bexcept\b"),
    ("GROUP BY", r"\bgroup\s+by\b"),
    ("HAVING", r"\bhaving\b"),
    ("window function (OVER)", r"\bover\s*\("),
)

# Aggregates are rejected for the same reason as GROUP BY: they collapse rows.
_AGGREGATE_FUNCTIONS = ("count", "sum", "avg", "min", "max", "array_agg", "string_agg")


def _strip_sql_noise(sql_query: str) -> str:
    """
    Remove comments and string/identifier literals from `sql_query`.

    Keyword scanning runs on the result, so a check whose WHERE compares
    against the literal 'GROUP BY' (or a column named "union") isn't rejected
    for text that was never SQL syntax in the first place.
    """
    without_comments = re.sub(r"--[^\n]*", " ", sql_query)
    without_comments = re.sub(r"/\*.*?\*/", " ", without_comments, flags=re.DOTALL)
    without_strings = re.sub(r"'(?:''|[^'])*'", " '' ", without_comments)
    return re.sub(r'"(?:""|[^"])*"', ' "" ', without_strings)


def validate_custom_check_sql(sql_query: Optional[str]) -> str:
    """
    Validate a user-supplied custom-check query at save time and return the
    source table reference it selects from.

    Accepts a single plain ``SELECT`` against one table, optionally with a
    ``WHERE``. Everything in ``_UNSUPPORTED_SQL_CONSTRUCTS`` is rejected with a
    message naming the construct, and so are aggregates.

    The point of doing this on save rather than at run time is that the user
    finds out immediately, while they're looking at the query, instead of the
    runtime parser quietly mis-reading the shape and producing a wrong
    err/valid split that looks like a successful check.

    Raises:
        DataCodeValidationError: if the query is empty, is not a single plain
            SELECT, uses an unsupported construct, or has no resolvable
            source table.
    """
    if not sql_query or not str(sql_query).strip():
        raise DataCodeValidationError("sql_query is required")

    query = str(sql_query).strip().rstrip(";").strip()
    scannable = _strip_sql_noise(query)

    if ";" in scannable.strip().rstrip(";"):
        raise DataCodeValidationError(
            "sql_query must be a single statement (found more than one ';'-separated statement)"
        )

    if not re.match(r"(?is)^\s*select\b", scannable):
        raise DataCodeValidationError(
            "sql_query must be a plain SELECT statement"
        )

    found = [
        label for label, pattern in _UNSUPPORTED_SQL_CONSTRUCTS
        if re.search(pattern, scannable, re.IGNORECASE)
    ]
    aggregates = [
        func.upper() for func in _AGGREGATE_FUNCTIONS
        if re.search(rf"\b{func}\s*\(", scannable, re.IGNORECASE)
    ]
    if aggregates:
        found.append(f"aggregate function ({', '.join(sorted(set(aggregates)))})")

    if found:
        raise DataCodeValidationError(
            "sql_query uses SQL a custom check does not support: "
            + ", ".join(found)
            + ". A custom check must be a plain SELECT over a single table, "
            "optionally filtered with WHERE, so its rows can be split into "
            "the _err and _valid tables. Rewrite the query, or raise the need "
            "for a richer check family."
        )

    source_table = _extract_source_table_reference(query)
    if not source_table:
        raise DataCodeValidationError(
            "Could not determine the source table from sql_query. A custom "
            "check must SELECT from a single named table (not a subquery)."
        )

    return source_table


def _extract_source_table_name(sql_query: Optional[str]) -> Optional[str]:
    """
    Best-effort extraction of the base table name from a SELECT query.
    """
    source_ref = _extract_source_table_reference(sql_query)
    if not source_ref:
        return None
    return source_ref.split(".")[-1].strip("`\"[]") or None


def _extract_source_table_reference(sql_query: Optional[str]) -> Optional[str]:
    """
    Best-effort extraction of the table reference used in the SQL FROM clause.
    """
    if not sql_query:
        return None

    query = sql_query.strip().rstrip(";")
    match = re.search(
        r"(?is)\bfrom\s+(.+?)(?:\s+\bwhere\b|\s+\bgroup\b|\s+\bhaving\b|\s+\border\b|\s+\blimit\b|\s+\bjoin\b|$)",
        query,
    )
    if not match:
        return None

    source_expr = match.group(1).strip()
    if not source_expr or source_expr.startswith("("):
        return None

    first_token = source_expr.split()[0].strip().rstrip(",")
    return first_token.strip("`\"[]") or None


def _find_where_clause(query: str) -> Optional[Tuple[int, int]]:
    """
    Locate the OUTER (paren-depth-0) WHERE clause in a single-statement SQL
    query, returning (condition_start, condition_end) character offsets into
    `query`, or None if no top-level WHERE is found.

    Paren-depth aware so a GROUP BY/HAVING/ORDER BY/LIMIT belonging to a
    nested subquery isn't mistaken for the outer clause's own boundary -- a
    plain (?s).+? regex does exactly that and truncates mid-query (and drops
    the closing paren) for any check whose WHERE contains a subquery with its
    own GROUP BY/HAVING, e.g. a duplicate-group check like
    "WHERE x IN (SELECT x FROM t GROUP BY x HAVING COUNT(*) > 1)".
    """
    boundary_re = re.compile(r"(group|having|order|limit)\b", re.IGNORECASE)
    where_re = re.compile(r"where\b", re.IGNORECASE)

    depth = 0
    where_start = None
    i = 0
    n = len(query)

    while i < n:
        ch = query[i]
        if ch == "(":
            depth += 1
            i += 1
            continue
        if ch == ")":
            depth -= 1
            i += 1
            continue
        if depth == 0:
            if where_start is None:
                m = where_re.match(query, i)
                if m:
                    where_start = m.end()
                    i = where_start
                    continue
            else:
                m = boundary_re.match(query, i)
                if m:
                    return (where_start, i)
        i += 1

    if where_start is not None:
        return (where_start, n)
    return None


def _build_complement_sql(
    sql_query: Optional[str],
    database_type: Optional[str] = None,
) -> Optional[str]:
    """
    Build a best-effort complement query by negating the top-level WHERE clause.

    Examples:
        SELECT * FROM t WHERE a = 1
            -> SELECT * FROM t WHERE NOT (a = 1)

        PostgreSQL (optional):
            SELECT * FROM t WHERE (a = 1) IS NOT TRUE
    """
    if not sql_query:
        return None

    query = sql_query.strip().rstrip(";")

    bounds = _find_where_clause(query)
    if not bounds:
        return None

    start, end = bounds
    condition = query[start:end].strip()
    if not condition:
        return None

    database_type = (database_type or "").strip().lower()

    # PostgreSQL supports "IS NOT TRUE", which preserves SQL three-valued logic.
    if database_type in {"postgres", "postgresql"}:
        complement = f"({condition}) IS NOT TRUE"
    else:
        # Portable SQL supported by Snowflake, PostgreSQL, MySQL, SQL Server, Oracle, SQLite, etc.
        complement = f"NOT ({condition})"

    prefix = query[:start].rstrip()
    suffix = query[end:].lstrip()
    return f"{prefix} {complement}" + (f" {suffix}" if suffix else "")




def _append_check_metadata(
    df: pd.DataFrame,
    check_id: str,
    error_message: Optional[str] = None,
    *,
    include_error_message: bool = False,
) -> pd.DataFrame:
    out = df.copy()
    out["check_run_time"] = datetime.now(timezone.utc)
    out["check_id"] = check_id
    if include_error_message and error_message:
        out["error_message"] = error_message
    return out


def _common_row_key_columns(source_df: pd.DataFrame, invalid_df: pd.DataFrame) -> List[str]:
    return [c for c in invalid_df.columns if c in source_df.columns]


def _compute_passed_rows(source_df: pd.DataFrame, invalid_df: pd.DataFrame) -> pd.DataFrame:
    """
    Rows in ``source_df`` that are not present in ``invalid_df`` (match on shared columns).
    """
    if source_df.empty:
        return source_df.copy()
    if invalid_df.empty:
        return source_df.copy()

    common = _common_row_key_columns(source_df, invalid_df)
    if not common:
        return pd.DataFrame()

    invalid_keys = invalid_df[common].drop_duplicates()
    merged = source_df.merge(invalid_keys, on=common, how="left", indicator=True)
    return merged.loc[merged["_merge"] == "left_only", source_df.columns].copy()


def _ensure_outcome_table_columns(
    cursor: Any,
    dialect: str,
    table_ref: str,
    physical_table_name: str,
    details: Dict[str, Any],
    df_columns: List[str],
    log_system_func: Callable,
) -> None:
    """Add any missing TEXT columns when the outcome table already exists."""
    quote_dialect = dialect if dialect in ("postgresql", "postgres", "mysql") else "postgresql"
    schema = (details.get("db_schema") or details.get("schema") or "").strip()
    database = (details.get("database_name") or details.get("database") or "").strip()
    existing: set = set()

    try:
        if (dialect == "postgresql" or dialect == "postgres") and schema:
            cursor.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                """,
                (schema, physical_table_name),
            )
            existing = {r[0] for r in cursor.fetchall()}
        elif dialect == "mysql" and database:
            cursor.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                """,
                (database, physical_table_name),
            )
            existing = {r[0] for r in cursor.fetchall()}
    except Exception as e:
        log_system_func(
            "OUTCOME_TABLE_COLUMN_LOOKUP_WARNING",
            "WARNING",
            f"Could not inspect existing columns for {physical_table_name}: {str(e)}",
            context={"table": physical_table_name},
        )
        return

    for col in df_columns:
        safe = _sanitize_table_identifier(str(col))
        if safe in existing or str(col) in existing:
            continue
        alter = (
            f"ALTER TABLE {table_ref} "
            f"ADD COLUMN {_quote_ident(safe, quote_dialect)} TEXT"
        )
        try:
            cursor.execute(alter)
            log_system_func(
                "OUTCOME_TABLE_COLUMN_ADDED",
                "INFO",
                f"Added column {safe} to {physical_table_name}",
                context={"table": physical_table_name, "column": safe},
            )
        except Exception as e:
            log_system_func(
                "OUTCOME_TABLE_COLUMN_ADD_WARNING",
                "WARNING",
                f"Could not add column {safe} to {physical_table_name}: {str(e)}",
                context={"table": physical_table_name, "column": safe},
            )


def generate_custom_check_id(log_system_func: Callable) -> str:
    """
    Creates a id like 'CBXXX' (e.g., CB001).
    """
    session = get_db_session()
    try:
        existing_ids = [cid for (cid,) in session.query(CustomCheckConfig.check_id).all()]
        new_id = next_sequential_id(
            session,
            sequence_name=CUSTOM_BUSINESS_CHECKS_CONFIG_ID_SEQ,
            prefix="CB",
            existing_ids=existing_ids,
        )
        log_system_func("ID_GEN_SUCCESS", "INFO", f"Generated new custom check ID: {new_id}", context={'new_id': new_id})
        return new_id
    except Exception as e:
        log_system_func("ID_GEN_ERROR", "ERROR", f"Failed to generate custom check ID: {str(e)}")
        raise DataCodePersistenceError(f"Failed to generate custom check ID: {str(e)}") from e
    finally:
        session.close()

def save_custom_check(
    check_name: str,
    sql_query: str,
    log_system_func: Callable,
    log_validation_func: Callable,
    check_description: Optional[str] = None,
    workstream: Optional[str] = None,
    check_category: Optional[str] = None,
    data_source: Optional[str] = None,
    impacted_downstream: Optional[str] = None,
    source_connection_id: Optional[str] = None,
    target_connection_id: Optional[str] = None,
    target_table_prefix: Optional[str] = None,
    criticality: Optional[str] = None,
    error_message: Optional[str] = None,
    check_id: Optional[str] = None,
    user_id: Optional[str] = None,
    # Legacy parameter names (mapped to new columns)
    table_name: Optional[str] = None,
    source_or_process: Optional[str] = None,
    connection_id: Optional[str] = None,
) -> str:
    """
    Saves values for the custom checks entered by the user.
    """
    resolved_source_conn = source_connection_id or connection_id
    resolved_target_conn = target_connection_id or resolved_source_conn
    resolved_table_prefix = target_table_prefix or table_name
    resolved_impacted = impacted_downstream or source_or_process
    resolved_user_id = user_id or "SYSTEM"

    _validate_custom_check_save_payload(
        {
            "check_name": check_name,
            "sql_query": sql_query,
            "workstream": workstream,
            "check_category": check_category,
            "data_source": data_source,
            "impacted_downstream": resolved_impacted,
            "source_connection_id": resolved_source_conn,
            "target_connection_id": resolved_target_conn,
            "target_table_prefix": resolved_table_prefix,
            "criticality": criticality,
            "error_message": error_message,
        },
        log_validation_func,
    )

    # Reject unsupported SQL shapes now, and remember the source table the
    # query selects from so nothing has to re-derive it at run time.
    resolved_source_table = validate_custom_check_sql(sql_query)

    session = get_db_session()
    try:
        new_id = check_id if check_id else generate_custom_check_id(log_system_func)

        # workstream/check_category/data_source are normalized lookup tables now
        # (matching the real dev DB) -- resolve the human-readable label to its
        # FK id, creating a new lookup row if this label hasn't been seen before.
        workstream_id = resolve_label_id(session, "workstream_library", "workstream_id", "workstream_name", workstream)
        check_category_id = resolve_label_id(session, "category_label_library", "category_id", "category_name", check_category)
        data_source_id = resolve_label_id(session, "data_source_library", "data_source_id", "data_source_name", data_source)
        # impacted_downstream is a lookup library like the other three. It was
        # left as raw text while they were normalized, which made the four
        # label dimensions behave inconsistently.
        impacted_downstream_id = resolve_label_id(
            session, "impacted_downstream_library",
            "impacted_downstream_id", "impacted_downstream_name", resolved_impacted
        )

        new_check = CustomCheckConfig(
            check_id=new_id,
            check_name=check_name,
            sql_query=sql_query,
            source_table_name=resolved_source_table,
            check_description=check_description,
            workstream=workstream_id,
            check_category=check_category_id,
            data_source=data_source_id,
            impacted_downstream=impacted_downstream_id,
            source_connection_id=resolved_source_conn,
            target_connection_id=resolved_target_conn,
            target_table_prefix=resolved_table_prefix,
            criticality=criticality,
            error_message=error_message,
            user_id=resolved_user_id,
        )
        session.add(new_check)
        session.commit()

        log_system_func("CHECK_SAVE_SUCCESS", "INFO", f"Custom check '{check_name}' saved successfully", context={'check_id': new_id, 'check_name': check_name})
        log_validation_func(f"Custom check '{check_name}' created with ID {new_id}", context={'check_id': new_id, 'check_name': check_name, 'criticality': criticality})
        return new_id
    except DataCodeValidationError:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        log_system_func("CHECK_SAVE_ERROR", "ERROR", f"Failed to save custom check: {str(e)}")
        raise DataCodePersistenceError(f"Failed to save custom check '{check_name}': {e}") from e
    finally:
        session.close()

def get_custom_check(check_id: str, log_system_func: Callable) -> Optional[Dict[str, Any]]:
    """
    Fetches the custom check template from DB.
    """
    session = get_db_session()
    try:
        check = session.query(CustomCheckConfig).filter_by(check_id=check_id).first()
        if not check:
            log_system_func("CHECK_NOT_FOUND", "WARNING", f"Custom check {check_id} not found", context={'check_id': check_id})
            return None
        
        log_system_func("CHECK_FETCH_SUCCESS", "INFO", f"Custom check {check_id} retrieved", context={'check_id': check_id})
        return check.to_dict()
    except Exception as e:
        log_system_func("CHECK_FETCH_ERROR", "ERROR", f"Error fetching custom check {check_id}: {str(e)}")
        raise DataCodePersistenceError(f"Error fetching custom check {check_id}: {str(e)}") from e
    finally:
        session.close()

def update_custom_check(
    check_id: str,
    log_system_func: Callable,
    log_validation_func: Callable,
    check_name: Optional[str] = None,
    sql_query: Optional[str] = None,
    check_description: Optional[str] = None,
    workstream: Optional[str] = None,
    check_category: Optional[str] = None,
    data_source: Optional[str] = None,
    impacted_downstream: Optional[str] = None,
    source_connection_id: Optional[str] = None,
    target_connection_id: Optional[str] = None,
    target_table_prefix: Optional[str] = None,
    criticality: Optional[str] = None,
    error_message: Optional[str] = None,
) -> bool:
    """
    Updates an existing custom check in place, by check_id. Unlike
    save_custom_check() (which always INSERTs a new row), this modifies only
    the fields explicitly passed, leaving the rest as-is.
    """
    session = get_db_session()
    try:
        check = session.query(CustomCheckConfig).filter_by(check_id=check_id).first()
        if not check:
            log_system_func("CHECK_UPDATE_NOT_FOUND", "WARNING", f"Cannot update: Custom check {check_id} not found", context={'check_id': check_id})
            return False

        if check_name is not None:
            check.check_name = check_name
        if sql_query is not None:
            # Same save-time validation as create: a query edited into an
            # unsupported shape must be rejected here, not discovered at run
            # time. Also refreshes the stored source table.
            check.source_table_name = validate_custom_check_sql(sql_query)
            check.sql_query = sql_query
        if check_description is not None:
            check.check_description = check_description
        if workstream is not None:
            check.workstream = resolve_label_id(session, "workstream_library", "workstream_id", "workstream_name", workstream)
        if check_category is not None:
            check.check_category = resolve_label_id(session, "category_label_library", "category_id", "category_name", check_category)
        if data_source is not None:
            check.data_source = resolve_label_id(session, "data_source_library", "data_source_id", "data_source_name", data_source)
        if impacted_downstream is not None:
            check.impacted_downstream = resolve_label_id(
                session, "impacted_downstream_library",
                "impacted_downstream_id", "impacted_downstream_name", impacted_downstream
            )
        if source_connection_id is not None:
            check.source_connection_id = source_connection_id
        if target_connection_id is not None:
            check.target_connection_id = target_connection_id
        if target_table_prefix is not None:
            check.target_table_prefix = target_table_prefix
        if criticality is not None:
            check.criticality = criticality
        if error_message is not None:
            check.error_message = error_message

        session.commit()
        log_system_func("CHECK_UPDATE_SUCCESS", "INFO", f"Custom check {check_id} updated successfully", context={'check_id': check_id})
        log_validation_func(f"Custom check {check_id} was updated", context={'check_id': check_id})
        return True
    except Exception as e:
        session.rollback()
        log_system_func("CHECK_UPDATE_ERROR", "ERROR", f"Failed to update custom check {check_id}: {str(e)}")
        raise DataCodePersistenceError(f"Failed to update custom check {check_id}: {e}") from e
    finally:
        session.close()


def delete_custom_check(check_id: str, log_system_func: Callable, log_validation_func: Callable = None) -> bool:
    """
    Deletes the custom check from the template table using ID.
    """
    session = get_db_session()
    try:
        check = session.query(CustomCheckConfig).filter_by(check_id=check_id).first()
        if not check:
            log_system_func("CHECK_DEL_NOT_FOUND", "WARNING", f"Cannot delete: Custom check {check_id} not found", context={'check_id': check_id})
            return False

        session.delete(check)
        session.commit()
        log_system_func("CHECK_DEL_SUCCESS", "INFO", f"Custom check {check_id} deleted successfully", context={'check_id': check_id})
        if log_validation_func:
            log_validation_func(f"Custom check {check_id} was deleted", context={'check_id': check_id})
        return True
    except Exception as e:
        session.rollback()
        log_system_func("CHECK_DEL_ERROR", "ERROR", f"Failed to delete custom check {check_id}: {str(e)}")
        raise DataCodePersistenceError(f"Failed to delete custom check {check_id}: {e}") from e
    finally:
        session.close()

def list_custom_checks(log_system_func: Callable) -> List[Dict[str, Any]]:
    """
    Returns all custom check templates.
    """
    session = get_db_session()
    try:
        checks = session.query(CustomCheckConfig).all()
        log_system_func("CHECK_LIST_SUCCESS", "INFO", f"Listed {len(checks)} custom checks", context={'count': len(checks)})
        return [check.to_dict() for check in checks]
    except Exception as e:
        log_system_func("CHECK_LIST_ERROR", "ERROR", f"Failed to list custom checks: {str(e)}")
        raise DataCodePersistenceError(f"Failed to list custom checks: {str(e)}") from e
    finally:
        session.close()

# -----------------------------------------------------------------------------
# Execution Functions
# -----------------------------------------------------------------------------

def validate_and_parse_json(json_input: Any, log_system_func: Callable, log_validation_func: Callable) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Validates and parses the JSON file provided by the user.
    """
    valid_items = []
    invalid_items = []
    
    log_system_func(
        "JSON_READABILITY_START", 
        "INFO", 
        "Starting JSON readability validation", 
        context={'step': 'validate_json_readability'}
    )

    try:
        # 1. Load Data
        if isinstance(json_input, str):
            if os.path.exists(json_input):
                with open(json_input, 'r') as f:
                    try:
                        data = json.load(f)
                    except json.JSONDecodeError as e:
                         log_system_func("JSON_LOAD_ERROR", "ERROR", f"Invalid JSON format in file: {e}")
                         return False, []
            else:
                try:
                    data = json.loads(json_input)
                except json.JSONDecodeError as e:
                     log_system_func("JSON_PARSE_ERROR", "ERROR", f"Invalid JSON string: {e}")
                     return False, []
        elif isinstance(json_input, list):
            data = json_input
        else:
            log_system_func("INVALID_INPUT_TYPE", "ERROR", "Input must be file path, JSON string, or list.")
            return False, []
        
        # 2. Normalize to List
        if isinstance(data, dict):
            data = [data]
        elif not isinstance(data, list):
             log_system_func("INVALID_DATA_STRUCTURE", "ERROR", "JSON data must be list or dict.")
             return False, []
             
        # 3. Empty List Check
        if not data:
            log_system_func("EMPTY_INPUT", "ERROR", "Input JSON array is empty.")
            return False, []

        # 4. Fetch Configs for Validation (Assuming no logs required for just fetch inside here unless error)
        try:
            all_checks = list_custom_checks(log_system_func)
            valid_check_ids = {c['check_id'] for c in all_checks}
            valid_config_ids_list = list(valid_check_ids) 
        except Exception as e:
            log_system_func("DB_FETCH_ERROR", "ERROR", f"Failed to fetch existing checks: {e}")
            return False, []
        
        allowed_keys = {'check_type', 'check_id', 'connection_id', 'check_category', 'custom_check_id'}
        
        # 5. Iterate and Validate Items
        for index, item in enumerate(data):
            is_item_valid = True
            
            if not isinstance(item, dict):
                log_validation_func(f"Configuration item at index {index} must be an object", context={'index': index, 'received_type': type(item).__name__})
                continue 
            
            item_keys = set(item.keys())
            
            # Check for missing keys
            if 'custom_check_id' not in item_keys and 'check_id' not in item_keys:
                log_validation_func(f"Configuration item at index {index} is missing required keys", context={'index': index, 'missing_keys': ['custom_check_id']})
                is_item_valid = False
            
            # Check for check_type validation
            if 'check_type' in item:
                if item['check_type'] != 'custom_check':
                    log_validation_func(f"Configuration item at index {index} has invalid check_type", context={'index': index, 'check_type': item['check_type']})
                    is_item_valid = False

            # Check for additional/unknown keys
            extra_keys = item_keys - allowed_keys
            if extra_keys:
                log_validation_func(f"Configuration item at index {index} contains unexpected keys", context={'index': index, 'extra_keys': list(extra_keys)})
                is_item_valid = False
            
            # ID Validation
            check_identifier = item.get('check_id')
            
            ids_to_check = []
            if check_identifier is not None:
                if isinstance(check_identifier, list):
                    ids_to_check = check_identifier
                elif isinstance(check_identifier, str):
                    ids_to_check = [check_identifier]
                else:
                     log_validation_func(f"Configuration item at index {index} has invalid config_id type", context={'index': index, 'expected_type': 'str or list', 'received_type': type(check_identifier).__name__})
                     is_item_valid = False
            
            for cid in ids_to_check:
                if not isinstance(cid, str):
                     log_validation_func(f"Configuration item at index {index} contains non-string ID", context={'index': index, 'received_item': str(cid)})
                     is_item_valid = False
                     continue

                # Format Check (CBXXXX). IDs are allocated by the monorepo's
                # id-generation.repo.ts, which pads to width 4 ("CB0002"), so the
                # old exactly-three-digits pattern rejected every real ID and no
                # custom check could ever run. Kept open-ended so the 10000th
                # check (five digits) does not break it again.
                if not re.match(r'^CB\d{3,}$', cid):
                    log_validation_func(f"Configuration item at index {index} has invalid check_id format", context={'index': index, 'check_id': cid, 'expected_format': 'CBXXX'})
                    is_item_valid = False
                
                # Existence Check
                if cid not in valid_check_ids:
                     log_validation_func(f"These are the valid check ids currently {valid_check_ids}")
                     log_validation_func(f"Configuration item at index {index} has unrecognized config_id", context={'index': index, 'config_id': cid, 'valid_config_ids': valid_config_ids_list[:10]})
                     is_item_valid = False

            # Connection ID Validation (Optional)
            if 'connection_id' in item:
                if not isinstance(item['connection_id'], str):
                     log_validation_func(f"Configuration item at index {index} has invalid connection_id type", context={'index': index, 'expected_type': 'str', 'received_type': type(item['connection_id']).__name__})
                     is_item_valid = False

            if is_item_valid:
                valid_items.append(item)
            else:
                invalid_items.append(item)
                log_system_func("JSON_VALIDATION_ITEM_INVALID", "DEBUG", f"Item {index} is invalid", context={'index': index, 'item_keys': list(item_keys), 'extra_keys': list(extra_keys), 'ids_to_check': ids_to_check})

        log_system_func("JSON_READABILITY_COMPLETE", "INFO", "JSON readability validation completed", context={'step': 'validate_json_readability', 'total_items': len(data), 'valid_items': len(valid_items)})

        # A rejected item is a check the caller asked for that will not run.
        # This used to return True regardless, so the workflow carried on with
        # whatever survived -- and when nothing survived it executed no checks,
        # computed "passed" over an empty result set and reported the job a
        # success. A request we cannot honour in full is a failure, not a pass.
        if invalid_items:
            rejected = [
                str(item.get('check_id') or item.get('custom_check_id') or '<no id>')
                for item in invalid_items
            ]
            log_system_func(
                "JSON_VALIDATION_REJECTED", "ERROR",
                f"Rejected {len(invalid_items)} of {len(data)} configuration item(s); "
                f"refusing to run a partial job.",
                context={'rejected': rejected, 'valid_items': len(valid_items)},
            )
            log_validation_func(
                "Configuration was rejected, so no custom checks were run",
                context={'rejected': rejected},
            )
            return False, []

        return True, valid_items

    except Exception as e:
        log_system_func("JSON_VALIDATION_CRITICAL_FAILURE", "CRITICAL", f"Critical failure in JSON validation: {str(e)}")
        return False, []

def create_custom_check_execution_df(parsed_items: List[Dict[str, Any]], log_system_func: Callable, log_validation_func: Callable) -> pd.DataFrame:
    """
    Creates a custom_check_execution_df containing all info required to run the custom_check.
    """

    try:
        # 1. Fetch all available custom checks
        all_checks = list_custom_checks(log_system_func)
        # Create a lookup dictionary for faster access
        checks_lookup = {c['check_id']: c for c in all_checks}
        
        execution_rows = []
        
        if not parsed_items:
             log_system_func("EXECUTION_DF_EMPTY", "WARNING", "No parsed items provided for execution DF creation.")

        # 2. Iterate through parsed items from JSON
        for item in parsed_items:
            # Handle list of check_ids
            check_ids_to_process = []
            if 'check_id' in item:
                if isinstance(item['check_id'], list):
                    check_ids_to_process = item['check_id']
                else:
                    check_ids_to_process = [item['check_id']]
            elif 'custom_check_id' in item:
                # custom_check_id is accepted as an alias for check_id (it has
                # always been in allowed_keys but was never read as the
                # identifier, so an item carrying only this key silently
                # no-oped). check_id wins when both are present.
                log_system_func(
                    "CONFIG_CUSTOM_CHECK_ID_ALIAS", "DEBUG",
                    "Item uses 'custom_check_id'; reading it as 'check_id'",
                    context={'custom_check_id': item['custom_check_id']},
                )
                if isinstance(item['custom_check_id'], list):
                    check_ids_to_process = item['custom_check_id']
                else:
                    check_ids_to_process = [item['custom_check_id']]
            
            for check_id in check_ids_to_process:
                # 3. Filter/Find the config
                config = checks_lookup.get(check_id)
                
                if not config:
                    log_system_func("CONFIG_NOT_FOUND", "WARNING", f"Custom check {check_id} not found in validated configuration", context={'check_id': check_id})
                    continue
                
                # Connection used to execute the SQL check
                source_conn_id = config.get('source_connection_id') or config.get('connection_id')
                if not source_conn_id:
                     source_conn_id = item.get('connection_id')

                if not source_conn_id:
                     log_system_func("MISSING_CONNECTION_ID", "WARNING", f"Skipping check {check_id}: No source_connection_id found.", context={'check_id': check_id})
                     continue

                row = {
                    'check_id': check_id,
                    'connection_id': source_conn_id,
                    'source_connection_id': source_conn_id,
                    'target_connection_id': config.get('target_connection_id') or source_conn_id,
                    'check_name': config.get('check_name'),
                    'check_category': config.get('check_category'),
                    'data_source': config.get('data_source') or source_conn_id,
                    'workstream': config.get('workstream'),
                    'criticality': config.get('criticality'),
                    'sql_query': config.get('sql_query'),
                    'source_table_ref': _extract_source_table_reference(config.get('sql_query')),
                    'source_table_name': _extract_source_table_name(config.get('sql_query')),
                    'table_name_prefix': config.get('table_name_prefix') or config.get('target_table_prefix') or config.get('table_name'),
                    'table_name': _extract_source_table_name(config.get('sql_query')) or config.get('target_table_prefix') or config.get('table_name'),
                    'target_table_prefix': config.get('table_name_prefix') or config.get('target_table_prefix') or config.get('table_name'),
                    'impacted_downstream': config.get('impacted_downstream') or config.get('source_or_process'),
                    'source_or_process': config.get('impacted_downstream') or config.get('source_or_process'),
                    'check_description': config.get('check_description'),
                    'error_message': config.get('error_message')
                }
                execution_rows.append(row)

        # for item in invalid_items:
        #     log_validation_func(f"Invalid configuration item skipped during execution DF creation", context={'invalid_item': item})
                
        execution_df = pd.DataFrame(execution_rows)
        log_system_func("EXECUTION_DF_CREATED", "INFO", f"Created custom_check_execution_df with {len(execution_df)} rows.", context={'row_count': len(execution_df)})
        return execution_df
        
    except Exception as e:
        log_system_func("EXECUTION_DF_CREATION_FAILED", "ERROR", f"Failed to create execution DF: {str(e)}")
        raise DataCodeValidationError(f"Failed to create execution DF: {str(e)}") from e

def _dataframe_to_sa_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Row dicts for SQLAlchemy insert; NULL out NaN/NA without pandas/sqlite quirks."""
    records: List[Dict[str, Any]] = []
    for rec in df.to_dict(orient="records"):
        row: Dict[str, Any] = {}
        for k, v in rec.items():
            if v is not None and not isinstance(v, (bytes, str, bool)) and pd.isna(v):
                row[k] = None
            else:
                row[k] = v
        records.append(row)
    return records


def _quote_ident(name: str, dialect: str) -> str:
    if dialect == "postgresql" or dialect == "postgres":
        return f'"{name}"'
    return f"`{name}`"


def _qualified_invalid_table_ref(details: Dict[str, Any], table_name: str) -> Tuple[str, str]:
    """Return (dialect_key, fully qualified table reference for DDL/DML)."""
    db_type = (details.get("database_type") or "").lower()
    schema = (details.get("db_schema") or details.get("schema") or "").strip()
    database = (details.get("database_name") or details.get("database") or "").strip()

    if db_type in ("postgresql", "postgres", "rds") and schema:
        return "postgresql", f'{_quote_ident(schema, "postgresql")}.{_quote_ident(table_name, "postgresql")}'
    if db_type == "mysql" and database:
        return "mysql", f'{_quote_ident(database, "mysql")}.{_quote_ident(table_name, "mysql")}'
    if db_type == "snowflake":
        parts = [p for p in (database, schema or "PUBLIC", table_name) if p]
        return "snowflake", ".".join(parts)
    return db_type or "generic", table_name


def _insert_outcome_rows_on_target(
    df: pd.DataFrame,
    physical_table_name: str,
    target_connection_id: str,
    details: Dict[str, Any],
    conn: Any,
    cursor: Any,
    log_system_func: Callable,
) -> int:
    """Create table if needed and insert rows; returns row count (0 if df empty)."""
    if df.empty:
        return 0

    dialect, table_ref = _qualified_invalid_table_ref(details, physical_table_name)
    quote_dialect = dialect if dialect in ("postgresql", "mysql") else "postgresql"

    col_defs = [
        f"{_quote_ident(_sanitize_table_identifier(str(col)), quote_dialect)} TEXT"
        for col in df.columns
    ]
    cursor.execute(f"CREATE TABLE IF NOT EXISTS {table_ref} ({', '.join(col_defs)})")
    _ensure_outcome_table_columns(
        cursor,
        dialect,
        table_ref,
        physical_table_name,
        details,
        list(df.columns),
        log_system_func,
    )

    safe_columns = [_sanitize_table_identifier(str(c)) for c in df.columns]
    placeholders = ", ".join(["%s"] * len(safe_columns))
    col_list = ", ".join(_quote_ident(c, quote_dialect) for c in safe_columns)
    insert_sql = f"INSERT INTO {table_ref} ({col_list}) VALUES ({placeholders})"

    for _, row in df.iterrows():
        values = [None if pd.isna(row[c]) else row[c] for c in df.columns]
        cursor.execute(insert_sql, values)

    return len(df)


def persist_check_row_split(
    invalid_df: pd.DataFrame,
    source_connection_id: str,
    target_connection_id: str,
    source_table_name: Optional[str],
    target_table_prefix: str,
    check_id: str,
    error_message: Optional[str],
    log_system_func: Callable,
    log_validation_func: Callable,
) -> Tuple[int, int, int]:
    """
    Persist fetched query rows as invalid to ``{prefix}_err`` on ``target_connection_id``.

    If ``source_table_name`` is provided, compute valid rows as the full source table
    minus the fetched query rows, then persist them to ``{prefix}_valid``.

    Returns ``(invalid_count, valid_count, source_total)``.
    """
    if _is_blank(target_connection_id):
        msg = "target_connection_id is required to persist check outcomes"
        log_validation_func(msg, context={"check_id": check_id})
        raise DataCodeValidationError(msg)

    db_manager = DatabaseConnectionManager(log_system_func, log_validation_func)
    details = db_manager.get_connection_details(target_connection_id)

    invalid_table = _invalid_table_name(target_table_prefix, check_id)
    valid_table = _valid_table_name(target_table_prefix, check_id)

    invalid_prepared = _append_check_metadata(
        invalid_df,
        check_id,
        error_message,
        include_error_message=True,
    )

    # If source_table_name is provided, fetch full source to compute passed rows
    # Otherwise, only work with query results
    source_total = len(invalid_df)
    valid_prepared = pd.DataFrame()

    if source_table_name:
        try:
            source_df = db_manager.get_table(source_connection_id, source_table_name)
            source_total = len(source_df)

            if not invalid_df.empty and not _common_row_key_columns(source_df, invalid_df):
                msg = (
                    f"Check {check_id}: SQL result columns must overlap source table '{source_table_name}' "
                    "columns to split valid vs invalid rows."
                )
                log_validation_func(msg, context={"check_id": check_id, "source_table": source_table_name})
                raise DataCodeValidationError(msg)

            passed_df = _compute_passed_rows(source_df, invalid_df)
            log_system_func("OUTCOME_COMPUTE_VALID", "DEBUG", f"Computing valid rows as source minus fetched invalid rows for check {check_id}")
            valid_prepared = _append_check_metadata(passed_df, check_id)
        except Exception as e:
            log_system_func(
                "SOURCE_TABLE_FETCH_WARNING",
                "WARNING",
                f"Check {check_id}: Could not fetch source table '{source_table_name}'; skipping passed rows computation: {str(e)}",
            )
    else:
        log_system_func(
            "SOURCE_TABLE_NOT_PROVIDED",
            "INFO",
            f"Check {check_id}: source_table_name not provided; persisting fetched rows as invalid only",
        )

    conn = None
    cursor = None
    try:
        conn = db_manager.get_connection(target_connection_id)
        cursor = conn.cursor()

        log_system_func("OUTCOME_TABLES_PREPARE", "DEBUG", f"Preparing outcome tables for check {check_id}", context={'invalid_table': invalid_table, 'valid_table': valid_table})

        invalid_count = _insert_outcome_rows_on_target(
            invalid_prepared, invalid_table, target_connection_id, details, conn, cursor, log_system_func
        )
        log_system_func("OUTCOME_INVALID_INSERTED", "INFO", f"Inserted {invalid_count} invalid row(s) into {invalid_table} for check {check_id}")

        # Only persist valid rows if source_table_name was provided
        valid_count = 0
        if source_table_name and not valid_prepared.empty:
            valid_count = _insert_outcome_rows_on_target(
                valid_prepared, valid_table, target_connection_id, details, conn, cursor, log_system_func
            )
            log_system_func("OUTCOME_VALID_INSERTED", "INFO", f"Inserted {valid_count} valid row(s) into {valid_table} for check {check_id}")
        else:
            log_system_func("OUTCOME_VALID_SKIPPED", "DEBUG", f"Valid rows were skipped for check {check_id} because source_table_name was not provided or is empty")

        if hasattr(conn, "commit"):
            conn.commit()

        log_msg = f"Check {check_id}: {invalid_count} invalid"
        if source_table_name:
            log_msg += f", {valid_count} valid (source had {source_total} rows)"
        else:
            log_msg += f" (from query results; source table not scanned)"

        log_system_func(
            "CHECK_OUTCOMES_PERSISTED",
            "INFO",
            log_msg,
            context={
                "check_id": check_id,
                "invalid_rows": invalid_count,
                "valid_rows": valid_count,
                "source_total": source_total,
                "invalid_table": invalid_table,
                "valid_table": valid_table if source_table_name else None,
                "target_connection_id": target_connection_id,
                "source_table_name": source_table_name,
            },
        )
        return invalid_count, valid_count, source_total
    except Exception as e:
        if conn and hasattr(conn, "rollback"):
            safe_close(conn, method="rollback", log_fn=lambda msg: log_system_func("CLEANUP_WARNING", "DEBUG", msg))
        log_system_func(
            "OUTCOME_PERSIST_FAILED",
            "ERROR",
            f"Failed to persist invalid/valid rows for {check_id}: {str(e)}",
        )
        raise DataCodePersistenceError(f"Failed to persist invalid/valid rows for {check_id}: {str(e)}") from e
    finally:
        safe_close(cursor, log_fn=lambda msg: log_system_func("CLEANUP_WARNING", "DEBUG", msg))
        safe_close(conn, log_fn=lambda msg: log_system_func("CLEANUP_WARNING", "DEBUG", msg))


def insert_invalid_rows(
    df: pd.DataFrame,
    target_connection_id: str,
    target_table_prefix: str,
    check_id: str,
    log_system_func: Callable,
    log_validation_func: Callable,
    source_connection_id: Optional[str] = None,
    source_table_name: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    Backward-compatible wrapper: persists invalid + valid split when source args are given,
    otherwise invalid-only (legacy).
    """
    if source_connection_id and source_table_name:
        persist_check_row_split(
            invalid_df=df,
            source_connection_id=source_connection_id,
            target_connection_id=target_connection_id,
            source_table_name=source_table_name,
            target_table_prefix=target_table_prefix,
            check_id=check_id,
            error_message=error_message,
            log_system_func=log_system_func,
            log_validation_func=log_validation_func,
        )
        return

    if df.empty:
        return

    db_manager = DatabaseConnectionManager(log_system_func, log_validation_func)
    prepared = _append_check_metadata(df, check_id, error_message, include_error_message=True)
    details = db_manager.get_connection_details(target_connection_id)
    table_name = _invalid_table_name(target_table_prefix, check_id)
    conn = db_manager.get_connection(target_connection_id)
    cursor = conn.cursor()
    try:
        _insert_outcome_rows_on_target(
            prepared, table_name, target_connection_id, details, conn, cursor, log_system_func
        )
        if hasattr(conn, "commit"):
            conn.commit()
    finally:
        cursor.close()
        conn.close()



# ---------------------------------------------------------------------------
# NEW: condition extraction (replaces _build_complement_sql)
# ---------------------------------------------------------------------------
 
def _extract_where_condition(sql_query: Optional[str]) -> Optional[str]:
    """
    Best-effort extraction of the WHERE condition from a single-table check
    query, e.g. 'SELECT * FROM t WHERE a = 1' -> 'a = 1'.

    Uses the same paren-depth-aware boundary finder as _build_complement_sql
    (see _find_where_clause), just without negating the condition -- we reuse
    it as-is to build our own identifier-scoped query.
    """
    if not sql_query:
        return None

    query = sql_query.strip().rstrip(";")
    bounds = _find_where_clause(query)
    if not bounds:
        return None

    condition = query[bounds[0]:bounds[1]].strip()
    return condition or None
 
 
# ---------------------------------------------------------------------------
# NEW: engine-aware row identifier resolution (mirrors ChecksExecutor)
# ---------------------------------------------------------------------------
 
def _get_primary_key_columns(cur, source_database_type, db_schema, table_name):
    # Copied as-is from ChecksExecutor.get_primary_key_column (ASSUMPTION 5).
    if source_database_type != "snowflake":
        return []
 
    cur.execute(
        f'''
        SHOW PRIMARY KEYS IN TABLE
        "{db_schema.upper()}"."{table_name.upper()}"
        '''
    )
    rows = cur.fetchall()
    return [row["column_name"] for row in rows]
 
 
class _ResolvedIdentifier:
    __slots__ = ("row_identifier_column", "table_name", "snapshot_table_name",
                 "snowflake_tx_started")
 
    def __init__(self, row_identifier_column, table_name, snapshot_table_name=None,
                 snowflake_tx_started=False):
        self.row_identifier_column = row_identifier_column
        self.table_name = table_name
        self.snapshot_table_name = snapshot_table_name
        self.snowflake_tx_started = snowflake_tx_started
 
 
def _resolve_row_identifier(cur, source_database_type, source_schema, table_name,
                             log_system_func) -> _ResolvedIdentifier:
    """
    Mirrors ChecksExecutor.execute()'s identifier selection + locking:
      - postgresql -> ctid, plus LOCK TABLE ... IN SHARE MODE (best effort)
      - snowflake with exactly one real PK -> that PK, plus BEGIN for a
        consistent read (best effort)
      - snowflake with no single PK -> ROW_NUMBER() snapshot table, dc_id
    """
    if (source_database_type == "postgresql") or (source_database_type == "postgres"):
        try:
            cur.execute(
                f"LOCK TABLE {quote_identifier(source_schema, source_database_type)}."
                f"{quote_identifier(table_name, source_database_type)} IN SHARE MODE"
            )
            log_system_func("TABLE_LOCK_ACQUIRED", "INFO", "Source table locked",
                             context={"schema": source_schema, "table": table_name})
        except Exception as e:
            log_system_func("TABLE_LOCK_FAILED", "WARNING",
                             "Could not lock source table, proceeding without lock",
                             context={"error": str(e)})
        return _ResolvedIdentifier("ctid", table_name)
 
    pk_columns = _get_primary_key_columns(cur, source_database_type, source_schema, table_name)
 
    if len(pk_columns) == 1:
        tx_started = False
        try:
            cur.execute("BEGIN")
            tx_started = True
            log_system_func("SNOWFLAKE_TRANSACTION_STARTED", "INFO",
                             "Snowflake transaction started for consistent read",
                             context={"schema": source_schema, "table": table_name})
        except Exception as e:
            log_system_func("SNOWFLAKE_TRANSACTION_FAILED", "WARNING",
                             "Could not start Snowflake transaction", context={"error": str(e)})
        return _ResolvedIdentifier(pk_columns[0], table_name, snowflake_tx_started=tx_started)
 
    snapshot_table_name = f"{table_name}_dc_snapshot_{uuid.uuid4().hex[:8]}"
    cur.execute(f"""
        CREATE OR REPLACE TEMPORARY TABLE
        {quote_identifier(source_schema, source_database_type)}.
        {quote_identifier(snapshot_table_name, source_database_type)}
        AS
        SELECT ROW_NUMBER() OVER (ORDER BY 1) AS dc_id, *
        FROM {quote_identifier(source_schema, source_database_type)}.
        {quote_identifier(table_name, source_database_type)}
    """)
    return _ResolvedIdentifier("dc_id", snapshot_table_name, snapshot_table_name=snapshot_table_name)
 
 
def _release_row_identifier(cur, source_database_type, source_schema, resolved: _ResolvedIdentifier,
                             log_system_func):
    if resolved.snowflake_tx_started:
        try:
            cur.execute("COMMIT")
            log_system_func("SNOWFLAKE_TRANSACTION_COMMITTED", "INFO",
                             "Snowflake transaction committed",
                             context={"schema": source_schema, "table": resolved.table_name})
        except Exception as e:
            log_system_func("SNOWFLAKE_TRANSACTION_COMMIT_FAILED", "WARNING",
                             "Could not commit Snowflake transaction", context={"error": str(e)})
 
    if resolved.snapshot_table_name:
        try:
            cur.execute(
                f"DROP TABLE IF EXISTS "
                f"{quote_identifier(source_schema, source_database_type)}."
                f"{quote_identifier(resolved.snapshot_table_name, source_database_type)}"
            )
            log_system_func("SNAPSHOT_DROPPED", "INFO", "Snapshot table dropped",
                             context={"table": resolved.snapshot_table_name, "schema": source_schema})
        except Exception as e:
            log_system_func("SNAPSHOT_DROP_FAILED", "WARNING", "Could not drop snapshot table",
                             context={"table": resolved.snapshot_table_name, "error": str(e)})
 
 
# ---------------------------------------------------------------------------
# NEW: identifier-only query + membership fetch query builders
# ---------------------------------------------------------------------------
 
def _build_identifier_query(source_schema, table_name, row_identifier_column,
                             condition, source_database_type) -> str:
    id_col_q = quote_identifier(row_identifier_column, source_database_type)
    schema_q = quote_identifier(source_schema, source_database_type)
    table_q = quote_identifier(table_name, source_database_type)
    cast = "::text" if source_database_type == "postgresql" else "::TEXT"
 
    query = f"SELECT {id_col_q}{cast} AS row_identifier FROM {schema_q}.{table_q}"
    if condition:
        query += f" WHERE {condition}"
    return query
 
 
def _build_membership_fetch_query(source_schema, table_name, row_identifier_column,
                                   ids, source_database_type, include: bool
                                   ) -> Tuple[Optional[str], Optional[list]]:
    """
    include=True  -> rows whose identifier IS in `ids` (invalid rows)
    include=False -> rows whose identifier is NOT in `ids` (valid rows)
    """
    schema_q = quote_identifier(source_schema, source_database_type)
    table_q = quote_identifier(table_name, source_database_type)
    id_col_q = quote_identifier(row_identifier_column, source_database_type)
    base = f"SELECT * FROM {schema_q}.{table_q}"
 
    if not ids:
        if include:
            return None, None  # nothing is invalid
        return base, None      # everything is valid, no filter needed
 
    if (source_database_type == "postgresql") or (source_database_type == "postgres"):
        op, agg = ("=", "ANY") if include else ("!=", "ALL")
        query = f"{base} WHERE {id_col_q}::text {op} {agg}(%s)"
        params = [list(ids)]
    else:  # snowflake
        placeholders = ", ".join("%s" for _ in ids)
        op = "IN" if include else "NOT IN"
        query = f"{base} WHERE {id_col_q}::TEXT {op} ({placeholders})"
        params = list(ids)
 
    return query, params
 
 
# ---------------------------------------------------------------------------
# NEW: streaming loader for invalid/valid custom-check tables
# ---------------------------------------------------------------------------
 
def _extra_column_type(col: str, target_database_type: str) -> str:
    # ASSUMPTION 4: everything else stays TEXT, matching the old behavior of
    # _insert_outcome_rows_on_target (which created every column as TEXT).
    if col == "_job_id":
        return "VARCHAR"
    if col in ("_job_timestamp", "check_run_time"):
        return "TIMESTAMPTZ" if (target_database_type == "postgresql") or (target_database_type == "postgres") else "TIMESTAMP_TZ"
    return "TEXT"
 
 
def _stream_outcome_to_target(
    source_cur, target_cur,
    source_schema, table_name, source_database_type,
    target_schema, target_table_name, target_database_type,
    fetch_query, fetch_params,
    extra_columns, skip_columns,
    log_system_func,
    history_table_name=None
) -> int:
    """
    Streams `fetch_query` results from source to a local CSV in chunks, then
    bulk-appends them into `target_table_name` on the target (CREATE TABLE IF
    NOT EXISTS + ALTER ADD COLUMN as needed - never drops the existing table),
    via invalid_table_loader.load_csv_postgresql / load_csv_snowflake.
    Returns the number of rows loaded.

    `history_table_name`, when given, receives the same rows as a second
    append from the same exported CSV -- one source read, two loads. Used for
    the `_err_hist` accumulation, matching what the traditional pipeline does.
    """
    if not fetch_query:
        log_system_func("OUTCOME_EMPTY", "DEBUG", f"Nothing to stream into {target_table_name}")
        return 0
 
    temp_file_path = os.path.join(
        tempfile.gettempdir(), f"{target_table_name}_{uuid.uuid4().hex}.csv"
    )
    target_database_type = target_database_type.lower()
 
    try:
        columns = export_rows_to_csv(
            source_cur=source_cur,
            fetch_query=fetch_query,
            fetch_params=fetch_params,
            target_database_type=target_database_type,
            local_file_path=temp_file_path,
            extra_columns=extra_columns,
            skip_columns=skip_columns,
        )
 
        if not columns:
            return 0
 
        # Every column TEXT, except the few metadata columns with native types.
        column_types = {col: "TEXT" for col in columns}
        for col in (extra_columns or {}):
            if col in column_types:
                column_types[col] = _extra_column_type(col, target_database_type)
        
 
        # The history table, when requested, is appended from the same CSV.
        # drop_first is already False everywhere here, so history accumulates.
        load_targets = [target_table_name]
        if history_table_name:
            load_targets.append(history_table_name)

        for load_target in load_targets:
            if (target_database_type == "postgresql") or (target_database_type == "postgres"):
                load_csv_postgresql(
                    target_cur, temp_file_path, target_schema, load_target,
                    columns, column_types, drop_first=False
                )
            elif target_database_type == "snowflake":
                load_csv_snowflake(
                    target_cur, temp_file_path, target_schema, load_target,
                    columns, column_types, drop_first=False
                )
            else:
                raise ValueError(f"Unsupported target database type: {target_database_type}")

        with open(temp_file_path, "r", encoding="utf-8") as f:
            row_count = max(sum(1 for _ in f) - 1, 0)  # minus header
 
        return row_count
 
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)










































# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
 
def run_custom_checks_from_execution_df(
    execution_df: pd.DataFrame,
    log_system_func: Callable,
    log_validation_func: Callable,
    job_id: str = None,
    job_timestamp: datetime = None,
    **kwargs
) -> List[Dict[str, Any]]:
    """
    Executes SQL-based custom checks using an identifier-diff strategy
    (matching ChecksExecutor), instead of running a hand-built complement
    query. See module docstring for the full list of behavior changes.
    """
 
    log_system_func("CUSTOM_CHECKS_START", "INFO",
                     f"Starting custom checks execution: {len(execution_df)} checks to process")
    
    if job_id is None:
        job_id = str("J0B_ID_PLACEHOLDER")  # Placeholder for job_id if not provided
    if job_timestamp is None:
        job_timestamp_str = str("TIMESTAMP_PLACEHOLDER")  # Placeholder for job_timestamp if not provided
 
    summary_results: List[Dict[str, Any]] = []
    job_timestamp_str = job_timestamp.isoformat() if hasattr(job_timestamp, "isoformat") else job_timestamp
 
    db_manager = DatabaseConnectionManager(log_system_func, log_validation_func)
 
    # Group by connection pair, same as ChecksExecutor, so each pair's
    # connections are opened once.
    grouped: Dict[Tuple[str, str], list] = defaultdict(list)
    for _, row in execution_df.iterrows():
        source_conn_id = row.get('source_connection_id') or row['connection_id']
        target_conn_id = row.get('target_connection_id') or source_conn_id
        grouped[(source_conn_id, target_conn_id)].append(row)
 
    for (source_conn_id, target_conn_id), rows in grouped.items():
 
        source_details = db_manager.get_connection_details(source_conn_id)
        target_details = db_manager.get_connection_details(target_conn_id)
        # normalize_database_type resolves "rds" to its concrete engine and
        # "postgres" (the real database_type_enum's actual stored value) to
        # "postgresql" -- the one spelling every dispatch below is written
        # against. See trad_ct_id/connection_metadata.py for why this exists.
        source_database_type = normalize_database_type(source_details).lower()
        target_database_type = normalize_database_type(target_details).lower()
        source_schema = source_details["db_schema"]
        target_schema = target_details["db_schema"]
 
        conn = db_manager.get_connection(source_conn_id)
        source_cur = get_cursor(conn, source_database_type)
 
        target_conn = conn if target_conn_id == source_conn_id else db_manager.get_connection(target_conn_id)
        target_cur = get_cursor(target_conn, target_database_type)
 
        # Cache identifier resolution + landing table creation per physical
        # table within this connection pair, so repeated checks on the same
        # table don't re-lock / re-snapshot / re-copy landing data.
        resolved_by_table: Dict[str, _ResolvedIdentifier] = {}
        landing_done_for_prefix = set()
 
        err_reset_for_table = set()
        try:
            for row in rows:
                check_id = row['check_id']
                query = row['sql_query']
                table_name_prefix = (
                    row.get('table_name_prefix')
                    or row.get('target_table_prefix')
                    or row.get('table_name')
                )
                source_table_name = row.get('source_table_name') or _extract_source_table_name(query)
                source_table_ref = (
                    row.get('source_table_ref')
                    or _extract_source_table_reference(query)
                    or source_table_name
                )
                source_or_process = row.get('impacted_downstream') or row.get('source_or_process')
 
                log_system_func(
                    "CHECK_EXECUTION_START", "INFO",
                    f"Processing check {check_id} (source={source_conn_id}, target={target_conn_id})",
                    context={'check_id': check_id, 'source_connection_id': source_conn_id,
                              'target_connection_id': target_conn_id},
                )
 
                result_entry = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "check_id": check_id,
                    "table_name": table_name_prefix,
                    "source_or_process": source_or_process,
                    "check_name": row.get('check_name'),
                    "check_description": row.get('check_description'),
                    "check_category": row.get('check_category'),
                    "workstream": row.get('workstream'),
                    "impacted_downstream": row.get('impacted_downstream'),
                    "data_source": row.get('data_source'),
                    "criticality": row.get('criticality'),
                    "error_message": row.get('error_message'),
                    "issue_rows": 0,
                    "invalid_rows": 0,
                    "passed_rows": 0,
                    "source_total_rows": 0,
                    "message": "",
                }
 
                try:
                    if not source_table_name:
                        raise ValueError(
                            f"Could not determine source table for check {check_id}; "
                            f"identifier-diff execution requires a single-table check "
                            f"(row['source_table_name'] or a resolvable FROM clause)."
                        )


                    log_system_func(
                        "DEBUG_DB",
                        "INFO",
                        "Database debug",
                        context={
                            "source_database_type": repr(source_database_type),
                            "cursor_type": str(type(source_cur)),
                            "schema": source_schema,
                            "table": source_table_name,
                        }
                    )


 
                    # Resolve (and cache) the row identifier for this table.
                    if source_table_name not in resolved_by_table:
                        resolved_by_table[source_table_name] = _resolve_row_identifier(
                            source_cur, source_database_type, source_schema,
                            source_table_name, log_system_func
                        )
                    resolved = resolved_by_table[source_table_name]
                    physical_table_name = resolved.table_name  # may be a dc_id snapshot
 
                    condition = _extract_where_condition(query)
                    if condition is None and query.strip().lower() != (
                        f"select * from {source_table_name}".lower()
                    ):
                        log_system_func(
                            "CUSTOM_CHECK_CONDITION_FALLBACK", "WARNING",
                            f"Could not extract a WHERE condition for check {check_id}; "
                            f"treating the whole table as failing rows.",
                        )
 
                    id_query = _build_identifier_query(
                        source_schema, physical_table_name, resolved.row_identifier_column,
                        condition, source_database_type
                    )
                    source_cur.execute(id_query)
                    id_rows = source_cur.fetchall()
                    failed_row_ids = {str(next(iter(dict(r).values()))) for r in id_rows}
                    result_entry["issue_rows"] = len(failed_row_ids)
 
                    # Total row count, for reporting (best effort).
                    total_rows = 0
                    try:
                        source_cur.execute(
                            f"SELECT COUNT(*) FROM "
                            f"{quote_identifier(source_schema, source_database_type)}."
                            f"{quote_identifier(physical_table_name, source_database_type)}"
                        )
                        count_row = source_cur.fetchone()
                        total_rows = next(iter(dict(count_row).values()))
                    except Exception as e:
                        log_system_func("ROW_COUNT_FAILED", "WARNING",
                                         "Could not count source rows", context={"error": str(e)})
 
                    table_prefix = table_name_prefix or check_id
 
                    # Landing table (new): one raw copy per physical table prefix.
                    if table_prefix not in landing_done_for_prefix:
                        try:
                            create_landing_table(
                                source_cur=source_cur,
                                target_cur=target_cur,
                                source_connection_details=source_details,
                                target_connection_details=target_details,
                                source_database_name=source_details.get("database_name"),
                                source_schema=source_schema,
                                source_table=physical_table_name,
                                target_database_name=target_details.get("database_name"),
                                target_schema=target_schema,
                                target_table_prefix=table_prefix,
                                row_identifier_column=resolved.row_identifier_column,
                            )
                        except Exception as e:
                            log_system_func("LANDING_TABLE_FAILED", "ERROR",
                                             "Landing table creation failed",
                                             context={"table": table_prefix, "error": str(e)})
                        landing_done_for_prefix.add(table_prefix)
 
                    invalid_table = _invalid_table_name(table_prefix, check_id)
                    invalid_history_table = _invalid_history_table_name(table_prefix, check_id)
                    valid_table = _valid_table_name(table_prefix, check_id)
 
                    skip_cols = {resolved.row_identifier_column.lower()}
 
                    check_run_time = datetime.now(timezone.utc).isoformat()
 
                    # Invalid rows.
                    invalid_query, invalid_params = _build_membership_fetch_query(
                        source_schema, physical_table_name, resolved.row_identifier_column,
                        failed_row_ids, source_database_type, include=True
                    )
                    invalid_extra_cols = {
                        "_check_run_time": check_run_time,
                        "_check_id": check_id,
                        "_error_message": row.get("error_message"),
                        "_job_id": job_id,
                        "_job_timestamp": job_timestamp_str,
                    }
                    # `_err` is the current run's failures: rebuilt from scratch, once per run
                    # per table (checks sharing a prefix share the table). `_err_hist` accumulates.
                    if invalid_table not in err_reset_for_table:
                        drop_err_table(target_cur, target_schema, invalid_table, target_database_type)
                        err_reset_for_table.add(invalid_table)

                    invalid_n = _stream_outcome_to_target(
                        source_cur, target_cur,
                        source_schema, physical_table_name, source_database_type,
                        target_schema, invalid_table, target_database_type,
                        invalid_query, invalid_params,
                        invalid_extra_cols, skip_cols,
                        log_system_func,
                        history_table_name=invalid_history_table,
                    )
 
                    # Valid rows.
                    valid_query, valid_params = _build_membership_fetch_query(
                        source_schema, physical_table_name, resolved.row_identifier_column,
                        failed_row_ids, source_database_type, include=False
                    )
                    valid_extra_cols = {
                        "_check_run_time": check_run_time,
                        "_check_id": check_id,
                        "_job_id": job_id,
                        "_job_timestamp": job_timestamp_str,
                    }
                    valid_n = _stream_outcome_to_target(
                        source_cur, target_cur,
                        source_schema, physical_table_name, source_database_type,
                        target_schema, valid_table, target_database_type,
                        valid_query, valid_params,
                        valid_extra_cols, skip_cols,
                        log_system_func,
                    )
 
                    if hasattr(target_conn, "commit"):
                        target_conn.commit()
 
                    result_entry["invalid_rows"] = invalid_n
                    result_entry["passed_rows"] = valid_n
                    result_entry["source_total_rows"] = total_rows or (invalid_n + valid_n)
                    # passed / failed, not "Finished". "Finished" only said the
                    # check ran; it said nothing about the outcome, so every
                    # custom-check failure was invisible to any query filtering
                    # on status.
                    result_entry["status"] = "failed" if invalid_n > 0 else "passed"

                    # This text is read in QC Alerts by people who did not write the
                    # check. It used to be "6 row(s) -> custom_check__err, 19 row(s) ->
                    # custom_check__valid", which is the engine describing its own
                    # plumbing. Lead with the business explanation the check was
                    # configured with, then say how many rows and where to find them.
                    checked_n = invalid_n + valid_n
                    configured_reason = (row.get("error_message") or "").strip()

                    if invalid_n > 0:
                        outcome = (
                            f"{invalid_n} of {checked_n} row(s) did not pass this check. "
                            f"The failing rows were saved to \"{invalid_table}\"."
                        )
                        result_entry["message"] = (
                            f"{configured_reason} {outcome}" if configured_reason else outcome
                        )
                    else:
                        result_entry["message"] = f"All {checked_n} row(s) passed this check."
 
                    log_system_func("CUSTOM_CHECK_SUCCESS", "INFO",
                                     f"Check {check_id} completed successfully", context=result_entry)
 
                except Exception as e:
                    import traceback
                    log_system_func("CUSTOM_CHECK_EXCEPTION", "ERROR",
                                     f"Exception occurred in check {check_id}: {type(e).__name__}: {str(e)}")
                    log_system_func("CUSTOM_CHECK_TRACEBACK", "ERROR",
                                     f"Traceback for check {check_id}",
                                     context={'traceback': traceback.format_exc()})
                    # The exception and its traceback are already in system_logs above.
                    # What goes into results is what a business user will read.
                    result_entry["message"] = readable_failure(e)
                    # "error", not "failed": the check could not run at all,
                    # which is a different thing from running and finding bad
                    # rows, and must stay distinguishable in the results table.
                    result_entry["status"] = "error"
                    result_entry["invalid_rows"] = 0
                    result_entry["passed_rows"] = 0
 
                summary_results.append(result_entry)
 
            try:
                if hasattr(conn, "commit"):
                    conn.commit()
            except Exception as e:
                log_system_func("SOURCE_COMMIT_FAILED", "WARNING",
                                 "Source connection commit failed", context={"error": str(e)})
                
        except Exception as e:
            log_system_func("CUST_EXEC_FAILED", "ERROR", 
                            "Custom checks execution failed", context={"error":str(e)})

        finally:
            _cleanup_log = lambda msg: log_system_func("CLEANUP_WARNING", "DEBUG", msg)
            for resolved in resolved_by_table.values():
                safe_call(
                    _release_row_identifier, source_cur, source_database_type, source_schema,
                    resolved, log_system_func, log_fn=_cleanup_log,
                )

            for c in (source_cur, target_cur):
                safe_close(c, log_fn=_cleanup_log)

            safe_close(conn, log_fn=_cleanup_log)
            if target_conn is not conn:
                safe_close(target_conn, log_fn=_cleanup_log)
 
    log_system_func("CUSTOM_CHECKS_COMPLETE", "INFO",
                     f"Custom checks execution completed with {len(summary_results)} results")
 
    return summary_results































def validate_custom_check_query(
    connection_id: str,
    sql_query: str,
    log_system_func: Callable,
    log_validation_func: Callable
) -> Dict[str, Any]:
    """
    Validates an ad-hoc custom check query against a specific connection.
    Executes the provided SQL as-is and marks validation as:
    - Success: if at least one row is returned
    - Failure: if zero rows are returned or execution fails
    """
    conn = None
    cursor = None

    try:
        normalized_connection_id = (connection_id or "").strip()
        normalized_query = (sql_query or "").strip().rstrip(";")

        if not normalized_connection_id:
            msg = "Validation failed: connection_id is required."
            log_validation_func(msg, context={"connection_id": connection_id})
            log_system_func("VALIDATION_INPUT_INVALID", "WARNING", msg)
            return {"status": "Failure", "reason": msg}

        if not normalized_query:
            msg = "Validation failed: sql_query is required."
            log_validation_func(msg, context={"connection_id": normalized_connection_id})
            log_system_func("VALIDATION_INPUT_INVALID", "WARNING", msg)
            return {
                "status": "Failure",
                "connection_id": normalized_connection_id,
                "reason": msg
            }

        db_manager = DatabaseConnectionManager(log_system_func, log_validation_func)
        log_system_func(
            "VALIDATION_CONNECTION_START",
            "INFO",
            f"Connecting to database for validation on {normalized_connection_id}",
            context={"connection_id": normalized_connection_id}
        )
        conn = db_manager.get_connection(normalized_connection_id)
        log_system_func(
            "VALIDATION_CONNECTION_SUCCESS",
            "INFO",
            f"Connection established for validation on {normalized_connection_id}",
            context={"connection_id": normalized_connection_id}
        )

        cursor = conn.cursor()
        try:
            cursor.execute(normalized_query)
        except Exception as e:
            raise DataCodeQueryExecutionError(
                f"Validation query failed on connection {normalized_connection_id}: {str(e)}"
            ) from e

        row = cursor.fetchone()
        columns = [desc[0] for desc in cursor.description] if cursor.description else []

        if row:
            sample_row = dict(zip(columns, row)) if columns else {}
            log_system_func(
                "VALIDATION_QUERY_PASS",
                "INFO",
                "Validation query returned at least one row.",
                context={"connection_id": normalized_connection_id}
            )
            return {
                "status": "Success",
                "connection_id": normalized_connection_id,
                "message": "Query validation passed. At least one row returned.",
                "columns": columns,
                "sample_row": sample_row
            }

        fail_msg = "Query validation failed. No rows returned."
        log_validation_func(
            fail_msg,
            context={"connection_id": normalized_connection_id}
        )
        log_system_func(
            "VALIDATION_QUERY_NO_ROWS",
            "WARNING",
            fail_msg,
            context={"connection_id": normalized_connection_id}
        )
        return {
            "status": "Failure",
            "connection_id": normalized_connection_id,
            "reason": fail_msg,
            "columns": columns,
            "sample_row": {}
        }

    except DataCodeQueryExecutionError as e:
        error_msg = str(e)
        log_system_func(
            "VALIDATION_QUERY_EXECUTION_FAIL",
            "ERROR",
            error_msg,
            context={"connection_id": connection_id}
        )
        log_validation_func(
            "Validation query execution failed.",
            context={"connection_id": connection_id, "error": str(e)}
        )
        return {
            "status": "Failure",
            "connection_id": connection_id,
            "reason": error_msg
        }
    except Exception as e:
        error_msg = f"Validation process failed: {str(e)}"
        log_system_func(
            "VALIDATION_PROCESS_FAIL",
            "ERROR",
            error_msg,
            context={"connection_id": connection_id}
        )
        log_validation_func(
            "Validation process encountered an exception.",
            context={"connection_id": connection_id, "error": str(e)}
        )
        return {
            "status": "Failure",
            "connection_id": connection_id,
            "reason": error_msg
        }
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                log_system_func(
                    "VALIDATION_CURSOR_CLOSE_FAIL",
                    "WARNING",
                    "Failed to close validation cursor cleanly."
                )

        if conn:
            try:
                conn.close()
            except Exception:
                log_system_func(
                    "VALIDATION_CONN_CLOSE_FAIL",
                    "WARNING",
                    "Failed to close validation connection cleanly.",
                    context={"connection_id": connection_id}
                )

from typing import List, Dict, Any

def calculate_overall_criticality(results: List[Dict[str, Any]], log_system_func: Callable, log_validation_func: Callable) -> str:
    """
    Calculates the highest criticality from a list of execution results.
    Debug version with detailed trace logs.
    """

    # Normalized to lowercase to match the traditional pipeline's status vocabulary
    # ("passed"/"low"/"medium"/"high") -- this used to return Title Case ("Pass"/
    # "High"), a needless inconsistency between the two pipelines' outputs.
    priority_map = {'high': 3, 'medium': 2, 'low': 1}
    max_prio = 0; overall_status = "passed"

    for idx, res in enumerate(results):

        row_count = res.get('invalid_rows', 0)

        # "error" counts here as well as "failed". A check that crashed used to
        # report status "Failed" and so contributed to the overall criticality;
        # now that it reports "error" instead, it has to be named explicitly or
        # a crashed check would silently stop affecting the job outcome.
        if (row_count and row_count > 0) or (res.get('status', '').lower() in ('failed', 'error')):
            crit = res.get('criticality')

            if crit and isinstance(crit, str):
                crit_key = crit.lower()
                prio = priority_map.get(crit_key, 0)

                if prio > max_prio:
                    max_prio = prio
                    overall_status = crit_key

    log_system_func("CRITICALITY_CALCULATION_COMPLETE", "INFO", f"Calculated overall criticality for {len(results)} checks: {overall_status} (max priority: {max_prio})")
    return overall_status

def save_results_to_rds(
    results: List[Dict[str, Any]],
    log_system_func: Callable,
    log_validation_func: Callable,
    job_id: str = None,
    job_timestamp: datetime = None,
    user_id: str = None,
    **kwargs
) -> str:
    """
    Persists execution results to the ``results`` table in schema ``public`` on RDS
    (credentials from ``.env`` via ``get_engine``).

    The table is schema-qualified so it resolves correctly even when ``RDS_SCHEMA`` / ``search_path`` is ``public``.
    Set ``RDS_RESULTS_SCHEMA`` in ``.env`` to use a different schema.

    One ``job_id`` (UUID) is generated per batch; each check outcome is inserted as a row.
    """

    if not results:
        log_system_func("RDS_RESULTS_SAVE_SKIP", "WARNING", "No results to save to RDS.")
        return ""

    engine = get_engine()
    results_schema = os.getenv("RDS_RESULTS_SCHEMA", "public")
    user_id = user_id if user_id else "<error>"
    if engine.dialect.name == "postgresql":
        table_ref = f'"{results_schema}"."results"'
    else:
        table_ref = f"`{results_schema}`.`results`"

    job_id = "<error>" if not job_id else job_id 
    ts_col = '"job_timestamp"' if engine.dialect.name == "postgresql" else "`job_timestamp`"

    insert_sql = text(
        f"""
        INSERT INTO {table_ref} (
            job_id,
            {ts_col},
            check_id,
            check_name,
            check_description,
            config_id,
            config_name,
            check_category,
            workstream,
            data_source,
            impacted_downstream,
            issue_status,
            file_or_table_name,
            field,
            check_type,
            check_status,
            criticality,
            abort,
            issue_rows,
            failure_reason,
            passed_rows,
            rows_total,
            rows_failed,
            user_id
        ) VALUES (
            :job_id,
            :ts,
            :check_id,
            :check_name,
            :check_description,
            :config_id,
            :config_name,
            :check_category,
            :workstream,
            :data_source,
            :impacted_downstream,
            :issue_status,
            :file_or_table_name,
            :field,
            :check_type,
            :check_status,
            :criticality,
            :abort,
            :issue_rows,
            :failure_reason,
            :passed_rows,
            :rows_total,
            :rows_failed,
            :user_id
        )
        """
    )

    try:
        with engine.begin() as conn:
            for res in results:
                log_system_func("RESULT_SAVE", "DEBUG", f"Saving result for check {res.get('check_id')}", context=res)
                ts_raw = res.get("timestamp")
                if isinstance(ts_raw, str):
                    ts_val = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                elif isinstance(ts_raw, datetime):
                    ts_val = ts_raw
                else:
                    ts_val = datetime.now(timezone.utc)

                err_template = res.get("error_message")
                status_l = str(res.get("status", "")).lower()

                # check_status is the shared vocabulary: passed / failed /
                # error. The executor already speaks it; anything unrecognised
                # is recorded as "error" rather than written through verbatim,
                # so a stray value can't quietly become a new status.
                if status_l in ("passed", "failed", "error"):
                    check_status = status_l
                else:
                    log_system_func(
                        "RESULT_STATUS_UNEXPECTED", "WARNING",
                        f"Unrecognised status {res.get('status')!r} for check "
                        f"{res.get('check_id')}; recording as 'error'",
                    )
                    check_status = "error"

                # failure_reason carries the configured error_message only when
                # the check actually failed. It used to be populated even on a
                # clean run, so a passing check displayed its own error text.
                if check_status == "failed":
                    failure_reason = res.get("message") or err_template
                elif check_status == "error":
                    failure_reason = res.get("message") or err_template
                else:
                    failure_reason = None

                # abort derives from criticality rather than being hardcoded
                # True on every row regardless of how the check was configured.
                criticality = res.get("criticality")
                abort_flag = str(criticality or "").strip().lower() == "high"

                params = {
                    "job_id": str(job_id),
                    "ts": ts_val,
                    "check_id": res.get("check_id"),
                    "check_name": res.get("check_name"),
                    "check_description": res.get("check_description"),
                    "config_id": res.get("check_id"),
                    "config_name": res.get("check_name"),
                    "check_category": res.get("check_category"),
                    "workstream": res.get("workstream"),
                    "data_source": res.get("data_source"),
                    "source_or_process": res.get("source_or_process"),
                    "file_or_table_name": res.get("table_name"),
                    # A custom check is not scoped to a single field, so field
                    # is NULL. It used to be reassigned to the literal string
                    # "___placeholder__" two lines further down, which landed
                    # in the results table as data and made any GROUP BY field
                    # nonsense for this family.
                    "field": None,
                    "check_type": "custom_sql",
                    "check_status": check_status,
                    "criticality": criticality,
                    "abort": abort_flag,
                    "issue_rows": res.get("issue_rows"),
                    "failure_reason": failure_reason,
                    "passed_rows": res.get("passed_rows"),
                    # A custom check is one check, and its rows are the rows its query returned
                    # out of the table's total -- the same two numbers a traditional run reports.
                    # A check that errored evaluated no rows, so it reports none.
                    "rows_total": None if check_status == "error" else res.get("source_total_rows"),
                    "rows_failed": None if check_status == "error" else res.get("issue_rows"),
                    "impacted_downstream": res.get("impacted_downstream"),
                    "check_execution_id": res.get("check_execution_id"),
                    "issue_status": res.get("issue_status"),
                    "user_id": str(user_id)
                }
                conn.execute(insert_sql, params)
                log_system_func("RESULT_APPENDED", "DEBUG", f"Appended result for check {res.get('check_id')} to {results_schema}.results")

        log_system_func("RESULTS_APPEND_COMPLETE", "INFO", f"Appended {len(results)} result row(s) to {results_schema}.results for job {job_id}")

        log_system_func(
            "RDS_RESULTS_SAVED",
            "INFO",
            f"Saved {len(results)} execution row(s) to RDS {results_schema}.results.",
            context={
                "job_id": str(job_id),
                "row_count": len(results),
                "schema": results_schema,
            },
        )
        return str(job_id)

    except Exception as e:
        log_system_func("RDS_RESULTS_SAVE_FAIL", "ERROR", f"Failed to save results to RDS: {str(e)}")
        raise
