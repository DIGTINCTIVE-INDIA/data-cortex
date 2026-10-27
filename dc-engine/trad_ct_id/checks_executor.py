from collections import defaultdict
from contextlib import ExitStack
from datetime import datetime
import csv
import os
import json
import tempfile
import uuid

import pandas as pd
from psycopg2 import sql

from Data_Code.common.failure_text import readable_failure
from trad_ct_id.cursor_factory import get_cursor
from trad_ct_id.config import BLOCKING_CHECK_IDS, DATA_CHECKS, ROW_LEVEL_CHECKS, SCHEMA_CHECKS
from trad_ct_id.db_connection import get_connection
from trad_ct_id.value_converter import (
    quote_identifier,
    normalize_rows,
    parse_json_field,
    serialize_value_for_file,
    map_to_target_type
)

from trad_ct_id.source_reader import get_source_column_types
from trad_ct_id.sql_executor import run_tc_checks
from trad_ct_id.table_processors import create_landing_table, create_valid_table
from trad_ct_id.invalid_table_loader import bulk_insert_invalid_rows_from_csv, drop_err_table
from trad_ct_id.job_status_utils import compute_job_status
from trad_ct_id.system_logger import SystemLogger
from Data_Code.common.safe_cleanup import safe_close


class ChecksExecutor:

    def __init__(self, checks_execution_df, job_id, job_timestamp, metadata_map, logger=None, user_id=None):
        self.df            = checks_execution_df
        self.job_id        = job_id
        self.job_timestamp = job_timestamp
        self.metadata_map  = metadata_map
        self.user_id       = user_id
        # Central per-pipeline-run logger, if supplied by the caller (dc_engine.py),
        # so traditional-check logs land in the same job-scoped log store as
        # everything else in the run. Falls back to the old standalone
        # in-memory SystemLogger when ChecksExecutor is used on its own (e.g. main.py).
        self.logger        = logger if logger is not None else SystemLogger(job_id)
        self.job_results   = []

    def get_primary_key_column(self, cur, source_database_type, db_schema, table_name):
        # If database_type is snowflake then check for pk as unique row_identifier
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
    
    """
    all_failed_row_ids: set of row_ids failed in any check
    check_result: dict of check results
    
    check_results = {
     KEY              VALUE
    (check_col)      (check_entries)
    "_null_check":   [entry1, entry2],
    "_length_check": [entry3],
    "_lov_check":    [entry4]
    }
    """
    

    def build_invalid_row_metadata(self, all_failed_row_ids, check_results):
        
        invalid_row_metadata = {}
        # Create an empty dictionary for each failed row
        for row_id in all_failed_row_ids:
            invalid_row_metadata[row_id] = {}

        for check_col, check_entries in check_results.items():
            # Loop through each check in check entry
            for check in check_entries:

                fields = check["field"] if isinstance(check["field"], list) else [check["field"]]
                failed_set = check["failed_row_ids"]

                # Loop thru each failed_id
                for row_id in all_failed_row_ids:

                    status = "Fail" if row_id in failed_set else "Pass"

                    if check_col not in invalid_row_metadata[row_id]:
                        invalid_row_metadata[row_id][check_col] = []

                    # Update field and status for each row_id and check_name
                    invalid_row_metadata[row_id][check_col].append({
                        "fields": fields,
                        "status": status
                    })

                    # RCA only for failed data checks that have details
                    if status == "Fail" and check["check_mapping_name"] in DATA_CHECKS:
                        
                        reason = check["failed_details"].get(row_id)
                        
                        if reason:
                            rca_col = f"{check_col}_rca"
                            # If RCA column does not exist in dict create empty dict
                            if rca_col not in invalid_row_metadata[row_id]:
                                invalid_row_metadata[row_id][rca_col] = []
                                
                            
                            invalid_row_metadata[row_id][rca_col].append({
                                "fields": fields,
                                "rca": json.loads(reason) if isinstance(reason, str) else reason
                            })

        return invalid_row_metadata

    # Fixed Columns + Source Columns + Check Columns 
    def build_csv_columns(
        self,
        source_cur,
        source_schema,
        table_name,
        source_database_type,
        check_results
    ):
  
        # Always include these columns, add source columns into this
        columns = ["_job_id", "_job_timestamp"]

        # Fetches all source columns
        try:
            raw_types = get_source_column_types(
                source_cur, source_schema,
                table_name, source_database_type
            )
            
            # Add source columns keys to column list
            for col in raw_types.keys():
                if col not in columns:
                    columns.append(col)
                    
                    
        except Exception as e:
            self.logger.log_system(
                code="SOURCE_COLS_FETCH_FAILED",
                severity="WARNING",
                message="Could not fetch source columns for CSV header",
                context={"error": str(e)}
            )

        # Append all the columns of check_results if does not exist
        for check_col, check_entries in check_results.items():
            if check_col not in columns:
                columns.append(check_col)
            
            # Add RCA columns to the column list
            for check in check_entries:
                if check["check_mapping_name"] in DATA_CHECKS:
                    rca_col = f"{check_col}_rca"
                    if rca_col not in columns:
                        columns.append(rca_col)

        return columns

    # Execution starts 
    def execute(self):

        self.logger.log_system(
            code="JOB_START", severity="INFO",
            message="Checks execution started",
            context={"total_rows": len(self.df)}
        )

        
        # config_id -> the gate that closed it, so every check skipped afterwards can
        # name the specific check that stopped it rather than just saying "stopped".
        aborted_configs = {}
        grouped_by_connection = defaultdict(list)

        # Group according to config_id and source and target connection ids
        for _, row in self.df.iterrows():
            key = (
                row.get("config_id"),
                row.get("source_connection_id"),
                row.get("target_connection_id")
            )
            grouped_by_connection[key].append(row)

        for (
            config_id,
            source_connection_id,
            target_connection_id
        ), config_rows in grouped_by_connection.items():

            first_row = config_rows[0]

            source_connection_details = self.metadata_map[source_connection_id]
            target_connection_details = self.metadata_map[target_connection_id]
            # Fetch source and target connection details
            source_database_type = source_connection_details["database_type"]
            target_database_type = target_connection_details["database_type"]
            source_database_name = source_connection_details["database_name"]
            target_database_name = target_connection_details["database_name"]
            source_schema = source_connection_details["db_schema"]
            target_schema = target_connection_details["db_schema"]

            table_name = first_row.get("source_table_name")
            target_table_prefix = first_row.get("target_table_prefix")

            snapshot_table_name = None
            snowflake_transaction_started = False

            # Establish Connection
            with get_connection(source_connection_id) as source_conn, \
                 get_connection(target_connection_id) as target_conn:

                source_cur = get_cursor(source_conn, source_database_type)
                target_cur = get_cursor(target_conn, target_database_type)

                try:

                    # Validate source schema exists
                    source_cur.execute(
                        """
                        SELECT schema_name FROM information_schema.schemata
                        WHERE schema_name = %s
                        """,
                        (
                            source_schema.upper() if source_database_type == "snowflake"
                            else source_schema,
                        )
                    )

                    if not source_cur.fetchone():
                        self.logger.log_system(
                            code="INVALID_SOURCE_SCHEMA", severity="CRITICAL",
                            message="Source schema does not exist",
                            context={
                                "source_schema":        source_schema,
                                "source_connection_id": source_connection_id
                            }
                        )
                        raise ValueError(
                            f"Source schema '{source_schema}' does not exist"
                        )

                    # Validate target schema exists
                    target_cur.execute(
                        """
                        SELECT schema_name FROM information_schema.schemata
                        WHERE schema_name = %s
                        """,
                        (
                            target_schema.upper() if target_database_type == "snowflake"
                            else target_schema,
                        )
                    )

                    if not target_cur.fetchone():
                        self.logger.log_system(
                            code="INVALID_TARGET_SCHEMA", severity="CRITICAL",
                            message="Target schema does not exist",
                            context={
                                "target_schema":        target_schema,
                                "target_connection_id": target_connection_id
                            }
                        )
                        raise ValueError(
                            f"Target schema '{target_schema}' does not exist"
                        )

                    self.logger.log_system(
                        code="CONFIG_START", severity="INFO",
                        message="Processing config",
                        context={"config_id": config_id}
                    )

                    # The table the user configured. A Snowflake table with no primary key
                    # is copied into a session-temporary snapshot below, and table_name is
                    # re-pointed at it so row-level checks can use a generated row id. That
                    # copy has an extra leading column (dc_id), so anything about the
                    # table's own shape -- column names, order, types -- or its name in
                    # results must keep using the real one. Using the snapshot reported
                    # "expected CUSTOMER_ID but found DC_ID" for a table that was fine.
                    real_table_name = table_name

                    pk_columns = self.get_primary_key_column(
                        source_cur, source_database_type, source_schema, table_name
                    )

                    # Select row_identifier as per the source db
                    if source_database_type == "postgresql":
                        row_identifier_column = "ctid"

                    elif len(pk_columns) == 1:
                        # Snowflake with real PK
                        row_identifier_column = pk_columns[0]

                    else:
                        # Snowflake with no PK, create temp snapshot with dc_id
                        snapshot_table_name = f"{table_name}_dc_snapshot"

                        source_cur.execute(f"""
                            CREATE OR REPLACE TEMPORARY TABLE
                            {quote_identifier(source_schema, source_database_type)}.
                            {quote_identifier(snapshot_table_name, source_database_type)}
                            AS
                            SELECT ROW_NUMBER() OVER (ORDER BY 1) AS dc_id, *
                            FROM {quote_identifier(source_schema, source_database_type)}.
                            {quote_identifier(table_name, source_database_type)}
                        """)

                        table_name = snapshot_table_name
                        row_identifier_column = "dc_id"

                    if source_database_type == "postgresql":
                        
                        try:
                            source_cur.execute(
                                sql.SQL("LOCK TABLE {}.{} IN SHARE MODE").format(
                                    sql.Identifier(source_schema),
                                    sql.Identifier(table_name)
                                )
                            )
                            self.logger.log_system(
                                code="TABLE_LOCK_ACQUIRED", severity="INFO",
                                message="Source table locked",
                                context={"schema": source_schema, "table": table_name}
                            )
                        except Exception as e:
                            self.logger.log_system(
                                code="TABLE_LOCK_FAILED", severity="WARNING",
                                message="Could not lock source table, proceeding without lock",
                                context={"error": str(e)}
                            )

                    elif source_database_type == "snowflake" and len(pk_columns) == 1:
                        # Only when real PK exists
                        try:
                            source_cur.execute("BEGIN")
                            snowflake_transaction_started = True
                            self.logger.log_system(
                                code="SNOWFLAKE_TRANSACTION_STARTED", severity="INFO",
                                message="Snowflake transaction started for consistent read",
                                context={"schema": source_schema, "table": table_name}
                            )
                            
                        except Exception as e:
                            self.logger.log_system(
                                code="SNOWFLAKE_TRANSACTION_FAILED", severity="WARNING",
                                message="Could not start Snowflake transaction",
                                context={"error": str(e)}
                            )

                    # Count total rows
                    try:
                        count_query = (
                            f"SELECT COUNT(*) FROM "
                            f"{quote_identifier(source_schema, source_database_type)}."
                            f"{quote_identifier(table_name, source_database_type)}"
                        )
                        source_cur.execute(count_query)
                        row = source_cur.fetchone()
                        total_rows = next(iter(row.values()))
                        
                    except Exception as e:
                        self.logger.log_system(
                            code="ROW_COUNT_FAILED", severity="WARNING",
                            message="Could not count source rows, defaulting to 0",
                            context={"error": str(e)}
                        )
                        total_rows = 0

                    executed_checks = set()
                    all_failed_row_ids = set()
                    check_results = {}
                    config_results_from = len(self.job_results)

                    # For each row in config rows
                    for row in config_rows:

                        check_mapping_name = row.get("check_mapping_name")
                        # For pk it stores just check_id to run composite key else check_id, field to check each field separately
                        check_key = (
                            row.get("check_id")
                            if check_mapping_name == "primary_key_check"
                            else (row.get("check_id"), row.get("field"))
                        )

                        # Avoid duplicate check
                        if check_key in executed_checks:
                            continue
                        executed_checks.add(check_key)

                        # Check for abort flag
                        # The library's flag AND membership in the blocking set: the set is the
                        # rule, so a stale or hand-edited abort=True on any other check cannot
                        # make it stop the config.
                        abort_flag = (
                            str(row.get("abort")).lower() == "true"
                            and str(row.get("check_id")).upper() in BLOCKING_CHECK_IDS
                        )

                        # An earlier gate closed this config, so this check does not
                        # run. Record it rather than dropping it: a config that stops
                        # at TC002 would otherwise silently produce fewer rows than it
                        # has checks, and nothing in results would say why the rest are
                        # missing. "upstream_failed" is terminal -- it is not pending
                        # and will not be retried -- and like "error" it is a statement
                        # about our run, not about the client's data.
                        if config_id in aborted_configs:
                            gate = aborted_configs[config_id]

                            self.job_results.append({
                                "job_id": self.job_id,
                                "job_timestamp": datetime.now(),
                                "check_id": row.get("check_id"),
                                "check_name": row.get("check_name"),
                                "check_description": row.get("check_description"),
                                "config_id": config_id,
                                "config_name": row.get("config_name"),
                                "check_category": row.get("check_category"),
                                "workstream": row.get("workstream"),
                                "data_source": row.get("data_source"),
                                "impacted_downstream": row.get("impacted_downstream"),
                                "file_or_table_name": real_table_name,
                                # No field: the check never ran, so it never bound to
                                # one. Not "NA" -- that would read as a real value.
                                "field": None,
                                "check_type": "traditional",
                                "check_status": "upstream_failed",
                                "criticality": row.get("criticality"),
                                "abort": abort_flag,
                                # Neither counted nor zero -- nothing was examined.
                                "issue_rows": "NA",
                                "passed_rows": "NA",
                                "user_id": self.user_id,
                                "failure_reason": (
                                    f"Not run: {gate['check_id']} ({gate['check_name']}) "
                                    f"returned {gate['check_status']} and is a required "
                                    f"gate for this configuration."
                                ),
                                "issue_status": "open",
                            })
                            continue

                        if check_mapping_name in SCHEMA_CHECKS:
                            field = None

                        elif check_mapping_name == "primary_key_check":
                            pk_fields = []
                            for r in config_rows:
                                if (r.get("check_id") == row.get("check_id")
                                        and r.get("field") not in pk_fields):
                                    pk_fields.append(r.get("field"))
                            field = pk_fields[0] if len(pk_fields) == 1 else pk_fields

                        else:
                            field = row.get("field")


                        # Each check runs inside its own savepoint on Postgres. A statement that
                        # fails (a missing column, a bad pattern) leaves the WHOLE transaction
                        # aborted, and every later statement on that connection then fails with
                        # "current transaction is aborted" -- so one bad check used to take down
                        # every check after it and the writes to the target, killing the job.
                        # Rolling back to the savepoint undoes only that check.
                        use_savepoint = source_database_type == "postgresql"

                        if use_savepoint:
                            try:
                                source_cur.execute("SAVEPOINT dc_check")
                            except Exception:
                                use_savepoint = False

                        # A referential check whose parent table is on ANOTHER connection
                        # needs a cursor on that connection; one on this connection is
                        # answered in SQL with a join.
                        parent_stack = ExitStack()
                        ri_parent = None

                        try:
                            if check_mapping_name == "ri_check":
                                ri_connection_id = row.get("detail1")

                                if ri_connection_id and ri_connection_id != source_connection_id:
                                    parent_details = self.metadata_map[ri_connection_id]
                                    parent_conn = parent_stack.enter_context(get_connection(ri_connection_id))
                                    ri_parent = {
                                        "cursor": get_cursor(parent_conn, parent_details["database_type"]),
                                        "database_type": parent_details["database_type"],
                                    }

                            result_dict, failed_row_ids, failed_details, *_ = run_tc_checks(
                                cur=source_cur,
                                table_name=(
                                    real_table_name
                                    if check_mapping_name in SCHEMA_CHECKS or check_mapping_name == "file_availability_check"
                                    else table_name
                                ),
                                field=field,
                                database_type=source_database_type,
                                row_identifier_column=row_identifier_column,
                                check_mapping_name=check_mapping_name,
                                logger=self.logger,
                                config_id=config_id,
                                config_name=row.get("config_name"),
                                check_id=row.get("check_id"),
                                check_name=row.get("check_name"),
                                check_description=row.get("check_description"),
                                check_category=row.get("check_category"),
                                workstream=row.get("workstream"),
                                data_source=row.get("data_source"),
                                criticality=row.get("criticality"),
                                impacted_downstream=row.get("impacted_downstream"),
                                abort=abort_flag,
                                job_id=self.job_id,
                                total_rows=total_rows,
                                detail1=row.get("detail1"),
                                detail2=row.get("detail2"),
                                detail3=row.get("detail3"),
                                detail4=row.get("detail4"),
                                # Only the schema checks (TC002-TC004) read these. Elsewhere the
                                # cell holds the field's own type name, which is not a schema map.
                                column_order=(
                                    parse_json_field(row.get("column_order"))
                                    if check_mapping_name in SCHEMA_CHECKS else None
                                ),
                                column_datatype=(
                                    parse_json_field(row.get("column_datatype"))
                                    if check_mapping_name in SCHEMA_CHECKS else None
                                ),
                                db_schema=source_schema,
                                metadata_map=self.metadata_map,
                                user_id=self.user_id,
                                ri_parent=ri_parent
                            )

                            if use_savepoint:
                                source_cur.execute("RELEASE SAVEPOINT dc_check")
                        except Exception as e:
                            if use_savepoint:
                                try:
                                    source_cur.execute("ROLLBACK TO SAVEPOINT dc_check")
                                except Exception:
                                    pass

                            self.logger.log_system(
                                code="CHECK_EXECUTION_FAILED", severity="ERROR",
                                message=f"Check {check_mapping_name} failed to execute",
                                context={
                                    "check_id":   row.get("check_id"),
                                    "field":      field,
                                    "error":      str(e)
                                }
                            )
                            # Record the failure as an explicit "error" result row instead
                            # of silently dropping it -- a check that couldn't run must be
                            # distinguishable in public.results from one that was never
                            # configured at all.
                            self.job_results.append({
                                "job_id": self.job_id,
                                "job_timestamp": datetime.now(),
                                "check_id": row.get("check_id"),
                                "check_name": row.get("check_name"),
                                "check_description": row.get("check_description"),
                                "config_id": config_id,
                                "config_name": row.get("config_name"),
                                "check_category": row.get("check_category"),
                                "workstream": row.get("workstream"),
                                "data_source": row.get("data_source"),
                                "impacted_downstream": row.get("impacted_downstream"),
                                "file_or_table_name": real_table_name,
                                "field": field,
                                "check_type": "traditional",
                                "check_status": "error",
                                # A check that couldn't even run is at least as concerning as
                                # one that ran and failed -- default to "high" if no criticality
                                # was configured, rather than leaving it blank/unknown.
                                "criticality": row.get("criticality") or "high",
                                "abort": abort_flag,
                                "issue_rows": "NA",
                                "passed_rows": "NA",
                                "user_id": self.user_id,
                                # The exception itself goes to system_logs; what lands in
                                # results is read by business users in QC Alerts.
                                "failure_reason": readable_failure(e),
                                "issue_status": "open",
                            })
                            continue
                        finally:
                            parent_stack.close()

                        # run_tc_checks echoes back the table it was given, which for a
                        # snapshotted table is the temporary copy. Business users see the
                        # table they configured.
                        result_dict["file_or_table_name"] = real_table_name

                        self.job_results.append(result_dict)
                        if check_mapping_name in ROW_LEVEL_CHECKS:

                            check_col = f"_{check_mapping_name}"

                            if failed_row_ids:
                                # If a check doesnt exists create an entry 
                                if check_col not in check_results:
                                    check_results[check_col] = []

                                # Create a dict and append in the list
                                check_results[check_col].append({
                                    "field":              field if isinstance(field, list) else [field],
                                    "failed_row_ids":     set(map(str, failed_row_ids or [])),
                                    "failed_details":     failed_details or {},
                                    "check_mapping_name": check_mapping_name
                                })

                                all_failed_row_ids.update(map(str, failed_row_ids))

                        # An abort check that did not pass stops the rest of this
                        # config. "error" counts as well as "failed": a check that
                        # could not run has not established what it was there to
                        # establish, so continuing is no safer than continuing after
                        # an outright failure.
                        #
                        # This previously matched "failed" alone, so a schema check
                        # (TC002/TC003/TC004, all abort=True) that errored let every
                        # later check run anyway -- against a table whose columns,
                        # order and datatypes had never been verified.
                        if result_dict["check_status"] in ("failed", "error") and abort_flag:
                            aborted_configs[config_id] = {
                                "check_id": row.get("check_id"),
                                "check_name": row.get("check_name"),
                                "check_status": result_dict["check_status"],
                            }

                            self.logger.log_system(
                                code="CONFIG_ABORTED",
                                severity="WARNING",
                                message=(
                                    f"Config {config_id} aborted at {row.get('check_id')} "
                                    f"({check_mapping_name}): check_status="
                                    f"{result_dict['check_status']}, abort=True. "
                                    "Remaining checks for this config will not run."
                                ),
                                context={
                                    "config_id": config_id,
                                    "check_id": row.get("check_id"),
                                    "check_mapping_name": check_mapping_name,
                                    "check_status": result_dict["check_status"],
                                },
                            )

                    # The run-level row picture, stamped on every result of this config so the Jobs
                    # page can show "checks" and "rows" as two separate things: how many rows the
                    # table had, and how many DIFFERENT rows failed at least one check (a row that
                    # fails three checks is still one row). A config stopped by a gate check never
                    # evaluated its rows, so it reports none rather than a misleading zero.
                    config_evaluated = config_id not in aborted_configs
                    for config_result in self.job_results[config_results_from:]:
                        config_result["rows_total"] = int(total_rows) if config_evaluated else None
                        config_result["rows_failed"] = len(all_failed_row_ids) if config_evaluated else None

                    self.logger.log_system(
                        code="CONFIG_COMPLETED", severity="INFO",
                        message="Config processing completed",
                        context={"config_id": config_id}
                    )

                    # LANDING TABLE
                    #
                    # The config's landing_table flag is honoured here. It was
                    # stored but never read, so the landing table was created
                    # unconditionally and the setting did nothing. Absent/NULL
                    # is treated as True, so existing configs behave exactly as
                    # before.
                    landing_table_enabled = first_row.get("landing_table")
                    if landing_table_enabled is None or pd.isna(landing_table_enabled):
                        landing_table_enabled = True
                    landing_table_name = first_row.get("landing_table_name") or None
                    if landing_table_name is not None and pd.isna(landing_table_name):
                        landing_table_name = None

                    if not landing_table_enabled:
                        self.logger.log_system(
                            code="LANDING_TABLE_SKIPPED", severity="INFO",
                            message="Landing table disabled for this config -- skipping",
                            context={"config_id": config_id, "schema": target_schema}
                        )
                    else:
                        resolved_landing_name = landing_table_name or f"{target_table_prefix}_landing"
                        self.logger.log_system(
                            code="LANDING_TABLE_START", severity="INFO",
                            message="Creating landing table",
                            context={"table": resolved_landing_name, "schema": target_schema}
                        )

                        try:
                            create_landing_table(
                                source_cur=source_cur,
                                target_cur=target_cur,
                                source_connection_details=source_connection_details,
                                target_connection_details=target_connection_details,
                                source_database_name=source_database_name,
                                source_schema=source_schema,
                                source_table=table_name,
                                target_database_name=target_database_name,
                                target_schema=target_schema,
                                target_table_prefix=target_table_prefix,
                                row_identifier_column=row_identifier_column,
                                landing_table_name=landing_table_name
                            )
                            self.logger.log_system(
                                code="LANDING_TABLE_DONE", severity="INFO",
                                message="Landing table created",
                                context={"table": resolved_landing_name, "schema": target_schema}
                            )
                        except Exception as e:
                            self.logger.log_system(
                                code="LANDING_TABLE_FAILED", severity="ERROR",
                                message="Landing table creation failed",
                                context={"table": resolved_landing_name, "error": str(e)}
                            )
                            raise


                    # landing Table
                    self.logger.log_system(
                        code="VALID_TABLE_START", severity="INFO",
                        message="Creating valid table",
                        context={"table": target_table_prefix, "schema": target_schema}
                    )

                    try:
                        create_valid_table(
                            source_cur=source_cur,
                            target_cur=target_cur,
                            source_connection_details=source_connection_details,
                            target_connection_details=target_connection_details,
                            source_database_name=source_database_name,
                            source_schema=source_schema,
                            source_table=table_name,
                            target_database_name=target_database_name,
                            target_schema=target_schema,
                            target_table_prefix=target_table_prefix,
                            job_id=self.job_id,
                            job_timestamp=self.job_timestamp,
                            row_identifier_column=row_identifier_column,
                            failed_row_identifiers=all_failed_row_ids
                        )
                        self.logger.log_system(
                            code="VALID_TABLE_DONE", severity="INFO",
                            message="Valid table created",
                            context={"table": target_table_prefix, "schema": target_schema}
                        )
                    except Exception as e:
                        self.logger.log_system(
                            code="VALID_TABLE_FAILED", severity="ERROR",
                            message="Valid table creation failed",
                            context={"table": target_table_prefix, "error": str(e)}
                        )
                        raise
                    
                    # If failed records exists
                    if all_failed_row_ids:
                        # Fetch data type of source table
                        source_column_types = {}
                        try:
                            raw_types = get_source_column_types(
                                source_cur, source_schema,
                                table_name, source_database_type
                            )
                            
                            # Convert data type to target database type
                            source_column_types = {
                                col: map_to_target_type(dtype, target_database_type)
                                for col, dtype in raw_types.items()
                            }
                        except Exception as e:
                            self.logger.log_system(
                                code="SOURCE_TYPES_FETCH_FAILED",
                                severity="WARNING",
                                message="Could not fetch source column types, TEXT fallback",
                                context={"error": str(e)}
                            )

                        # Decide the columns for CSV 
                        columns = self.build_csv_columns(
                            source_cur, source_schema,
                            table_name, source_database_type,
                            check_results
                        )

                        try:
                            # Fetch failed rows from postgres
                            if source_database_type == "postgresql":
                                fetch_query = (
                                    f"SELECT ctid::text AS row_identifier, * "
                                    f"FROM {quote_identifier(source_schema, source_database_type)}."
                                    f"{quote_identifier(table_name, source_database_type)} "
                                    f"WHERE ctid::text = ANY(%s)"
                                )
                                source_cur.execute(fetch_query, [list(all_failed_row_ids)])

                            # fetch failed rows from snowflake
                            elif source_database_type == "snowflake":
                                ri_col = quote_identifier(
                                    row_identifier_column, source_database_type
                                )
                                placeholders = ", ".join("%s" for _ in all_failed_row_ids)
                                fetch_query = (
                                    f"SELECT {ri_col}::TEXT AS row_identifier, * "
                                    f"FROM {quote_identifier(source_schema, source_database_type)}."
                                    f"{quote_identifier(table_name, source_database_type)} "
                                    f"WHERE {ri_col}::TEXT IN ({placeholders})"
                                )
                                source_cur.execute(fetch_query, list(all_failed_row_ids))

                        except Exception as e:
                            self.logger.log_system(
                                code="INVALID_FETCH_FAILED", severity="ERROR",
                                message="Failed to fetch invalid rows from source",
                                context={"error": str(e)}
                            )
                            raise
                        
                        invalid_row_metadata = self.build_invalid_row_metadata(
                            all_failed_row_ids, check_results
                        )

                        # Skip the row_identifier columns 
                        if isinstance(row_identifier_column, list):
                            skip_cols = {c.lower() for c in row_identifier_column}
                        else:
                            skip_cols = {row_identifier_column.lower()}
                        skip_cols.add("row_identifier")

                        # Create a temporary CSV file on EC2 /tmp/ folder
                        temp_file_path = os.path.join(
                            tempfile.gettempdir(),
                            f"{target_table_prefix}_err_{uuid.uuid4().hex}.csv"
                        )

                        csv_writer = None
                        csv_file   = None
                        has_rows   = False

                        # Starting writing into CSV file
                        try:
                            # Open csv file to write
                            csv_file = open(
                                temp_file_path, "w", newline="", encoding="utf-8"
                            )

                            # Create a writer 
                            csv_writer = csv.DictWriter(
                                csv_file,
                                fieldnames=columns,
                                extrasaction='ignore',
                                restval=None
                            )
                            # Writes the header lines(columns)
                            csv_writer.writeheader()
                            # Fetch rows in chunks
                            while True:
                                try:
                                    chunk = source_cur.fetchmany(5000)
                                except Exception as e:
                                    self.logger.log_system(
                                        code="CHUNK_FETCH_FAILED", severity="ERROR",
                                        message="Failed to fetch chunk from source",
                                        context={"error": str(e)}
                                    )
                                    raise

                                if not chunk:
                                    break

                                # Normalise rows to lowercase
                                source_rows = normalize_rows(chunk)
                                # Fetch each row rom source table
                                for source_row in source_rows:

                                    row_id = str(source_row.get("row_identifier"))
                                    row_metadata = invalid_row_metadata.get(row_id)

                                    if row_metadata is None:
                                        continue

                                    # Build merged row
                                    merged_row = {}
                                    merged_row["_job_id"]        = self.job_id
                                    merged_row["_job_timestamp"] = self.job_timestamp.isoformat()

                                    # Source columns, skip identifier columns
                                    for key, value in source_row.items():
                                        if key in skip_cols:
                                            continue
                                        merged_row[key] = value

                                    # Check results + RCA columns
                                    merged_row.update(row_metadata)

                            
                                    try:
                                        # Serialise value to write in csv file
                                        clean_row = {
                                            col: serialize_value_for_file(
                                                merged_row.get(col), col, target_database_type
                                            )
                                            for col in columns
                                        }
                                        # Write each row into csv file
                                        csv_writer.writerow(clean_row)
                                        has_rows = True
                                        
                                    except Exception as e:
                                        self.logger.log_system(
                                            code="ROW_SERIALIZE_FAILED",
                                            severity="WARNING",
                                            message="Could not serialize row, skipping",
                                            context={"row_id": row_id, "error": str(e)}
                                        )
                                        continue

                            csv_file.close()
                            csv_file = None

                            if has_rows:

                                self.logger.log_system(
                                    code="INVALID_TABLE_START", severity="INFO",
                                    message="Inserting invalid rows into target via CSV COPY",
                                    context={
                                        "table":  target_table_prefix,
                                        "schema": target_schema
                                    }
                                )

                                # Bulk insert into target database using COPY command 
                                try:
                                    bulk_insert_invalid_rows_from_csv(
                                        target_cur=target_cur,
                                        local_file_path=temp_file_path,
                                        columns=columns,
                                        target_table_prefix=target_table_prefix,
                                        target_schema=target_schema,
                                        target_connection_details=target_connection_details,
                                        source_column_types=source_column_types
                                    )
                                    
                                    self.logger.log_system(
                                        code="INVALID_TABLE_DONE", severity="INFO",
                                        message="Invalid rows inserted successfully",
                                        context={
                                            "table":  target_table_prefix,
                                            "schema": target_schema
                                        }
                                    )
                                except Exception as e:
                                    self.logger.log_system(
                                        code="INVALID_TABLE_LOAD_FAILED", severity="ERROR",
                                        message="Failed to load invalid rows into target",
                                        context={
                                            "table":  target_table_prefix,
                                            "error":  str(e)
                                        }
                                    )
                                    raise

                        except Exception as e:
                            self.logger.log_system(
                                code="INVALID_TABLE_FAILED", severity="ERROR",
                                message="Invalid table creation failed",
                                context={"table": target_table_prefix, "error": str(e)}
                            )
                            raise

                        finally:

                            # Close the csv file
                            safe_close(csv_file, log_fn=lambda msg: self.logger.log_system(
                                code="CLEANUP_WARNING", severity="DEBUG", message=msg
                            ))

                            # Remove the csv from EC2
                            if os.path.exists(temp_file_path):
                                try:
                                    os.remove(temp_file_path)
                                except Exception as e:
                                    self.logger.log_system(
                                        code="TEMP_FILE_DELETE_FAILED",
                                        severity="WARNING",
                                        message="Could not delete temp CSV file",
                                        context={
                                            "file":  temp_file_path,
                                            "error": str(e)
                                        }
                                    )


                    else:
                        # Nothing failed this run, so `_err` must not keep the last run's rows.
                        # (`_err_hist` is the table that accumulates; it is left alone.)
                        try:
                            drop_err_table(
                                target_cur, target_schema, f"{target_table_prefix}_err",
                                target_database_type,
                            )
                        except Exception as e:
                            self.logger.log_system(
                                code="ERR_TABLE_RESET_FAILED", severity="WARNING",
                                message="Could not clear the previous run's failure table",
                                context={"table": target_table_prefix, "error": str(e)}
                            )

                finally:

                    # Commit Snowflake transaction if started
                    if snowflake_transaction_started:
                        try:
                            source_cur.execute("COMMIT")
                            self.logger.log_system(
                                code="SNOWFLAKE_TRANSACTION_COMMITTED", severity="INFO",
                                message="Snowflake transaction committed",
                                context={"schema": source_schema, "table": table_name}
                            )
                        except Exception as e:
                            self.logger.log_system(
                                code="SNOWFLAKE_TRANSACTION_COMMIT_FAILED", severity="WARNING",
                                message="Could not commit Snowflake transaction",
                                context={"error": str(e)}
                            )

                    # Drop temporary snapshot table if created
                    if snapshot_table_name and source_database_type == "snowflake":
                        try:
                            source_cur.execute(
                                f"DROP TABLE IF EXISTS "
                                f"{quote_identifier(source_schema, source_database_type)}."
                                f"{quote_identifier(snapshot_table_name, source_database_type)}"
                            )
                            self.logger.log_system(
                                code="SNAPSHOT_DROPPED", severity="INFO",
                                message="Snapshot table dropped",
                                context={
                                    "table":  snapshot_table_name,
                                    "schema": source_schema
                                }
                            )
                            
                        except Exception as e:
                            self.logger.log_system(
                                code="SNAPSHOT_DROP_FAILED", severity="WARNING",
                                message="Could not drop snapshot table",
                                context={"table": snapshot_table_name, "error": str(e)}
                            )

                    _cleanup_log = lambda msg: self.logger.log_system(
                        code="CLEANUP_WARNING", severity="DEBUG", message=msg
                    )
                    safe_close(source_cur, log_fn=_cleanup_log)
                    safe_close(target_cur, log_fn=_cleanup_log)

                try:
                    source_conn.commit()
                except Exception as e:
                    self.logger.log_system(
                        code="SOURCE_COMMIT_FAILED", severity="WARNING",
                        message="Source connection commit failed",
                        context={"error": str(e)}
                    )

                try:
                    target_conn.commit()
                except Exception as e:
                    self.logger.log_system(
                        code="TARGET_COMMIT_FAILED", severity="WARNING",
                        message="Target connection commit failed",
                        context={"error": str(e)}
                    )

        self.logger.log_system(
            code="JOB_END", severity="INFO",
            message="Checks execution completed",
            context={"total_checks": len(self.job_results)}
        )

        job_df = pd.DataFrame(self.job_results)
        job_status = compute_job_status(self.job_results)

        return job_df, job_status