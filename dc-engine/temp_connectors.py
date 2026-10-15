import pandas as pd
from typing import Optional
import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

# DEFINE TEMPORARY CONNECTION FUNCTIONS

def get_connection(
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
    schema: Optional[str] = "public",
    log_system=None
) -> Optional[psycopg2.extensions.connection]:
    """
    Creates and returns a PostgreSQL connection object.
    
    Args:
        host: Database host address
        port: Database port number
        database: Database name
        user: Database user
        password: Database password
        schema: Optional schema name to set as search_path
        log_system: Optional logging function
    
    Returns:
        PostgreSQL connection object or None if connection fails
    """

    try:
        # Validate required parameters
        if not all([host, port, database, user, password, schema]):
            error_msg = "One or more required connection parameters are missing"
            if log_system:
                log_system(
                    code="CONNECTION_VALIDATION_FAILED",
                    severity="ERROR",
                    message=error_msg,
                    context={
                        "step": "get_connection",
                        "host": host if host else "missing",
                        "port": port if port else "missing",
                        "database": database if database else "missing",
                        "user": user if user else "missing",
                        "success": False
                    }
                )
            raise ValueError(error_msg)
        
        # Attempt connection
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password
        )
        
        # Set schema if provided
        if schema:
            with conn.cursor() as cur:
                cur.execute(f"SET search_path TO {schema}")
                conn.commit()
        
        if log_system:
            log_system(
                code="CONNECTION_ESTABLISHED",
                severity="INFO",
                message="Database connection established successfully",
                context={
                    "step": "get_connection",
                    "host": host,
                    "port": port,
                    "database": database,
                    "user": user,
                    "schema": schema,
                    "success": True
                }
            )
        
        return conn
        
    except ValueError as ve:
        print(f"[VALIDATION ERROR] {ve}")
        return None
        
    except psycopg2.OperationalError as oe:
        error_msg = f"Could not connect to database: {oe}"
        if log_system:
            log_system(
                code="CONNECTION_FAILED",
                severity="ERROR",
                message=error_msg,
                context={
                    "step": "get_connection",
                    "host": host,
                    "port": port,
                    "database": database,
                    "error_type": "OperationalError",
                    "success": False
                }
            )
        print(f"[CONNECTION ERROR] {error_msg}")
        return None
        
    except Exception as e:
        error_msg = f"Unexpected error during connection: {e}"
        if log_system:
            log_system(
                code="CONNECTION_UNEXPECTED_ERROR",
                severity="ERROR",
                message=error_msg,
                context={
                    "step": "get_connection",
                    "error_type": type(e).__name__,
                    "success": False
                }
            )
        print(f"[CONNECTION ERROR] {error_msg}")
        return None

def fetch_table(
    connection: psycopg2.extensions.connection,
    table_name: str,
    log_system=None,
    config_ids=None
) -> pd.DataFrame:
    """
    Fetches a table from PostgreSQL into a Pandas DataFrame.

    Args:
        connection: Active PostgreSQL connection object
        table_name: Name of the table to fetch
        log_system: Optional logging function
        config_ids: Optional list of config_ids to restrict the fetch to.
            Filters server-side with ``WHERE config_id = ANY(...)`` instead of
            pulling the whole table across and filtering in pandas -- fine at
            a handful of configs, not fine at hundreds.

    Returns:
        DataFrame containing table data, or empty DataFrame on error
    """
    try:
        # Validate inputs
        if connection is None:
            error_msg = "Connection object is None"
            if log_system:
                log_system(
                    code="FETCH_TABLE_INVALID_CONNECTION",
                    severity="ERROR",
                    message=error_msg,
                    context={
                        "step": "fetch_table",
                        "table_name": table_name,
                        "success": False
                    }
                )
            raise ValueError(error_msg)
        
        if not table_name:
            error_msg = "Table name is empty or None"
            if log_system:
                log_system(
                    code="FETCH_TABLE_INVALID_NAME",
                    severity="ERROR",
                    message=error_msg,
                    context={
                        "step": "fetch_table",
                        "success": False
                    }
                )
            raise ValueError(error_msg)
        
        # Check if connection is still alive
        if connection.closed:
            error_msg = "Connection is closed"
            if log_system:
                log_system(
                    code="FETCH_TABLE_CONNECTION_CLOSED",
                    severity="ERROR",
                    message=error_msg,
                    context={
                        "step": "fetch_table",
                        "table_name": table_name,
                        "success": False
                    }
                )
            raise psycopg2.InterfaceError(error_msg)
        
        # Execute query.
        # pd.read_sql wants a SQLAlchemy connectable; handing it a raw psycopg2
        # connection works but prints a UserWarning on every single job. Wrap
        # the live connection in an engine rather than opening a second one.
        if config_ids:
            query = f'SELECT * FROM "{table_name}" WHERE config_id = ANY(%(config_ids)s)'
            params = {"config_ids": list(config_ids)}
        else:
            query = f'SELECT * FROM "{table_name}"'
            params = None

        engine = create_engine(
            "postgresql+psycopg2://", creator=lambda: connection, poolclass=StaticPool
        )
        df = pd.read_sql(query, engine, params=params)

        if log_system:
            log_system(
                code="FETCH_TABLE_COMPLETE",
                severity="INFO",
                message=f"Table '{table_name}' fetched successfully",
                context={
                    "step": "fetch_table",
                    "table_name": table_name,
                    "total_records": len(df),
                    "total_columns": len(df.columns),
                    "columns": list(df.columns),
                    "success": True
                }
            )
        
        return df
        
    except ValueError as ve:
        print(f"[VALIDATION ERROR] {ve}")
        return pd.DataFrame()
        
    except psycopg2.Error as pe:
        error_msg = f"PostgreSQL error while fetching table '{table_name}': {pe}"
        if log_system:
            log_system(
                code="FETCH_TABLE_QUERY_ERROR",
                severity="ERROR",
                message=error_msg,
                context={
                    "step": "fetch_table",
                    "table_name": table_name,
                    "error_type": type(pe).__name__,
                    "success": False
                }
            )
        print(f"[QUERY ERROR] {error_msg}")
        return pd.DataFrame()
        
    except Exception as e:
        error_msg = f"Unexpected error while fetching table '{table_name}': {e}"
        if log_system:
            log_system(
                code="FETCH_TABLE_UNEXPECTED_ERROR",
                severity="ERROR",
                message=error_msg,
                context={
                    "step": "fetch_table",
                    "table_name": table_name,
                    "error_type": type(e).__name__,
                    "success": False
                }
            )
        print(f"[QUERY ERROR] {error_msg}")
        return pd.DataFrame()

def close_connection(
    connection: Optional[psycopg2.extensions.connection],
    log_system=None
) -> bool:
    """
    Closes a PostgreSQL connection.
    
    Args:
        connection: PostgreSQL connection object to close
        log_system: Optional logging function
    
    Returns:
        True if connection closed successfully, False otherwise
    """
    try:
        # Check if connection is None
        if connection is None:
            warning_msg = "Connection object is None, nothing to close"
            if log_system:
                log_system(
                    code="CLOSE_CONNECTION_NONE",
                    severity="WARNING",
                    message=warning_msg,
                    context={
                        "step": "close_connection",
                        "success": False
                    }
                )
            print(f"[CLOSE WARNING] {warning_msg}")
            return False
        
        # Check if already closed
        if connection.closed:
            info_msg = "Connection already closed"
            if log_system:
                log_system(
                    code="CLOSE_CONNECTION_ALREADY_CLOSED",
                    severity="INFO",
                    message=info_msg,
                    context={
                        "step": "close_connection",
                        "success": True
                    }
                )
            print(f"[CLOSE INFO] {info_msg}")
            return True
        
        # Close the connection
        connection.close()
        
        if log_system:
            log_system(
                code="CLOSE_CONNECTION_COMPLETE",
                severity="INFO",
                message="Database connection closed successfully",
                context={
                    "step": "close_connection",
                    "success": True
                }
            )
        
        return True
        
    except Exception as e:
        error_msg = f"Error while closing connection: {e}"
        if log_system:
            log_system(
                code="CLOSE_CONNECTION_ERROR",
                severity="ERROR",
                message=error_msg,
                context={
                    "step": "close_connection",
                    "error_type": type(e).__name__,
                    "success": False
                }
            )
        print(f"[CLOSE ERROR] {error_msg}")
        return False