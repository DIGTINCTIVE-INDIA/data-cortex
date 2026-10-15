import os
from psycopg2 import sql as pg_sql
from trad_ct_id.value_converter import quote_identifier

# Decides the data type of each column
def get_column_datatype(col, target_database_type):

    if col == "_job_id":
        return "VARCHAR"

    elif col == "_job_timestamp":
        if target_database_type == "postgresql":
            return "TIMESTAMPTZ"
        else:
            return "TIMESTAMP_TZ"

    elif col.startswith("_"):

        if target_database_type == "postgresql":
            return "JSONB"
        else:
            return "VARIANT"

    else:
        return "TEXT"


def build_column_type_map(columns, target_database_type, source_column_types=None):

    column_types = {}
    # For each columns create a data type mapping
    for col in columns:
        if col.startswith("_"):
            column_types[col] = get_column_datatype(col, target_database_type)
            
        elif source_column_types and col in source_column_types:
            column_types[col] = source_column_types[col]
            
        else:
            column_types[col] = "TEXT"
            
    return column_types

# Load csv file into postgres
def load_csv_postgresql(
    target_cur,
    local_file_path,
    target_schema,
    table_name,
    columns,
    column_types,
    drop_first=False
):
    schema_q = quote_identifier(target_schema, "postgresql")
    table_q  = quote_identifier(table_name, "postgresql")
    cols_q   = ", ".join(quote_identifier(c, "postgresql") for c in columns)

    column_defs = ", ".join(
        f"{quote_identifier(c, 'postgresql')} {column_types.get(c, 'TEXT')}"
        for c in columns
    )

    # For error table
    if drop_first:
        target_cur.execute(f"DROP TABLE IF EXISTS {schema_q}.{table_q}")
        target_cur.execute(f"CREATE TABLE {schema_q}.{table_q} ({column_defs})")
    # for err history table
    else:
        target_cur.execute(
            f"CREATE TABLE IF NOT EXISTS {schema_q}.{table_q} ({column_defs})"
        )

        target_cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            """,
            (target_schema, table_name)
        )
        existing_cols = {row["column_name"].lower() for row in target_cur.fetchall()}
        
        for col in columns:
            if col.lower() not in existing_cols:
                col_q = quote_identifier(col, "postgresql")
                data_type = column_types.get(col, "TEXT")
                target_cur.execute(
                    f"ALTER TABLE {schema_q}.{table_q} ADD COLUMN {col_q} {data_type}"
                )

    with open(local_file_path, "r", encoding="utf-8") as f:
        target_cur.copy_expert(
            f"COPY {schema_q}.{table_q} ({cols_q}) "
            f"FROM STDIN WITH (FORMAT CSV, HEADER TRUE)",
            f
        )


def load_csv_snowflake(
    target_cur,
    local_file_path,
    target_schema,
    table_name,
    columns,
    column_types,
    drop_first=False,
    stage_name="data_quality_stage"
):
    schema_q = quote_identifier(target_schema, "snowflake")
    table_q  = quote_identifier(table_name, "snowflake")

    column_defs = ", ".join(
        f"{quote_identifier(c, 'snowflake')} {column_types.get(c, 'TEXT')}"
        for c in columns
    )

    if drop_first:
     
        target_cur.execute(f"DROP TABLE IF EXISTS {schema_q}.{table_q}")
        target_cur.execute(f"CREATE TABLE {schema_q}.{table_q} ({column_defs})")
    else:
       
        target_cur.execute(
            f"CREATE TABLE IF NOT EXISTS {schema_q}.{table_q} ({column_defs})"
        )

    # PUT file to stage then COPY INTO
    target_cur.execute(f"CREATE STAGE IF NOT EXISTS {stage_name}")
    local_path_uri = local_file_path.replace("\\", "/")
    target_cur.execute(
        f"PUT 'file://{local_path_uri}' @{stage_name} OVERWRITE = TRUE"
    )

    file_name = os.path.basename(local_file_path)
    target_cur.execute(
        f"COPY INTO {schema_q}.{table_q} "
        f"FROM @{stage_name}/{file_name} "
        f"FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1 "
        f"FIELD_OPTIONALLY_ENCLOSED_BY = '\"') "
        f"ON_ERROR = 'ABORT_STATEMENT'"
    )

    target_cur.execute(f"REMOVE @{stage_name}/{file_name}")


def bulk_insert_invalid_rows_from_csv(
    target_cur,
    local_file_path,
    columns,
    target_table_prefix,
    target_schema,
    target_connection_details,
    source_column_types=None
):

    target_db_type = target_connection_details["database_type"].lower()

    hist_table = f"{target_table_prefix}_err_hist"
    err_table  = f"{target_table_prefix}_err"


    column_types = build_column_type_map(
        columns, target_db_type, source_column_types
    )

    if target_db_type == "postgresql" or target_db_type == "postgres":
        
        load_csv_postgresql(
            target_cur, local_file_path, target_schema,
            hist_table, columns, column_types,
            drop_first=False    # NEVER drop history
        )
  
        load_csv_postgresql(
            target_cur, local_file_path, target_schema,
            err_table, columns, column_types,
            drop_first=True     # Drop and recreate
        )

    elif target_db_type == "snowflake":

        load_csv_snowflake(
            target_cur, local_file_path, target_schema,
            hist_table, columns, column_types,
            drop_first=False
        )

        load_csv_snowflake(
            target_cur, local_file_path, target_schema,
            err_table, columns, column_types,
            drop_first=True
        )

    else:
        raise ValueError(f"Unsupported target database type: {target_db_type}")