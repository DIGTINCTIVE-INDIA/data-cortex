import os
import json
import re
import uuid

from datetime import datetime, timezone
from typing import Optional, List

import pandas as pd
from dotenv import load_dotenv
from pydantic import BaseModel
from sqlalchemy import create_engine


# Database
from Data_Code.common.database import (
    get_db_session,
    get_engine,
    init_db,
    persist_job_logs,
    User,
)

from trad_ct_id.db_connection import get_connection, get_connection_details
import trad_ct_id.db_connection as trad_db_connection
from trad_ct_id.connection_metadata import fetch_connection_metadata, normalize_database_type
from Data_Code.connectors.file.manager import FileConnectionManager


# Execution
from execution_df_generator import GenerateExecutionDF
from trad_ct_id.checks_executor import ChecksExecutor


# Custom Checks
from Data_Code.custom_checks.engine import CustomEngine


# Logging & Config
from Data_Code.common.logger import CustomLogger

# Create Job ID and Job Timestamp

job_id = f"JOB_{uuid.uuid4()}"
job_timestamp = datetime.now(timezone.utc)

# Define Log Structure

class SystemLogEntry(BaseModel):
    job_id: str
    timestamp: datetime
    code: str
    severity: str # INFO | WARNING | ERROR | CRITICAL
    message: str
    context: Optional[dict] = None

class ValidationLogEntry(BaseModel):
    message: str
    context: Optional[dict] = None

# Initialize log containers

system_logs: List[SystemLogEntry] = []
validation_logs: List[ValidationLogEntry] = []

def log_system(code, severity, message, context=None):
    system_logs.append(
        SystemLogEntry(
            job_id=job_id,
            timestamp=datetime.now(timezone.utc),
            code=code,
            severity=severity,
            message=message,
            context=context
        )
    )

def log_validation(message, context=None):
    validation_logs.append(
        ValidationLogEntry(
            message=message,
            context=context
        )
    )



def persist_run_logs(traditional_logger=None):
    """Persist all buffered logs once at the end of a job run."""
    combined_system_logs = list(system_logs)
    combined_validation_logs = list(validation_logs)

    combined_system_logs.extend(trad_db_connection.system_logs)
    combined_validation_logs.extend(trad_db_connection.validation_logs)

    if traditional_logger is not None:
        combined_system_logs.extend(traditional_logger.get_logs())

    if not combined_system_logs and not combined_validation_logs:
        return {"system": 0, "validation": 0}

    counts = persist_job_logs(job_id, combined_system_logs, combined_validation_logs)

    system_logs.clear()
    validation_logs.clear()
    trad_db_connection.system_logs.clear()
    trad_db_connection.validation_logs.clear()

    if traditional_logger is not None and hasattr(traditional_logger, "logs"):
        traditional_logger.logs.clear()

    return counts

def get_user(auth_element):

    if not isinstance(auth_element, dict):
        raise ValueError("Authentication element must be a dictionary")
    return auth_element.get("user_id")

def validate_and_extract_check_type(config_json):
    """
    Validates that 'check_type' exists and is a string, and identifies the user.
    - First element contains user_id (no password -- there is no auth step here)
    - Second element onwards contain check_type and check_id
    - If check_type is "custom_check": returns JSON from second element onwards
    - If check_type is "traditional": returns JSON from second element onwards
    - Returns (check_type, modified_json, user_id)
    """
    # Parse JSON if it's a string
    if isinstance(config_json, str):
        data = json.loads(config_json)
    else:
        data = config_json

    # Validate that data is a list with at least 2 elements
    if not isinstance(data, list):
        raise ValueError("JSON data must be a list")

    if len(data) < 2:
        raise ValueError("Payload must have at least 2 elements: [auth_element, check_element, ...]")

    # First element should contain the user_id (no password -- no auth step here)
    if not isinstance(data[0], dict):
        raise ValueError("First element must be a dictionary containing user_id")

    modified_json = []
    check_type = None

    for check in data[1:]:
        if not isinstance(check, dict):
            raise ValueError("Each check element must be a dictionary")

        if "check_type" not in check:
            raise KeyError("'check_type' key not found")

        check_type_value = check["check_type"]

        if not isinstance(check_type_value, str):
            raise TypeError(f"'check_type' must be a string, got {type(check_type_value).__name__}")

        # Pop check_type out: it's returned separately below, and the
        # validator (tc_json_validator.py) only accepts config_id/checklist
        # keys on each item -- leaving check_type in would make every item
        # fail structural validation as an "unexpected key".
        if check_type is None:
            check_type = check_type_value.lower()
        check.pop("check_type")
        modified_json.append(check)

    return check_type, modified_json, get_user(data[0])


class ExecutionPipeline:
    def __init__(self, config_json, check_type, log_system, log_validation, validation_logs, system_logs, user_id=None):
        self.config_json = config_json
        self.check_type = check_type
        self.log_system = log_system
        self.log_validation = log_validation
        self.validation_logs = validation_logs
        self.system_logs = system_logs
        self.user_id = user_id
        self.last_executor_logger = None

    def run(self) -> pd.DataFrame:
        config_json = self.config_json
        log_system = self.log_system
        log_validation = self.log_validation
        validation_logs = self.validation_logs
        system_logs = self.system_logs

        generate_execution_df = GenerateExecutionDF(
            config_json=config_json,
            log_system=log_system,
            log_validation=log_validation,
            validation_logs=validation_logs,
            system_logs=system_logs
        )

        checks_execution_df = generate_execution_df.run()


        def store_job_df(job_df):

            # Uses the app's shared engine (RDS_* derived). This used to
            # load_dotenv() and build a second engine from DATABASE_URL, which
            # meant two different sources of truth for "which database is the
            # product database" and one more .env read inside the request path.
            ENGINE = get_engine()

            # issue_rows/passed_rows are stored as strings (some rows use "NA" for
            # schema checks). pd.to_numeric would force the whole column to float64
            # the moment it contains any NaN, turning "2" into "2.0" -- format whole
            # numbers back to plain integer strings instead, leaving "NA"/None as-is.
            def _clean_row_count(v):
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    return v
                if isinstance(v, str) and v.strip().upper() == "NA":
                    return v
                try:
                    numeric = float(v)
                except (TypeError, ValueError):
                    return v
                return str(int(numeric)) if numeric.is_integer() else str(numeric)

            for col in ("issue_rows", "passed_rows"):
                if col in job_df.columns:
                    job_df[col] = job_df[col].apply(_clean_row_count)

            # Canonicalise the enum-backed columns to lower_snake_case.
            #
            # These four are PostgreSQL enums, so the database accepts exactly one
            # spelling and rejects the whole INSERT otherwise. Relying on every
            # executor to get the casing right has already cost us once: the
            # traditional writers emitted "Open" while the enum defines "open", and
            # the job died at the final write with the checks already done.
            #
            # Normalising here, at the single point where results are written, means
            # a new writer cannot reintroduce that class of failure. Deliberately
            # narrow: only these columns. `field` holds real column names and
            # `failure_reason` is prose -- neither is ours to rewrite.
            ENUM_COLUMNS = ("check_status", "check_type", "criticality", "issue_status")

            def _canonical_enum(value):
                # Leave genuine nulls alone: criticality and issue_status are
                # nullable, and "no value" is not the same as "some value we
                # tidied up".
                if value is None or (isinstance(value, float) and pd.isna(value)):
                    return value
                text = str(value).strip().lower()
                # Spaces and hyphens become underscores ("custom sql" ->
                # "custom_sql"); anything already canonical passes through
                # unchanged.
                return re.sub(r"[\s\-]+", "_", text)

            for col in ENUM_COLUMNS:
                if col in job_df.columns:
                    original = job_df[col]
                    job_df[col] = original.apply(_canonical_enum)

                    # Report what was rewritten. A writer emitting a non-canonical
                    # value is a bug that this normalisation hides, so it should
                    # still be visible rather than silently corrected forever.
                    changed = original.astype(str).ne(job_df[col].astype(str))
                    if changed.any():
                        rewrites = sorted(
                            {
                                f"{before!r} -> {after!r}"
                                for before, after in zip(original[changed], job_df[col][changed])
                            }
                        )
                        log_system(
                            code="RESULT_VALUE_NORMALISED",
                            severity="WARNING",
                            message=(
                                f"Normalised {int(changed.sum())} value(s) in '{col}' to "
                                f"lower_snake_case: {rewrites}. The writer should emit the "
                                "canonical form directly."
                            ),
                            context={
                                "step": "store_job_df",
                                "column": col,
                                "rewrites": rewrites,
                                "rows_affected": int(changed.sum()),
                            },
                        )

            # Honour RDS_RESULTS_SCHEMA like the custom-check path already
            # does. This was hardcoded to "public", so setting the env var
            # split results across two schemas depending on check family.
            results_schema = os.getenv("RDS_RESULTS_SCHEMA", "public")

            def _write(frame):
                frame.to_sql(
                    name="results",
                    con=ENGINE,
                    schema=results_schema,
                    if_exists="append",
                    index=False,
                )

            # Written per config_id, not as one batch.
            #
            # to_sql sends a chunk as a single multi-row INSERT inside one
            # transaction, so ONE unwritable row discarded the entire job's
            # results -- including every config that completed cleanly. A job
            # covering three configs lost all three because one row in one of
            # them violated a constraint, and the outcome of the other two was
            # simply never recorded.
            #
            # Per config, a bad row costs that config's batch and nothing else.
            # Within a failed batch we then retry row by row, so the rows that
            # CAN be stored still are, and the ones that cannot are named
            # individually in the system log rather than vanishing.
            if "config_id" in job_df.columns:
                groups = list(job_df.groupby("config_id", dropna=False, sort=False))
            else:
                groups = [(None, job_df)]

            stored_total = 0
            failed_total = 0

            for config_id, group in groups:
                try:
                    _write(group)
                    stored_total += len(group)
                    log_system(
                        code="RESULTS_STORED",
                        severity="INFO",
                        message=f"Stored {len(group)} result row(s) for {config_id}",
                        context={
                            "step": "store_job_df",
                            "config_id": config_id,
                            "rows": len(group),
                        },
                    )
                except Exception as batch_error:
                    log_system(
                        code="RESULTS_BATCH_FAILED",
                        severity="WARNING",
                        message=(
                            f"Batch insert failed for {config_id} "
                            f"({len(group)} row(s)); retrying row by row. {batch_error}"
                        ),
                        context={
                            "step": "store_job_df",
                            "config_id": config_id,
                            "rows": len(group),
                            "error": str(batch_error),
                        },
                    )

                    for position in range(len(group)):
                        single = group.iloc[[position]]
                        try:
                            _write(single)
                            stored_total += 1
                        except Exception as row_error:
                            failed_total += 1
                            row = single.iloc[0]
                            log_system(
                                code="RESULT_ROW_UNWRITABLE",
                                severity="ERROR",
                                message=(
                                    f"Result row could not be stored: config_id={config_id} "
                                    f"check_id={row.get('check_id')} "
                                    f"check_name={row.get('check_name')!r} "
                                    f"field={row.get('field')!r} "
                                    f"check_status={row.get('check_status')!r}. "
                                    f"The check ran; its outcome is NOT in results. {row_error}"
                                ),
                                context={
                                    "step": "store_job_df",
                                    "config_id": config_id,
                                    "check_id": row.get("check_id"),
                                    "check_status": row.get("check_status"),
                                    "field": row.get("field"),
                                    "error": str(row_error),
                                },
                            )

            print(f"Results stored: {stored_total}, unwritable: {failed_total}")

            # A job that executed checks but could not record some of them is not
            # a success -- the results table would silently under-report. Surface
            # it once, after every writable row has been saved.
            if failed_total:
                raise RuntimeError(
                    f"{failed_total} of {len(job_df)} result row(s) could not be stored. "
                    f"{stored_total} were stored. See RESULT_ROW_UNWRITABLE entries in "
                    "the system log for the specific rows and reasons."
                )

        # Fetch all connection_ids required for the job. db_based_checks_config /
        # file_based_checks_config use separate source_connection_id /
        # target_connection_id columns rather than a single "connection_id",
        # so gather the union of both.
        connection_id_columns = [
            c for c in ("source_connection_id", "target_connection_id")
            if c in checks_execution_df.columns
        ]
        connection_ids = pd.unique(checks_execution_df[connection_id_columns].values.ravel())
        connection_ids = [cid for cid in connection_ids if pd.notna(cid)]

        # No connection ids means there is nothing runnable left -- usually every
        # row was dropped upstream (see FC_ROWS_REMOVED, which fires when a file
        # connection could not be resolved to an ingested table). Indexing [0]
        # here raised a bare "list index out of range" that buried the real
        # reason several hundred log lines earlier.
        if not connection_ids:
            raise RuntimeError(
                "No usable connection ids are left in the execution set, so the job cannot run. "
                f"Rows remaining: {len(checks_execution_df)}; "
                f"connection columns found: {connection_id_columns or 'none'}. "
                "If rows were dropped, the cause is logged earlier in this job -- look for "
                "FC_ROWS_REMOVED, FC_INGEST_ERROR or FILE_CONN_GET_ERROR in the system log."
            )

        # Use ANY one valid connection to read metadata table

        with get_connection(connection_ids[0]) as conn:
            connection_metadata_df = fetch_connection_metadata(
                connection=conn,
                allowed_connection_ids=connection_ids,
                log_system=log_system
            )

        # Early sanity check: every connection_id referenced by this job must
        # actually resolve to connection metadata. ChecksExecutor fetches
        # source/target connection details itself per pair (including
        # db_schema), so there's no dataframe column to merge/validate here --
        # this just fails fast instead of deep inside check execution.
        missing_connection_ids = set(connection_ids) - set(connection_metadata_df["connection_id"])
        if missing_connection_ids:
            raise RuntimeError(
                f"Could not resolve connection metadata for: {missing_connection_ids}"
            )

        checks_execution_df_merged = checks_execution_df

        # ChecksExecutor looks up source/target connection details via
        # metadata_map[connection_id] rather than fetching them itself.
        # database_type is normalized here ("rds" -> its concrete engine, e.g.
        # "postgresql") since ChecksExecutor and friends dispatch on concrete
        # engine names only -- see normalize_database_type.
        metadata_map = {}
        for cid in connection_ids:
            details = get_connection_details(cid)
            details["database_type"] = normalize_database_type(details)
            metadata_map[cid] = details

        # Derive database_type per row from that row's own source connection.
        # It used to be hardcoded to "postgresql" for every row in
        # execution_df_generator, so a Snowflake or MySQL source was silently
        # dispatched down the Postgres path.
        if "source_connection_id" in checks_execution_df_merged.columns:
            checks_execution_df_merged["database_type"] = (
                checks_execution_df_merged["source_connection_id"]
                .map(lambda cid: (metadata_map.get(cid) or {}).get("database_type"))
            )

        # Execute checks
        executor = ChecksExecutor(
            checks_execution_df_merged,
            job_id=job_id,
            job_timestamp=job_timestamp,
            metadata_map=metadata_map,
            logger=CentralJobLogger(),
            user_id=self.user_id
            )
        self.last_executor_logger = executor.logger
        job_df, job_status = executor.execute()

        os.makedirs("results", exist_ok=True)
        job_df.to_csv(os.path.join("results", f"{job_id}_RESULT.csv"))
        store_job_df(job_df)

        # Destroy this job's file-ingestion staging tables in the product DB now
        # that every check has finished reading them (decisions_needed.csv #10 --
        # landing in the product DB is fine as a staging step, but it must never
        # persist past job end).
        for ingest_conn_id, ingest_table_name in generate_execution_df.ingested_tables:
            try:
                with get_connection(ingest_conn_id) as ingest_conn:
                    ingest_cursor = ingest_conn.cursor()
                    FileConnectionManager(log_system, log_validation).delete_table(ingest_cursor, ingest_table_name)
                    ingest_conn.commit()
            except Exception as e:
                log_system(
                    "INGEST_TABLE_CLEANUP_WARNING", "WARNING",
                    f"Failed to destroy ingested table {ingest_table_name} on {ingest_conn_id}: {str(e)}",
                    context={"connection_id": ingest_conn_id, "table_name": ingest_table_name}
                )

        return job_df, job_status

def my_system_logger(code, severity, message, context=None):
    """
    System logger that routes to database.

    Parameter names match the ``log_system(code, severity, message, context=None)``
    convention used everywhere else in this codebase (temp_connectors.py, trad_ct_id/*,
    Data_Code/*) -- callers pass these as keyword args, so the names must match.
    """
    db_handler = CustomLogger.get_db_handler()
    if db_handler:
        db_handler.buffer_log({
            "code": code,
            "severity": severity,
            "message": message,
            "context": context
        })


def my_validation_logger(message, result=None, context=None):
    """Validation logger that routes to validation database."""
    validation_handler = CustomLogger.get_validation_db_handler()
    if validation_handler:
        validation_handler.buffer_log({
            "message": message,
            "context": context
        })


class CentralJobLogger:
    """
    Adapts the central per-run logger (my_system_logger, routed through
    CustomLogger) to the .log_system(code, severity, message, context) interface
    that ChecksExecutor / trad_ct_id.system_logger.SystemLogger already use, so
    traditional-check logs land in the same job-scoped log store as everything
    else in this run instead of a separate in-memory list nobody flushes.
    """

    def log_system(self, code, severity, message, context=None):
        my_system_logger(code, severity, message, context)

    def get_logs(self):
        # Logs already went straight to CustomLogger's buffer above; nothing
        # left to collect separately.
        return []

# Initialize connection to the database (Required for pulling templates)
# Moved inside run_dc_engine to prevent immediate db connection on import

def run_dc_engine(input_config_json, user_id: str = None, run_id: str = None):
    # No init_db() here on purpose. The database is created and migrated by the
    # monorepo, and validated once at deployment (deploy_init.py). Calling it per
    # run bought nothing and cost a catalog round trip on every job before any
    # work started -- which is also where a bad connection surfaced as an
    # unrelated-looking "SSL SYSCALL error" instead of a connection error.
    # get_engine() still opens the connection lazily wherever a session is needed.

    # Instantiate the Engine
    engine = CustomEngine(
        log_system_func=my_system_logger,
        log_validation_func=my_validation_logger
    )
    global job_id, job_timestamp
    # One job id per run. When the caller supplies the run id (the Celery task id the API
    # returned) the job id is derived from it, so the product's job view can find a run's
    # result rows exactly -- JOB_<run_id> -- instead of guessing by user and timestamp.
    # Without one (CLI, tests) it stays a fresh uuid, as before.
    job_id = f"JOB_{run_id or uuid.uuid4()}"
    job_timestamp = datetime.now(timezone.utc)

    # Initialize logger with job_id and user_id, and configure with LogConfig
    # logger = CustomLogger.get_logger(job_id=job_id, user_id=user_id, log_config=log_config)

    # Log the start of job execution


    check_type = None
    traditional_pipeline = None
    authenticated_user_id = None

    try:
        check_type, config_json, authenticated_user_id = validate_and_extract_check_type(input_config_json)
        # Override user_id parameter with authenticated user_id
        user_id = authenticated_user_id

        # Block the job if user_id doesn't exist in the users table. Required
        # so every result row can be attributed to a real, known user.
        if not user_id:
            raise ValueError("user_id is required and was not provided in the payload")
        session = get_db_session()
        try:
            user_exists = session.query(User).filter_by(id=user_id).first() is not None
        finally:
            session.close()
        if not user_exists:
            my_system_logger(
                "USER_NOT_FOUND", "CRITICAL",
                f"Job blocked: user_id '{user_id}' does not exist",
                context={'user_id': user_id}
            )
            raise ValueError(f"user_id '{user_id}' does not exist -- job blocked")

        # Update logger handlers with authenticated user_id
        CustomLogger.set_user_id(authenticated_user_id)
        CustomLogger.set_job_id(job_id)

        my_system_logger("JOB_START", "INFO", f"Job {job_id} started", context={'user_id': user_id})
        my_validation_logger("Validation execution started", context={'job_id': job_id, 'user': user_id})

        traditional_pipeline = ExecutionPipeline(
            config_json=config_json,
            check_type=check_type,
            log_system=my_system_logger,
            log_validation=my_validation_logger,
            validation_logs=validation_logs,
            system_logs=system_logs,
            user_id=user_id
        )

        if check_type == "traditional":
            # ExecutionPipeline.run() already writes results/<job_id>_RESULT.csv
            # before returning; writing it again here produced the identical
            # file at the identical path twice per job.
            job_df, job_status = traditional_pipeline.run()
            record_count = len(job_df) if job_df is not None else 0
            my_system_logger("TRADITIONAL_CHECKS", "INFO", f"Traditional checks completed", context={"records_validated": record_count, "status": job_status})
            my_validation_logger(f"Traditional validation completed", context={'records_validated': record_count, 'status': job_status})
            return job_status

        elif check_type == "custom_check":
            results = engine.execute_from_json(config_json, job_id=job_id, job_timestamp=job_timestamp, user_id = user_id)
            job_status = results.get("overall_criticality")
            check_count = len(config_json) if config_json else 0
            my_system_logger("CUSTOM_CHECKS", "INFO", f"Custom checks completed", context={"checks_executed": check_count, "status": job_status})
            my_validation_logger(f"Custom validation completed", context={'checks_executed': check_count, 'result': job_status})
            return job_status
        
        else:
            my_system_logger("UNKNOWN_CHECK_TYPE", "ERROR", f"Unknown check type: {check_type}")
            return "FAIL"

    except Exception as exc:
        # Mark the crash explicitly in the audit trail before it propagates --
        # previously the "JOB_END...completed" message below fired unconditionally
        # in `finally`, even when the job actually crashed, which made a dead job
        # look identical to a finished one in the logs. Re-raise so callers that
        # rely on the exception (e.g. Airflow retry/alerting) see unchanged behavior.
        my_system_logger(
            "JOB_FAILED", "CRITICAL",
            f"Job {job_id} failed with an unhandled exception: {exc}",
            context={'job_id': job_id, 'error': str(exc)}
        )
        raise

    finally:
        try:
            # Flush remaining logs to database before shutdown
            flushed_count = CustomLogger.flush_on_exit()
            my_system_logger("JOB_END", "INFO", f"Job {job_id} completed and logs flushed", context={'logs_flushed': flushed_count})
            my_validation_logger(f"Validation audit complete", context={'job_id': job_id, 'logs_persisted': flushed_count})
        except Exception as exc:
            my_system_logger("JOB_ERROR", "ERROR", f"Error during job completion: {str(exc)}", context={'error': str(exc)})
