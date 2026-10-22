# Returns a dictionary cursor for the given database connection.

from psycopg2.extras import RealDictCursor


def get_cursor(connection, database_type):

    database_type = database_type.lower()

    # "rds" is a connection's stored database_type when it was created generically
    # for RDS (e.g. by file-ingestion's _get_or_create_db_connection) -- the actual
    # engine (postgresql/mysql) lives in that connection's additional_params.engine,
    # not here, and every RDS connection in this codebase defaults to postgresql
    # there, so treat "rds" as a postgresql alias same as "postgres".
    if database_type in ("postgresql", "postgres", "rds"):
        return connection.cursor(cursor_factory=RealDictCursor)

    elif database_type == "snowflake":
        # Imported here, not at module level: see _snowflake_connector() in
        # Data_Code/connectors/db/connectors.py (the driver must not load before Celery forks).
        from snowflake.connector import DictCursor
        return connection.cursor(DictCursor)

    else:
        raise ValueError(
            f"Unsupported database type: {database_type}"
        )