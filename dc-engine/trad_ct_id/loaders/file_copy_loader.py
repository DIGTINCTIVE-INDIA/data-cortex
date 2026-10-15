# For cross engine and cross server 

"""
Copies the data from source, writes it to a csv file and bulk loads into the target db  
"""

import csv
import os
import tempfile
import uuid

from trad_ct_id.source_reader import stream_source_rows, get_source_column_types
from trad_ct_id.value_converter import (
    quote_identifier,
    normalize_rows,
    serialize_value_for_file,
    map_to_target_type
)


def export_rows_to_csv(
    source_cur,
    fetch_query,
    fetch_params,
    target_database_type,
    local_file_path,
    extra_columns=None,
    skip_columns=None,
    chunk_size=5000
):
    # Streams source rows in chunks, cleans each value and writes them into a CSV file on local disk
    columns_written = None
    skip_columns = {c.lower() for c in skip_columns} if skip_columns else set()

    with open(local_file_path, "w", newline="", encoding="utf-8") as f:
        writer = None

        # Fetch the riws as per chunk size from 
        for chunk in stream_source_rows(source_cur, fetch_query, fetch_params, chunk_size):

            rows = normalize_rows(chunk)

            for row in rows:

                if skip_columns:
                    row = {k: v for k, v in row.items() if k not in skip_columns}

                if extra_columns:
                    row = {**extra_columns, **row}

                if writer is None:
                    columns_written = list(row.keys())
                    writer = csv.DictWriter(f, fieldnames=columns_written)
                    writer.writeheader()

                clean_row = {
                    col: serialize_value_for_file(row.get(col), col, target_database_type)
                    for col in columns_written
                }

                writer.writerow(clean_row)

    return columns_written


def load_csv_postgresql(target_cur, local_file_path, target_schema, target_table_name, columns, column_types=None):
    # Bulk loads a CSV file into a fresh PostgreSQL table via COPY
    schema_q = quote_identifier(target_schema, "postgresql")
    table_q = quote_identifier(target_table_name, "postgresql")
    cols_q = ", ".join(quote_identifier(c, "postgresql") for c in columns)

    target_cur.execute(f"DROP TABLE IF EXISTS {schema_q}.{table_q}")

    column_defs = ", ".join(
        f"{quote_identifier(c, 'postgresql')} "
        f"{column_types.get(c, 'TEXT') if column_types else 'TEXT'}"
        for c in columns
    )
    target_cur.execute(f"CREATE TABLE {schema_q}.{table_q} ({column_defs})")

    with open(local_file_path, "r", encoding="utf-8") as f:
        copy_sql = (
            f"COPY {schema_q}.{table_q} ({cols_q}) "
            f"FROM STDIN WITH (FORMAT CSV, HEADER TRUE)"
        )
        target_cur.copy_expert(copy_sql, f)


def load_csv_snowflake(target_cur, local_file_path, target_schema, target_table_name, columns, column_types=None, stage_name="data_quality_stage"):
    # Bulk loads a CSV file into a fresh Snowflake table via
    # PUT (upload) + COPY INTO (bulk load)
    schema_q = quote_identifier(target_schema, "snowflake")
    table_q = quote_identifier(target_table_name, "snowflake")

    target_cur.execute(f"DROP TABLE IF EXISTS {schema_q}.{table_q}")

    column_defs = ", ".join(
        f"{quote_identifier(c, 'snowflake')} "
        f"{column_types.get(c, 'TEXT') if column_types else 'TEXT'}"
        for c in columns
    )
    target_cur.execute(f"CREATE TABLE {schema_q}.{table_q} ({column_defs})")

    target_cur.execute(f"CREATE STAGE IF NOT EXISTS {stage_name}")

    local_path_uri = local_file_path.replace("\\", "/")
    target_cur.execute(f"PUT 'file://{local_path_uri}' @{stage_name} OVERWRITE = TRUE")

    file_name = os.path.basename(local_file_path)
    target_cur.execute(
        f"COPY INTO {schema_q}.{table_q} "
        f"FROM @{stage_name}/{file_name} "
        f"FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '\"') "
        f"ON_ERROR = 'ABORT_STATEMENT'"
    )

    target_cur.execute(f"REMOVE @{stage_name}/{file_name}")


def load_csv_to_target(target_cur, local_file_path, target_schema, target_table_name, columns, target_database_type, column_types=None):
    # Picks the right loader based on the TARGET database type
    target_database_type = target_database_type.lower()
    if target_database_type == "postgresql" or target_database_type == "postgres":
        load_csv_postgresql(target_cur, local_file_path, target_schema, target_table_name, columns, column_types)
    elif target_database_type == "snowflake":
        load_csv_snowflake(target_cur, local_file_path, target_schema, target_table_name, columns, column_types)
    else:
        raise ValueError(f"Unsupported target database type: {target_database_type}")


def build_column_types(source_cur, source_schema, source_table, source_database_type, target_database_type):

    source_types = get_source_column_types(source_cur, source_schema, source_table, source_database_type)
    return {
        col: map_to_target_type(data_type, target_database_type)
        for col, data_type in source_types.items()
    }


def create_landing_table_via_file(
    source_cur,
    target_cur,
    source_schema,
    source_table,
    target_schema,
    target_table_prefix,
    source_database_type,
    target_database_type,
    row_identifier_column=None,
    landing_table_name=None
):

    # The config may name the landing table explicitly; otherwise it's derived
    # from the target prefix, as it always was.
    target_table_name = landing_table_name or f"{target_table_prefix}_landing"

    column_types = build_column_types(
        source_cur, source_schema, source_table, source_database_type, target_database_type
    )

    fetch_query = (
        f"SELECT * FROM "
        f"{quote_identifier(source_schema, source_database_type)}."
        f"{quote_identifier(source_table, source_database_type)}"
    )

    skip_columns = None
    if isinstance(row_identifier_column, str) and row_identifier_column == "dc_id":
        skip_columns = {"dc_id"}

    temp_file_path = os.path.join(
        tempfile.gettempdir(), f"{target_table_name}_{uuid.uuid4().hex}.csv"
    )

    try:
        columns = export_rows_to_csv(
            source_cur=source_cur,
            fetch_query=fetch_query,
            fetch_params=None,
            target_database_type=target_database_type,
            local_file_path=temp_file_path,
            skip_columns=skip_columns
        )

        if not columns:
            return

        load_csv_to_target(
            target_cur, temp_file_path, target_schema, target_table_name,
            columns, target_database_type, column_types=column_types
        )

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


def create_valid_table_via_file(
    source_cur,
    target_cur,
    source_schema,
    source_table,
    target_schema,
    target_table_prefix,
    source_database_type,
    target_database_type,
    job_id,
    job_timestamp,
    row_identifier_column,
    failed_row_identifiers
):

    target_table_name = f"{target_table_prefix}_valid"
    column_types = build_column_types(
        source_cur, source_schema, source_table, source_database_type, target_database_type
    )

    job_timestamp_str = (
        job_timestamp.isoformat() if hasattr(job_timestamp, "isoformat") else job_timestamp
    )

    if not failed_row_identifiers:
        fetch_query = (
            f"SELECT * FROM "
            f"{quote_identifier(source_schema, source_database_type)}."
            f"{quote_identifier(source_table, source_database_type)}"
        )
        fetch_params = None

    elif source_database_type == "postgresql":
        fetch_query = (
            f"SELECT * FROM "
            f"{quote_identifier(source_schema, source_database_type)}."
            f"{quote_identifier(source_table, source_database_type)} "
            f"WHERE ctid::text != ALL(%s)"
        )
        fetch_params = [list(failed_row_identifiers)]

    elif source_database_type == "snowflake":
        ri_col = quote_identifier(
            row_identifier_column[0] if isinstance(row_identifier_column, list) else row_identifier_column,
            source_database_type
        )
        placeholders = ", ".join("%s" for _ in failed_row_identifiers)
        fetch_query = (
            f"SELECT * FROM "
            f"{quote_identifier(source_schema, source_database_type)}."
            f"{quote_identifier(source_table, source_database_type)} "
            f"WHERE {ri_col}::TEXT NOT IN ({placeholders})"
        )
        fetch_params = list(failed_row_identifiers)

    # FIXED - only drop "dc_id" if it's genuinely the artificial
    # snapshot column. Never drop ctid or a real PK column.
    skip_columns = None
    if isinstance(row_identifier_column, str) and row_identifier_column == "dc_id":
        skip_columns = {"dc_id"}

    temp_file_path = os.path.join(
        tempfile.gettempdir(), f"{target_table_name}_{uuid.uuid4().hex}.csv"
    )

    try:
        columns = export_rows_to_csv(
            source_cur=source_cur,
            fetch_query=fetch_query,
            fetch_params=fetch_params,
            target_database_type=target_database_type,
            local_file_path=temp_file_path,
            extra_columns={"_job_id": job_id, "_job_timestamp": job_timestamp_str},
            skip_columns=skip_columns
        )

        if not columns:
            return

        load_csv_to_target(
            target_cur, temp_file_path, target_schema, target_table_name,
            columns, target_database_type, column_types=column_types
        )

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)