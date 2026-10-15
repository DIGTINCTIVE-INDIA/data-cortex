import pandas as pd

from dotenv import load_dotenv
import os

from Data_Code.connectors.file.manager import FileConnectionManager
from Data_Code.common.sanitization import sanitize_file_name_for_table
from temp_connectors import get_connection, fetch_table, close_connection
from tc_json_validator import TcJSONConfigValidator


class GenerateExecutionDF:
    def __init__(self, config_json, log_system, log_validation, validation_logs, system_logs):
        self.config_json = config_json
        self.log_system = log_system
        self.log_validation = log_validation
        self.validation_logs = validation_logs
        self.system_logs = system_logs
        # (connection_id, table_name) pairs created by process_fc_connections()'s
        # file-ingestion step this run -- these live in the product DB (see
        # decisions_needed.csv #9) and MUST be destroyed once the job's checks are
        # done reading them (see #10). Populated during run(), read by the caller
        # (dc_engine.py) after check execution completes.
        self.ingested_tables = []

    def run(self) -> pd.DataFrame:
        config_json = self.config_json
        log_system = self.log_system
        log_validation = self.log_validation
        validation_logs = self.validation_logs
        system_logs = self.system_logs

        # Create Connection for Internal Operations

        load_dotenv()
        host = os.getenv("RDS_HOST")
        port = os.getenv("RDS_PORT", 5432)
        database = os.getenv("RDS_DATABASE")
        user = os.getenv("RDS_USERNAME") # postgres
        password = os.getenv("RDS_PASSWORD")
        schema = None


        conn = get_connection(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            schema="public",
            log_system=log_system
        )

        # Fail here rather than letting the `if conn:` blocks below silently skip,
        # which left traditional_checks_library_df unbound and surfaced as a
        # NameError several lines later with nothing pointing at the connection.
        if not conn:
            raise ConnectionError(
                "Could not connect to the product database, so no check configuration "
                f"could be read. host={host!r} port={port!r} database={database!r} "
                f"user={user!r} schema='public'. Check RDS_HOST / RDS_PORT / "
                "RDS_DATABASE / RDS_USERNAME / RDS_PASSWORD."
            )

        traditional_checks_library_df = fetch_table(
            connection=conn,
            table_name="traditional_checks_library_rev",
            log_system=log_system
        )
        print(f"Fetched {len(traditional_checks_library_df)} records from traditional_checks_library_rev")

        # An empty check library means nothing can be resolved to a check function,
        # so every config would look like it has "no checks" regardless of its field
        # rules. Say that, rather than blaming the config.
        #
        # fetch_table swallows a query error into a WARNING and returns an empty
        # frame, so "0 rows" here can also mean the SELECT itself failed -- check the
        # system log for FETCH_TABLE errors before assuming the table is empty.
        if traditional_checks_library_df.empty:
            raise ValueError(
                "traditional_checks_library_rev returned 0 rows. The check-type catalogue "
                "(TC001-TC011) is missing, so no field rule can be mapped to a check "
                "function. Either the table was never seeded (the backend's `db:init` "
                "seeds it), or the fetch failed -- look for a FETCH_TABLE warning above "
                "with the real error."
            )

        # Only this job's configs. Fetching the whole table and filtering in
        # pandas is fine with a handful of configs and not fine with hundreds.
        requested_config_ids = [
            item["config_id"]
            for item in config_json
            if isinstance(item, dict) and item.get("config_id")
        ]

        if not requested_config_ids:
            raise ValueError(
                "No config_id was supplied in the job payload. Every entry in config_json "
                f"must carry a 'config_id'. Received {len(config_json)} entry/entries: "
                f"{config_json!r}"
            )

        traditional_config_details_df = fetch_table(
            connection=conn,
            table_name="traditional_config_details",
            log_system=log_system,
            config_ids=requested_config_ids
        )
        print(
            f"Fetched {len(traditional_config_details_df)} records from "
            f"traditional_config_details for {requested_config_ids}"
        )

        # Report per config rather than in total, so a job mixing one configured and
        # one unconfigured config_id names the offender instead of reporting a
        # misleading overall count.
        if traditional_config_details_df.empty:
            rules_per_config = {config_id: 0 for config_id in requested_config_ids}
        else:
            counts = traditional_config_details_df["config_id"].value_counts().to_dict()
            rules_per_config = {
                config_id: int(counts.get(config_id, 0)) for config_id in requested_config_ids
            }

        for config_id, rule_count in rules_per_config.items():
            print(f"  {config_id}: {rule_count} field rule(s)")

        configs_without_rules = [cid for cid, count in rules_per_config.items() if count == 0]

        if configs_without_rules:
            message = (
                "No field rules in traditional_config_details for: "
                f"{configs_without_rules}. A config with no field rules has nothing to "
                "check -- configure its columns first."
            )
            log_system(
                code="CONFIG_DETAILS_MISSING",
                severity="ERROR" if len(configs_without_rules) == len(requested_config_ids) else "WARNING",
                message=message,
                context={
                    "step": "generate_execution_df",
                    "requested_config_ids": requested_config_ids,
                    "rules_per_config": rules_per_config,
                },
            )
            # Nothing at all to run -- fail now, while the cause is still in hand.
            if len(configs_without_rules) == len(requested_config_ids):
                raise ValueError(message)
            print(f"WARNING: {message}")

        # Initialize the validator
        validator = TcJSONConfigValidator(
            config_json=config_json,
            traditional_config_details_df=traditional_config_details_df,
            traditional_checks_library_df=traditional_checks_library_df,
            log_system_func=log_system,  # Pass the function reference
            log_validation_func=log_validation  # Pass the function reference
        )

        # Run the complete validation pipeline
        json_valid, execution_df = validator.validate()

        # Check results
        if json_valid:
            if not execution_df.empty:
                print(f"Validation successful! {len(execution_df)} checks to execute.")
            else:
                # The JSON validated and every requested config HAS field rules
                # (both already checked above), yet the validator produced no
                # executable rows. So the cause is inside validation -- a field
                # rule that could not be turned into a check -- not missing config.
                # Report what was actually on hand, and the validator's own
                # messages, instead of re-stating a guess that was already ruled out.
                validation_messages = [
                    str(entry.get("message", entry)) if isinstance(entry, dict) else str(entry)
                    for entry in (validation_logs or [])
                ]

                raise ValueError(
                    "Validation produced no executable checks, although the inputs were "
                    "present. "
                    f"check types loaded: {len(traditional_checks_library_df)}; "
                    f"field rules per config: {rules_per_config}. "
                    "Every requested config has field rules, so the rules themselves were "
                    "rejected during validation -- most often a check_mapping_name that "
                    "matches no row in traditional_checks_library_rev, or a rule missing a "
                    "value the check requires (such as expected_length for a length check). "
                    + (
                        f"Validator reported {len(validation_messages)} problem(s): "
                        f"{validation_messages}"
                        if validation_messages
                        else "The validator recorded no messages, which is itself a bug worth reporting."
                    )
                )
        else:
            # "Check logs for details" is useless in a container, where the logs are
            # interleaved with every other worker. Put the validator's own messages in
            # the exception, so the reason travels with the failure.
            validation_messages = [
                str(entry.get("message", entry)) if isinstance(entry, dict) else str(entry)
                for entry in (validation_logs or [])
            ]
            system_messages = [
                str(entry.get("message", entry)) if isinstance(entry, dict) else str(entry)
                for entry in (system_logs or [])
                if not isinstance(entry, dict) or entry.get("severity") in ("ERROR", "CRITICAL")
            ]

            raise ValueError(
                "The job payload failed validation against the configured field rules. "
                f"config_ids: {requested_config_ids}; "
                f"field rules per config: {rules_per_config}; "
                f"check types loaded: {len(traditional_checks_library_df)}. "
                + (
                    f"Validation problems ({len(validation_messages)}): {validation_messages}. "
                    if validation_messages
                    else "The validator recorded no messages. "
                )
                + (f"System errors: {system_messages}" if system_messages else "")
            )

        # Fetch config dataframes. Unconditional: conn was proved non-None above, and
        # an `if conn:` here would leave both frames unbound on the false branch.
        db_based_checks_config_df = fetch_table(
            connection=conn,
            table_name="db_based_checks_config",
            log_system=log_system
        )
        print(f"Fetched {len(db_based_checks_config_df)} records from db_based_checks_config")

        file_based_checks_config_df = fetch_table(
            connection=conn,
            table_name="file_based_checks_config",
            log_system=log_system
        )
        print(f"Fetched {len(file_based_checks_config_df)} records from file_based_checks_config")

        # Split execution_df by config_id prefix
        dbc_mask = execution_df["config_id"].str.startswith("DBC")
        fbc_mask = execution_df["config_id"].str.startswith("FBC")
        unmatched_mask = ~dbc_mask & ~fbc_mask

        dbc_df  = execution_df[dbc_mask].copy()
        fbc_df  = execution_df[fbc_mask].copy()
        rest_df = execution_df[unmatched_mask].copy() # neither DBC nor FBC

        # Merge DBC rows with db_based_checks_config_df
        if not dbc_df.empty:
            dbc_df = dbc_df.merge(
                db_based_checks_config_df,
                on="config_id",
                how="left"
            )

        # Merge FBC rows with file_based_checks_config_df
        if not fbc_df.empty:
            fbc_df = fbc_df.merge(
                file_based_checks_config_df,
                on="config_id",
                how="left"
            )

        # Combine all columns (union) without duplicating shared columns
        # pd.concat aligns on column names automatically, filling missing cols with NaN
        execution_df = pd.concat([dbc_df, fbc_df, rest_df], ignore_index=True)

        # Collect unmatched config_ids
        # A row is "unmatched" if it had a recognised prefix but found no config entry,
        # OR if it had an unrecognised prefix entirely.

        # For DBC rows: a sentinel column from db_based_checks_config_df will be NaN
        dbc_config_cols = [c for c in db_based_checks_config_df.columns if c != "config_id"]
        fbc_config_cols = [c for c in file_based_checks_config_df.columns if c != "config_id"]

        unmatched_config_ids = []

        if dbc_config_cols:
            sentinel_dbc = dbc_config_cols[0]
            if sentinel_dbc in execution_df.columns:
                unmatched_dbc = execution_df.loc[
                    dbc_mask & execution_df[sentinel_dbc].isna(), "config_id"
                ].tolist()
                unmatched_config_ids.extend(unmatched_dbc)

        if fbc_config_cols:
            sentinel_fbc = fbc_config_cols[0]
            if sentinel_fbc in execution_df.columns:
                unmatched_fbc = execution_df.loc[
                    fbc_mask & execution_df[sentinel_fbc].isna(), "config_id"
                ].tolist()
                unmatched_config_ids.extend(unmatched_fbc)

        # Add rows with unrecognised prefixes
        unmatched_config_ids.extend(rest_df["config_id"].tolist())

        # Deduplicate while preserving order
        unmatched_config_ids = list(dict.fromkeys(unmatched_config_ids))

        # An unmatched config_id means its field rules exist but the config row they
        # belong to does not -- the check will run with every config column NaN
        # (no source table, no connection), and fail downstream for a reason that
        # looks nothing like the cause. Name them loudly here.
        if unmatched_config_ids:
            prefix_breakdown = {
                "DBC (no row in db_based_checks_config)": [c for c in unmatched_config_ids if str(c).startswith("DBC")],
                "FBC (no row in file_based_checks_config)": [c for c in unmatched_config_ids if str(c).startswith("FBC")],
                "unrecognised prefix": [
                    c for c in unmatched_config_ids if not str(c).startswith(("DBC", "FBC"))
                ],
            }
            prefix_breakdown = {k: v for k, v in prefix_breakdown.items() if v}

            log_system(
                code="CONFIG_ROW_MISSING",
                severity="ERROR",
                message=(
                    f"{len(unmatched_config_ids)} config_id(s) have field rules but no "
                    f"matching config row: {prefix_breakdown}"
                ),
                context={
                    "step": "generate_execution_df",
                    "unmatched_config_ids": unmatched_config_ids,
                    "breakdown": prefix_breakdown,
                },
            )
            print(f"ERROR: config_ids with field rules but no config row: {prefix_breakdown}")
        else:
            print("Unmatched config_ids: none")

        # ADD mapping_name to mandatory checks - in json validator

        # TEMPORARY FOR DEMO:

        # Define mapping
        check_id_to_mapping = {
            "TC001": "file_availability_check",
            "TC002": "column_name_check",
            "TC003": "column_order_check",
            "TC004": "datatype_check"
        }

        # Update only matching rows
        execution_df["check_mapping_name"] = (
            execution_df["check_id"]
            .map(check_id_to_mapping)
            .combine_first(execution_df["check_mapping_name"])
        )

        def process_fc_connections(execution_df):
            """
            For each unique group of (source_connection_id, source_file_type, source_file_name)
            where source_connection_id starts with 'FC', ingests file data to DB, updates
            execution_df accordingly, and removes any remaining FC rows with a warning.

            Column names match the real file_based_checks_config schema (source_connection_id/
            source_file_type/source_file_name) -- an earlier version of this function used flat
            connection_id/file_type/file_name columns that don't exist on execution_df, so this
            never actually ran on a real FC row without crashing.
            """

            # Fallback prefix, only used when a config's source_file_path is blank
            default_endpoint_url = "Data_Cortex/"

            df = execution_df.copy()

            # Preserve original file_name BEFORE any modification
            df["_original_file_name"] = df["source_file_name"]

            # Identify FC rows
            fc_mask = df["source_connection_id"].str.startswith("FC", na=False)
            fc_df = df[fc_mask]

            log_system(
                code="FC_DEBUG_START",
                severity="INFO",
                message="Starting FC connection processing",
                context={
                    "step": "process_fc_connections",
                    "total_fc_rows": len(fc_df)
                }
            )

            if fc_df.empty:
                log_system(
                    code="FC_DEBUG_NO_ROWS",
                    severity="INFO",
                    message="No FC rows found. Skipping processing.",
                    context={"step": "process_fc_connections"}
                )
                return df

            # Get unique groups including config_id so schema lookup can be performed correctly.
            # source_file_delimiter travels with the group so the parser actually
            # receives it -- the config field existed but never reached the parser,
            # so every file was read as comma-separated whatever the config said.
            group_columns = [
                "source_connection_id", "source_file_type", "source_file_name",
                "config_id", "source_file_path",
            ]
            has_delimiter_column = "source_file_delimiter" in fc_df.columns
            if has_delimiter_column:
                group_columns.append("source_file_delimiter")

            unique_groups = (
                fc_df[group_columns]
                .drop_duplicates()
                .values.tolist()
            )

            log_system(
                code="FC_DEBUG_GROUPS",
                severity="INFO",
                message="Identified unique FC groups",
                context={
                    "step": "process_fc_connections",
                    "unique_group_count": len(unique_groups),
                    "groups": unique_groups
                }
            )

            # Initialize engine
            engine = FileConnectionManager(
                log_system_func=log_system,
                log_validation_func=log_validation
            )

            successfully_processed = {}
            updated_row_indices = set()

            for group in unique_groups:
                if has_delimiter_column:
                    (connection_id, file_type, file_name, config_id,
                     source_file_path, source_file_delimiter) = group
                else:
                    (connection_id, file_type, file_name, config_id,
                     source_file_path) = group
                    source_file_delimiter = None
                try:
                    # Ensure .csv extension
                    if file_name and not str(file_name).endswith(".csv"):
                        file_name_csv = f"{file_name}.csv"
                    else:
                        file_name_csv = file_name

                    # Folder prefix comes from the config's own source_file_path when set
                    # (whether it's a bare folder like "team_folder/" or the full path
                    # including the filename, e.g. "team_folder/vendors.csv" -- either
                    # way we want just the folder portion here). Falls back to the
                    # legacy hardcoded "Data_Cortex/" only when source_file_path is blank.
                    if source_file_path and str(source_file_path).strip():
                        path_str = str(source_file_path).strip()
                        if path_str.endswith("/"):
                            endpoint_url = path_str
                        elif "/" in path_str:
                            endpoint_url = path_str.rsplit("/", 1)[0] + "/"
                        else:
                            endpoint_url = ""
                    else:
                        endpoint_url = default_endpoint_url

                    final_file_name = f"{endpoint_url}{file_name_csv}"

                    log_system(
                        code="FC_DEBUG_BEFORE_INGEST",
                        severity="INFO",
                        message="Calling ingest_file_data_to_db",
                        context={
                            "step": "process_fc_connections",
                            "source_connection_id": connection_id,
                            "source_file_type": file_type,
                            "source_file_name": file_name,
                            "config_id": config_id,
                            "final_file_name": final_file_name,
                            "source_file_delimiter": source_file_delimiter
                        }
                    )

                    delimiter = (
                        str(source_file_delimiter)
                        if source_file_delimiter is not None and pd.notna(source_file_delimiter)
                        and str(source_file_delimiter).strip() != ""
                        else None
                    )

                    updated_connection_id = engine.ingest_file_data_to_db(
                        connection_id, final_file_name, config_id, csv_delimiter=delimiter
                    )

                    group_mask = (
                        (df["source_connection_id"] == connection_id) &
                        (df["source_file_type"] == file_type) &
                        (df["source_file_name"] == file_name)
                    )

                    matched_indices = df[group_mask].index.tolist()

                    log_system(
                        code="FC_DEBUG_AFTER_INGEST",
                        severity="INFO",
                        message="Ingest result received",
                        context={
                            "step": "process_fc_connections",
                            "connection_id": connection_id,
                            "file_name": file_name,
                            "updated_connection_id": updated_connection_id,
                            "rows_matched": len(matched_indices),
                            "matched_indices": matched_indices
                        }
                    )

                    if updated_connection_id and updated_connection_id != connection_id:
                        successfully_processed[(connection_id, file_type, file_name)] = updated_connection_id
                        updated_row_indices.update(matched_indices)

                        log_system(
                            code="FC_INGEST_SUCCESS",
                            severity="INFO",
                            message="File ingestion successful",
                            context={
                                "step": "process_fc_connections",
                                "source_connection_id": connection_id,
                                "source_file_name": file_name,
                                "updated_connection_id": updated_connection_id,
                                "rows_affected": len(matched_indices)
                            }
                        )

                    else:
                        log_system(
                            code="FC_INGEST_NO_UPDATE",
                            severity="WARNING",
                            message="No updated connection_id returned",
                            context={
                                "step": "process_fc_connections",
                                "source_connection_id": connection_id,
                                "source_file_name": file_name,
                                "updated_connection_id": updated_connection_id,
                                "rows_matched": len(matched_indices)
                            }
                        )

                except Exception as e:
                    log_system(
                        code="FC_INGEST_ERROR",
                        severity="ERROR",
                        message="Exception during file ingestion",
                        context={
                            "step": "process_fc_connections",
                            "source_connection_id": connection_id,
                            "source_file_name": file_name,
                            "error": str(e)
                        }
                    )

            # Apply updates
            for (connection_id, file_type, file_name), updated_connection_id in successfully_processed.items():
                group_mask = (
                    (df["source_connection_id"] == connection_id) &
                    (df["source_file_type"] == file_type) &
                    (df["source_file_name"] == file_name)
                )

                df.loc[group_mask, "source_connection_id"] = updated_connection_id
                df.loc[group_mask, "source_file_type"] = None
                df.loc[group_mask, "source_file_name"] = None

            log_system(
                code="FC_DEBUG_POST_UPDATE",
                severity="INFO",
                message="Applied connection updates",
                context={
                    "step": "process_fc_connections",
                    "updated_groups_count": len(successfully_processed)
                }
            )

            # Remove remaining FC rows
            remaining_fc_mask = df["source_connection_id"].str.startswith("FC", na=False)
            remaining_fc_df = df[remaining_fc_mask]

            if not remaining_fc_df.empty:
                log_system(
                    code="FC_ROWS_REMOVED",
                    severity="ERROR",
                    message="Removing unresolved FC rows",
                    context={
                        "step": "process_fc_connections",
                        "rows_removed": len(remaining_fc_df),
                        "remaining_connection_ids": remaining_fc_df["source_connection_id"].unique().tolist()
                    }
                )
                df = df[~remaining_fc_mask]

            # Final transformation -- write to source_table_name, matching the
            # column checks_executor.py actually reads (first_row.get("source_table_name"));
            # this used to write to a "table_name" column nothing downstream consumed.
            #
            # Table name must be reconstructed with the exact same sanitization
            # FileConnectionManager.ingest_file_data_to_db() applies when it creates the
            # table -- using the raw original filename here would silently produce a
            # table name that doesn't exist. Both call the same shared helper so they
            # can't drift out of sync.
            if updated_row_indices:
                idx = list(updated_row_indices)

                df.loc[idx, "source_table_name"] = (
                    df.loc[idx, "source_connection_id"] + "_"
                    + df.loc[idx, "_original_file_name"].map(sanitize_file_name_for_table)
                )

                # Track every ingested table so the caller can destroy it once
                # this job's checks are done reading it (decisions_needed.csv #10).
                #
                # The `<table>_schema` sidecar is created by the same ingest and
                # is registered here too -- it was never tracked, so it leaked
                # into the product DB on every single file-based job and
                # accumulated there indefinitely.
                for conn_id, table_name in zip(df.loc[idx, "source_connection_id"], df.loc[idx, "source_table_name"]):
                    for pair in ((conn_id, table_name), (conn_id, f"{table_name}_schema")):
                        if pair not in self.ingested_tables:
                            self.ingested_tables.append(pair)

                log_system(
                    code="FC_DEBUG_FINAL_MAPPING",
                    severity="INFO",
                    message="Applied source_table_name transformation",
                    context={
                        "step": "process_fc_connections",
                        "rows_updated": len(idx)
                    }
                )

            # Cleanup
            df.drop(columns=["_original_file_name"], inplace=True)
            df.drop(columns=["source_file_name", "source_file_type"], inplace=True, errors="ignore")

            log_system(
                code="FC_DEBUG_END",
                severity="INFO",
                message="Completed FC connection processing",
                context={"step": "process_fc_connections"}
            )

            return df

        # checks_execution_df = process_fc_connections(execution_df)

        # Check if any FC connection rows exist before processing.
        # db_based_checks_config / file_based_checks_config use source_connection_id
        # (not a plain "connection_id"); FC (file connector) rows appear there.
        fc_rows_exist = (
            "source_connection_id" in execution_df.columns
            and execution_df["source_connection_id"].str.startswith("FC", na=False).any()
        )
 
        if fc_rows_exist:
            checks_execution_df = process_fc_connections(execution_df)
        else:
            checks_execution_df = execution_df.copy()
            checks_execution_df.drop(columns=["source_file_name", "source_file_type"], inplace=True, errors="ignore")
            
        # print(checks_execution_df)
        # checks_execution_df.to_csv("EXECUTION_DF_EXAMPLE_UPDATED.csv")

        close_flag = close_connection(
            connection=conn,
            log_system=log_system
        )
        print(f"Connection closed: {close_flag}")

        # database_type is NOT set here. It used to be hardcoded to
        # "postgresql" on every row, which silently misrouted any non-Postgres
        # source through the Postgres dispatch path. It is now derived per row
        # from each row's own connection metadata, in dc_engine.py, which is
        # where metadata_map exists.

        # print(checks_execution_df)
        checks_execution_df.to_csv("EXECUTION_DF_EXAMPLE_UPDATED.csv")

        return checks_execution_df