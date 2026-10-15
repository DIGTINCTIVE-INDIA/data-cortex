"""
Modular database connector classes for different database types.
"""
from abc import ABC, abstractmethod
import inspect
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple

import psycopg2
import pymysql
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from Data_Code.common.database import _safe_pg_identifier
from Data_Code.common.encryption import decrypt_secret
from Data_Code.common.exceptions import DataCodeConnectionError, DataCodeValidationError

try:
    import snowflake.connector
except ImportError:
    snowflake = None

from Data_Code.common.logger import logger


class SnowflakePrivateKeyError(Exception):
    """Snowflake private key file is missing, unreadable, or not a valid unencrypted PEM key."""


class SnowflakeConfigError(Exception):
    """Snowflake connection settings are incomplete or inconsistent (non-credential details only in messages)."""


@dataclass(frozen=True)
class SnowflakeAuthConfig:
    """Resolved Snowflake settings after merging config with environment."""

    auth_method: Literal["key_pair", "password"]
    user: str
    account: str
    warehouse: Optional[str]
    database: Optional[str]
    schema: Optional[str]
    role: Optional[str]
    private_key: Optional[str]
    password: Optional[str]


def _snowflake_strip_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _snowflake_blank_to_none(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def load_config(config: Dict[str, Any]) -> SnowflakeAuthConfig:
    """
    Snowflake auth is one of two real, selectable modes -- never guessed:

    - "key_pair" (default, for backward compatibility with every connection
      saved before auth_method existed): the ``password`` column stores an
      encrypted RSA private key (PEM). This is DataCortex's own convention,
      not a Snowflake requirement.
    - "password": the ``password`` column stores an encrypted plain Snowflake
      password.

    Either way, the secret material comes ONLY from the stored/encrypted
    ``password`` value on the connection record -- never from a file path,
    here or anywhere else. test_cases/.env's TEST_SF_PRIVATE_KEY/TEST_SF_PASSWORD
    hold the raw secret value directly (see test_cases/runner/env_loader.py);
    nothing in this codebase reads a key/password from a file at any point.

    ``auth_method`` is read from ``config["auth_method"]`` (sourced from the
    connection's ``additional_params.auth_method``) so it's explicit, stored
    data -- not inferred from the shape of the password string.
    """
    user = _snowflake_strip_or_none(config.get("username"))
    account = _snowflake_strip_or_none(config.get("account"))
    database = _snowflake_strip_or_none(config.get("database") or config.get("database_name"))
    schema = _snowflake_strip_or_none(config.get("schema") or config.get("db_schema"))
    warehouse = _snowflake_blank_to_none(config.get("warehouse"))
    role = _snowflake_blank_to_none(config.get("role"))
    password = _snowflake_strip_or_none(config.get("password"))

    auth_method = _snowflake_strip_or_none(config.get("auth_method")) or "key_pair"
    if auth_method not in ("key_pair", "password"):
        raise SnowflakeConfigError(f"Unsupported Snowflake auth_method: {auth_method!r} (expected 'key_pair' or 'password')")

    if not user:
        raise SnowflakeConfigError(f"Snowflake {auth_method} authentication requires username.")
    if not account:
        raise SnowflakeConfigError(f"Snowflake {auth_method} authentication requires account.")
    if not password:
        raise SnowflakeConfigError(f"Snowflake {auth_method} authentication requires a stored password/key value.")

    return SnowflakeAuthConfig(
        auth_method=auth_method,
        user=user,
        account=account,
        warehouse=warehouse,
        database=database,
        schema=schema,
        role=role,
        private_key=password if auth_method == "key_pair" else None,
        password=password,
    )


def load_private_key_from_value(private_key_value: str) -> bytes:
    """
    Load a private key from an encrypted-or-plaintext PEM string and return PKCS#8 DER bytes.
    """
    if not private_key_value:
        raise SnowflakePrivateKeyError("Snowflake private key value is empty.")

    pem_text = private_key_value
    try:
        decrypted = decrypt_secret(private_key_value)
        if decrypted:
            pem_text = decrypted
            logger.debug("Decrypted private_key from stored value")
    except Exception:
        logger.debug("private_key value is not encrypted or could not be decrypted; using raw value")

    try:
        key = load_pem_private_key(pem_text.encode(), password=None)
    except ValueError as exc:
        raise SnowflakePrivateKeyError(f"Invalid Snowflake private key PEM: {exc}") from exc
    except TypeError as exc:
        raise SnowflakePrivateKeyError(f"Snowflake private key appears encrypted or unsupported: {exc}") from exc

    try:
        return key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    finally:
        del key


def load_password_from_value(password_value: str) -> str:
    """Decrypt a stored plain Snowflake password. No PEM parsing -- password auth only."""
    if not password_value:
        raise SnowflakeConfigError("Snowflake password value is empty.")
    try:
        decrypted = decrypt_secret(password_value)
        if decrypted:
            return decrypted
    except Exception:
        logger.debug("password value is not encrypted or could not be decrypted; using raw value")
    return password_value


def build_connection(
    settings: SnowflakeAuthConfig,
    private_key_der: Optional[bytes] = None,
    plain_password: Optional[str] = None,
):
    """
    Build a ``snowflake.connector`` connection from resolved settings.

    For key-pair auth, pass PKCS#8 DER bytes as ``private_key_der``.
    For password auth, pass the decrypted plain password as ``plain_password``.
    Exactly one of the two must be provided, matching ``settings.auth_method``.
    """
    if not snowflake:
        raise ImportError(
            "snowflake-connector-python is required for Snowflake connections. "
            "Install with `pip install snowflake-connector-python`."
        )

    kwargs: Dict[str, Any] = {
        "user": settings.user,
        "account": settings.account,
    }
    if settings.warehouse is not None:
        kwargs["warehouse"] = settings.warehouse
    if settings.database is not None:
        kwargs["database"] = settings.database
    if settings.schema is not None:
        kwargs["schema"] = settings.schema
    if settings.role is not None:
        kwargs["role"] = settings.role

    if settings.auth_method == "key_pair":
        if private_key_der is None:
            raise SnowflakeConfigError("Internal error: private key bytes were not provided for key_pair auth.")
        kwargs["private_key"] = private_key_der
    elif settings.auth_method == "password":
        if not plain_password:
            raise SnowflakeConfigError("Internal error: plain password was not provided for password auth.")
        kwargs["password"] = plain_password
    else:
        raise SnowflakeConfigError(f"Unsupported Snowflake auth_method: {settings.auth_method!r}")

    logger.debug(
        "Connecting to Snowflake with settings: user=%s, account=%s, database=%s, schema=%s, warehouse=%s, role=%s, auth_method=%s",
        settings.user,
        settings.account,
        settings.database,
        settings.schema,
        settings.warehouse,
        settings.role,
        settings.auth_method,
    )

    return snowflake.connector.connect(**kwargs)


def get_snowflake_connection(config: Dict[str, Any]):
    """
    Open a Snowflake connection using password or RSA key-pair authentication --
    whichever ``auth_method`` the connection was actually saved with.

    Raises:
        ImportError: if snowflake-connector-python is not installed.
        SnowflakeConfigError: if required non-secret settings are missing.
        SnowflakePrivateKeyError: if the private key value is invalid (key-pair mode).
        Exception: Snowflake connector errors (for example invalid credentials or network failures)
            are raised from ``snowflake.connector.connect`` and wrapped by callers as needed.
    """
    if not snowflake:
        raise ImportError(
            "snowflake-connector-python is required for Snowflake connections. "
            "Install with `pip install snowflake-connector-python`."
        )

    settings = load_config(config)
    logger.debug("Snowflake authentication method: %s", settings.auth_method)

    if settings.auth_method == "key_pair":
        private_key_der: Optional[bytes] = None
        try:
            private_key_der = load_private_key_from_value(settings.password)
            return build_connection(settings, private_key_der=private_key_der)
        finally:
            if private_key_der is not None:
                del private_key_der
    else:  # "password"
        plain_password = load_password_from_value(settings.password)
        try:
            return build_connection(settings, plain_password=plain_password)
        finally:
            del plain_password
 

class BaseConnector(ABC):
    """Base class for all database connectors."""
    
    def __init__(self, config: Dict[str, Any], log_system_func: Callable, log_validation_func: Callable):
        """
        Initialize connector with configuration and loggers.
        
        Args:
            config: Dictionary containing connection parameters
            log_system_func: Function to log system messages
            log_validation_func: Function to log validation messages
        """
        self.config = config
        self._log_system_func = log_system_func
        self._log_validation_func = log_validation_func
        self.system_logs = self.config.get("system_logs")
        self.validation_logs = self.config.get("validation_logs")
        self.job_id = self.config.get("job_id", "SYSTEM")

        self._system_logger_expects_structured_args = self._expects_structured_signature(
            self._log_system_func, ("logs", "job_id", "code", "severity", "message")
        )
        self._validation_logger_expects_structured_args = self._expects_structured_signature(
            self._log_validation_func, ("logs", "message")
        )

    @staticmethod
    def _expects_structured_signature(func: Callable, expected_names: Tuple[str, ...]) -> bool:
        """
        Determine whether the provided logger function matches the legacy
        structured logger signature (for example, structured_log.log_system).
        """
        try:
            parameters = list(inspect.signature(func).parameters.keys())
        except (TypeError, ValueError):
            return False

        if len(parameters) < len(expected_names):
            return False

        return tuple(parameters[:len(expected_names)]) == expected_names

    def log_system(
        self, code: str, severity: str, message: str, context: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Logs system events while supporting both logger contracts:
        1) log_system(code, severity, message, context=None)
        2) log_system(logs, job_id, code, severity, message, context=None)
        """
        if self._system_logger_expects_structured_args:
            self.system_logs = self._log_system_func(
                self.system_logs,
                self.job_id,
                code,
                severity,
                message,
                context
            )
            return

        self._log_system_func(code, severity, message, context=context)

    def log_validation(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """
        Logs validation messages while supporting both logger contracts:
        1) log_validation(message, context=None)
        2) log_validation(logs, message, context=None)
        """
        if self._validation_logger_expects_structured_args:
            self.validation_logs = self._log_validation_func(
                self.validation_logs,
                message,
                context
            )
            return

        self._log_validation_func(message, context=context)
    
    @abstractmethod
    def test_connection(self) -> Tuple[bool, str]:
        """
        Test the database connection.
        
        Returns:
            Tuple of (success: bool, message: str)
        """
        return False, "Not Implemented"
    
    @abstractmethod
    def get_connection(self):
        """Get a database connection object. Returns conn."""
        return None
    
    @abstractmethod
    def get_tables(self) -> List[str]:
        """
        Get list of available tables.
        
        Returns:
            List of table names
        """
        return []
    
    def close_connection(self, conn):
        """Close database connection."""
        if conn:
            try:
                conn.close()
            except Exception as e:
                self.log_system("DB_CONN_CLOSE_WARNING", "WARNING", f"Failed to close database connection cleanly: {str(e)}")


class PostgreSQLConnector(BaseConnector):
    """PostgreSQL database connector."""
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test PostgreSQL connection."""
        
        conn = None
        
        try:
            conn = self.get_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.close()
                self.log_system("DB_CONN_SUCCESS", "INFO", "PostgreSQL connection successful")
                self.log_validation(f"Connection test succeeded for PostgreSQL database '{self.config.get('database') or self.config.get('database_name')}'")
                return True, "Connection successful"
            
            self.log_system("DB_CONN_FAIL", "ERROR", "Failed to establish PostgreSQL connection")
            return False, "Failed to establish connection"
        except Exception as e:
            msg = f"Connection failed: {str(e)}"
            self.log_system("DB_CONN_ERROR", "ERROR", msg)
            return False, msg
        finally:
            self.close_connection(conn)
    
    def get_connection(self):
        """Get PostgreSQL connection."""

        try:
            schema = self.config.get('schema') or self.config.get('db_schema') or 'public'
            database = self.config.get('database') or self.config.get('database_name')
            if not database:
                raise DataCodeValidationError("PostgreSQL database/database_name is required")
            # schema goes straight into search_path below, so validate it as an
            # identifier here rather than letting libpq fail on a parse error.
            try:
                schema = _safe_pg_identifier(schema)
            except ValueError as e:
                raise DataCodeValidationError(str(e)) from e
            self.log_system("DB_CONN_POSTGRES_CONFIG", "DEBUG", f"Connecting to PostgreSQL: host={self.config.get('host')}, database={database}, schema={schema}")
            conn = psycopg2.connect(
                host=self.config.get('host'),
                port=self.config.get('port') or 5432,
                user=self.config.get('username'),
                password=self.config.get('password'),
                database=database,
                options=f'-c search_path={schema}',
                connect_timeout=10
            )
            return conn
        except Exception as e:
            # We preserve existing behavior of raising exception, but maybe we should log it first?
            # The caller usually handles logging via catch, but let's log here too if we have the list.
            # Using specific job_id "SYS" as placeholder since this method doesn't take job_id
            self.log_system("DB_CONN_EXCEPTION", "ERROR", f"PostgreSQL connection error: {str(e)}")
            raise DataCodeConnectionError(f"PostgreSQL connection error: {str(e)}") from e
    
    def get_tables(self) -> List[str]:
        """Get list of tables from PostgreSQL database."""
        
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            schema = self.config.get('schema') or self.config.get('db_schema') or 'public'
            query = """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s
                ORDER BY table_name
            """
            cursor.execute(query, (schema,))
            tables = [row[0] for row in cursor.fetchall()]
            cursor.close()
            cursor = None
            self.log_system("DB_FETCH_TABLES", "INFO", f"Fetched {len(tables)} tables")
            self.log_validation(f"Retrieved {len(tables)} table(s) from schema '{schema}'")
            return tables
        except Exception as e:
            self.log_system("DB_FETCH_TABLES_ERROR", "ERROR", f"Error fetching tables: {str(e)}")
            raise DataCodeConnectionError(f"Error fetching PostgreSQL tables: {str(e)}") from e
        finally:
            if 'cursor' in locals() and cursor:
                try:
                    cursor.close()
                except Exception as e:
                    self.log_system("DB_CURSOR_CLOSE_WARNING", "WARNING", f"Failed to close PostgreSQL cursor cleanly: {str(e)}")
            self.close_connection(conn)


class MySQLConnector(BaseConnector):
    """MySQL database connector."""
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test MySQL connection."""
        
        conn = None
        try:
            conn = self.get_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.close()
                self.log_system("DB_CONN_SUCCESS", "INFO", "MySQL connection successful")
                database = self.config.get('database') or self.config.get('database_name')
                self.log_validation(f"Connection test succeeded for MySQL database '{database}'")
                return True, "Connection successful"
            return False, "Failed to establish connection"
        except Exception as e:
            self.log_system("DB_CONN_ERROR", "ERROR", f"MySQL Connection failed: {str(e)}")
            return False, f"Connection failed: {str(e)}"
        finally:
            self.close_connection(conn)
    
    def get_connection(self):
        """Get MySQL connection."""
        try:
            database = self.config.get('database') or self.config.get('database_name')
            if not database:
                raise DataCodeValidationError("MySQL database/database_name is required")
            conn = pymysql.connect(
                host=self.config.get('host'),
                port=self.config.get('port') or 3306,
                user=self.config.get('username'),
                password=self.config.get('password'),
                database=database,
                connect_timeout=10
            )
            return conn
        except Exception as e:
             self.log_system("DB_CONN_EXCEPTION", "ERROR", f"MySQL connection error: {str(e)}")
             raise DataCodeConnectionError(f"MySQL connection error: {str(e)}") from e
    
    def get_tables(self) -> List[str]:
        """Get list of tables from MySQL database."""
        
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            database = self.config.get('database') or self.config.get('database_name')
            if not database:
                raise DataCodeValidationError("MySQL database/database_name is required")
            query = f"SHOW TABLES FROM `{database}`"
            cursor.execute(query)
            tables = [row[0] for row in cursor.fetchall()]
            cursor.close()
            self.log_system("DB_FETCH_TABLES", "INFO", f"Fetched {len(tables)} tables")
            self.log_validation(f"Retrieved {len(tables)} table(s) from database '{database}'")
            return tables
        except Exception as e:
            self.log_system("DB_FETCH_TABLES_ERROR", "ERROR", f"Error fetching tables: {str(e)}")
            raise DataCodeConnectionError(f"Error fetching MySQL tables: {str(e)}") from e
        finally:
            self.close_connection(conn)


class SnowflakeConnector(BaseConnector):
    """Snowflake database connector."""
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test Snowflake connection."""
        
        if not snowflake:
            msg = "snowflake-connector-python is required for Snowflake connections."
            self.log_system("DB_CONN_MISSING_LIB", "ERROR", msg)
            return False, msg + " Install with `pip install snowflake-connector-python`."
        
        conn = None
        try:
            conn = self.get_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.close()
                self.log_system("DB_CONN_SUCCESS", "INFO", "Snowflake connection successful")
                self.log_validation(f"Connection test succeeded for Snowflake account '{self.config.get('account')}'")
                return True, "Connection successful"
            return False, "Failed to establish connection"
        except Exception as e:
            self.log_system("DB_CONN_ERROR", "ERROR", f"Snowflake Connection failed: {str(e)}")
            return False, f"Connection failed: {str(e)}"
        finally:
            self.close_connection(conn)
    
    def get_connection(self):
        """Get Snowflake connection (password or RSA key-pair; see :func:`get_snowflake_connection`)."""
        try:
            conn = get_snowflake_connection(self.config)
            # settings = load_config(self.config)
            self.log_validation(f"Snowflake connection established")
            # self.log_validation(f"Snowflake connection established using '{settings.auth_method}' authentication")
            return conn
        except SnowflakeConfigError as e:
            self.log_system("DB_CONN_EXCEPTION", "ERROR", f"Snowflake configuration error: {str(e)}")
            raise DataCodeConnectionError(f"Snowflake connection error: {str(e)}") from e
        except SnowflakePrivateKeyError as e:
            self.log_system("DB_CONN_EXCEPTION", "ERROR", f"Snowflake private key error: {str(e)}")
            raise DataCodeConnectionError(f"Snowflake connection error: {str(e)}") from e
        except ImportError:
            raise
        except Exception as e:
            self.log_system("DB_CONN_EXCEPTION", "ERROR", f"Snowflake connection error: {str(e)}")
            raise DataCodeConnectionError(f"Snowflake connection error: {str(e)}") from e
    
    def get_tables(self) -> List[str]:
        """Get list of tables from Snowflake database."""
        
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            database = self.config.get('database') or self.config.get('database_name')
            schema = self.config.get('schema') or self.config.get('db_schema')
            if not database or not schema:
                raise DataCodeValidationError("Snowflake database and schema are required to fetch tables")
            db_lit = (database or "").replace("'", "''")
            schema_lit = (schema or "").replace("'", "''")
            query = f"""
                SELECT table_name 
                FROM {db_lit}.information_schema.tables 
                WHERE table_schema = '{schema_lit}'
                ORDER BY table_name
            """
            cursor.execute(query)
            tables = [row[0] for row in cursor.fetchall()]
            cursor.close()
            self.log_system("DB_FETCH_TABLES", "INFO", f"Fetched {len(tables)} tables")
            self.log_validation(f"Retrieved {len(tables)} table(s) from '{database}.{schema}'")
            return tables
        except Exception as e:
            self.log_system("DB_FETCH_TABLES_ERROR", "ERROR", f"Error fetching tables: {str(e)}")
            raise DataCodeConnectionError(f"Error fetching Snowflake tables: {str(e)}") from e
        finally:
            self.close_connection(conn)


class RDSConnector(BaseConnector):
    """RDS database connector (supports PostgreSQL and MySQL engines)."""
    
    def test_connection(self) -> Tuple[bool, str]:
        """Test RDS connection."""
        
        # RDS can be PostgreSQL or MySQL, determine from config
        engine = self.config.get('engine', 'postgresql').lower()
        
        if engine == 'postgresql':
            connector = PostgreSQLConnector(self.config, self.log_system, self.log_validation)
        elif engine == 'mysql':
            connector = MySQLConnector(self.config, self.log_system, self.log_validation)
        else:
            self.log_system("DB_ENGINE_UNSUPPORTED", "ERROR", f"Unsupported RDS engine: {engine}")
            self.log_validation(f"Connection test failed: unsupported RDS engine '{engine}'")
            return False, f"Unsupported RDS engine: {engine}"
        
        self.log_validation(f"RDS connection test delegated to '{engine}' engine")
        return connector.test_connection()
    
    def get_connection(self):
        """Get RDS connection."""
        
        engine = self.config.get('engine', 'postgresql').lower()
        
        if engine == 'postgresql':
            connector = PostgreSQLConnector(self.config, self.log_system, self.log_validation)
        elif engine == 'mysql':
            connector = MySQLConnector(self.config, self.log_system, self.log_validation)
        else:
            raise Exception(f"Unsupported RDS engine: {engine}")
        
        self.log_validation(f"RDS connection delegated to '{engine}' engine")
        return connector.get_connection()
    
    def get_tables(self) -> List[str]:
        """Get list of tables from RDS database."""
        
        engine = self.config.get('engine', 'postgresql').lower()
        
        if engine == 'postgresql':
            connector = PostgreSQLConnector(self.config, self.log_system, self.log_validation)
        elif engine == 'mysql':
            connector = MySQLConnector(self.config, self.log_system, self.log_validation)
        else:
            raise Exception(f"Unsupported RDS engine: {engine}")
        
        self.log_validation(f"RDS table listing delegated to '{engine}' engine")
        return connector.get_tables()


def get_connector(db_type: str, config: Dict[str, Any], log_system_func: Callable, log_validation_func: Callable) -> BaseConnector:
    """
    Factory function to get appropriate connector based on database type.
    
    Args:
        db_type: Type of database (postgresql, mysql, snowflake, rds)
        config: Connection configuration dictionary
        log_system_func: System logger
        log_validation_func: Validation logger
        
    Returns:
        Appropriate connector instance
    """
    connectors = {
        'postgres': PostgreSQLConnector,
        'postgresql': PostgreSQLConnector,
        'mysql': MySQLConnector,
        'snowflake': SnowflakeConnector,
        'rds': RDSConnector
    }
    
    db_type_lower = db_type.lower()
    if db_type_lower not in connectors:
        raise ValueError(f"Unsupported database type: {db_type}")
    
    return connectors[db_type_lower](config, log_system_func, log_validation_func)
