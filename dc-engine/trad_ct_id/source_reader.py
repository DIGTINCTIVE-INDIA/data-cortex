

def stream_source_rows(cur, query, params=None, chunk_size=5000):
   
    if params is not None:
        cur.execute(query, params)
    else:
        cur.execute(query)

    while True:
        chunk = cur.fetchmany(chunk_size)
        if not chunk:
            break
        yield chunk


def get_source_columns(cur, schema, table, database_type):
    # Returns just the column names of a table, in order
    if database_type == "snowflake":
        schema_lookup = schema.upper()
        table_lookup  = table.upper()
    else:
        schema_lookup = schema
        table_lookup  = table

    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema_lookup, table_lookup)
    )

    rows = cur.fetchall()

    # Snowflake returns UPPERCASE keys, PostgreSQL returns lowercase
    if database_type == "snowflake":
        return [row["COLUMN_NAME"] for row in rows]
    else:
        return [row["column_name"] for row in rows]


def get_source_column_types(cur, schema, table, database_type):
 
    if database_type == "snowflake":
        schema_lookup = schema.upper()
        table_lookup  = table.upper()
    else:
        schema_lookup = schema
        table_lookup  = table

    cur.execute(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema_lookup, table_lookup)
    )

    rows = cur.fetchall()

    # Snowflake returns UPPERCASE keys, PostgreSQL returns lowercase
    if database_type == "snowflake":
        return {row["COLUMN_NAME"].lower(): row["DATA_TYPE"] for row in rows}
    else:
        return {row["column_name"].lower(): row["data_type"] for row in rows}