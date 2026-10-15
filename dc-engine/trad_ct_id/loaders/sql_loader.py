from trad_ct_id.value_converter import quote_identifier
from trad_ct_id.source_reader import get_source_columns


def build_qualified_name(database_name, schema, table_name, database_type):
    return (
        f"{quote_identifier(database_name, database_type)}."
        f"{quote_identifier(schema, database_type)}."
        f"{quote_identifier(table_name, database_type)}"
    )


def build_select_column_list(all_columns, row_identifier_column, database_type):

    skip_cols = (
        {c.lower() for c in row_identifier_column}
        if isinstance(row_identifier_column, list)
        else {row_identifier_column.lower()}
    )

    filtered = [c for c in all_columns if c.lower() not in skip_cols]

    return ", ".join(quote_identifier(c, database_type) for c in filtered)


def create_landing_table_via_sql(
    cur,
    source_database_name,
    source_schema,
    source_table,
    target_database_name,
    target_schema,
    target_table_prefix,
    database_type
):
    # Landing table = exact full copy of source, every column included
    target_table_name = f"{target_table_prefix}_landing"

    target_q = build_qualified_name(target_database_name, target_schema, target_table_name, database_type)
    source_q = build_qualified_name(source_database_name, source_schema, source_table, database_type)

    cur.execute(f"DROP TABLE IF EXISTS {target_q}")
    cur.execute(f"CREATE TABLE {target_q} AS SELECT * FROM {source_q}")


def create_valid_table_via_sql(
    cur,
    source_database_name,
    source_schema,
    source_table,
    target_database_name,
    target_schema,
    target_table_prefix,
    database_type,
    job_id,
    job_timestamp,
    row_identifier_column,
    failed_row_identifiers
):
  
    target_table_name = f"{target_table_prefix}_valid"

    target_q = build_qualified_name(target_database_name, target_schema, target_table_name, database_type)
    source_q = build_qualified_name(source_database_name, source_schema, source_table, database_type)

    cur.execute(f"DROP TABLE IF EXISTS {target_q}")

    job_id_col = "_JOB_ID" if database_type == "snowflake" else "_job_id"
    job_ts_col = "_JOB_TIMESTAMP" if database_type == "snowflake" else "_job_timestamp"

    job_timestamp_str = (
        job_timestamp.isoformat() if hasattr(job_timestamp, "isoformat") else job_timestamp
    )

    # No failures at all - every row is valid, no WHERE filter needed
    if not failed_row_identifiers:
        query = (
            f"CREATE TABLE {target_q} AS "
            f"SELECT %(job_id)s AS \"{job_id_col}\", "
            f"%(job_timestamp)s AS \"{job_ts_col}\", * "
            f"FROM {source_q}"
        )
        cur.execute(query, {"job_id": job_id, "job_timestamp": job_timestamp_str})

    elif database_type == "postgresql":
        ri_col = quote_identifier(row_identifier_column, database_type)
        query = (
            f"CREATE TABLE {target_q} AS "
            f"SELECT %(job_id)s AS \"{job_id_col}\", "
            f"%(job_timestamp)s AS \"{job_ts_col}\", * "
            f"FROM {source_q} "
            f"WHERE {ri_col}::text != ALL(%(failed_ids)s)"
        )
        cur.execute(
            query,
            {
                "job_id": job_id,
                "job_timestamp": job_timestamp_str,
                "failed_ids": list(failed_row_identifiers)
            }
        )

    elif database_type == "snowflake":
        if isinstance(row_identifier_column, list):
            ri_col = quote_identifier(row_identifier_column[0], database_type)
        else:
            ri_col = quote_identifier(row_identifier_column, database_type)

        placeholders = ", ".join("%s" for _ in failed_row_identifiers)

        query = (
            f"CREATE TABLE {target_q} AS "
            f"SELECT %s AS \"{job_id_col}\", "
            f"%s AS \"{job_ts_col}\", * "
            f"FROM {source_q} "
            f"WHERE {ri_col}::TEXT NOT IN ({placeholders})"
        )

        params = [job_id, job_timestamp_str] + list(failed_row_identifiers)
        cur.execute(query, params)

    columns_to_drop = (
        row_identifier_column if isinstance(row_identifier_column, list)
        else [row_identifier_column]
    )

    for col in columns_to_drop:

        if database_type == "postgresql" and col == "ctid":
            continue

        col_q = quote_identifier(col, database_type)
        cur.execute(f"ALTER TABLE {target_q} DROP COLUMN IF EXISTS {col_q}")