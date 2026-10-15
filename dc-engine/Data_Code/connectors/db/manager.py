from typing import Optional, Dict, List, Any, Tuple, Callable
import json
import os
import pandas as pd
from datetime import datetime, timezone

# Internal imports
from .models import DatabaseConnection
from Data_Code.common.constants import INTERNAL_DB_SENTINEL
from Data_Code.common.database import get_db_session, _env_int, _safe_pg_identifier
from Data_Code.common.id_generation import (
    DATABASE_CONNECTION_ID_SEQ,
    next_sequential_id,
)
from Data_Code.common.encryption import decrypt_password, encrypt_secret
from Data_Code.common.exceptions import (
    DataCodeConnectionError,
    DataCodePersistenceError,
    DataCodeValidationError,
)
from .connectors import get_connector

# user_id placeholders that predate the users-table FK. They aren't real user
# rows, so they're stored as NULL (the column is nullable) rather than as a
# string that would violate the foreign key.
_PLACEHOLDER_USER_IDS = {"system", "SYSTEM", ""}


def _normalize_user_id(user_id: Optional[str]) -> Optional[str]:
    """Map the legacy "system" placeholder to NULL so the users FK holds."""
    if user_id is None:
        return None
    return None if str(user_id).strip() in _PLACEHOLDER_USER_IDS else user_id


def _canonical_database_type(database_type: Optional[str]) -> Optional[str]:
    """
    One spelling per stored value: ``postgres``, never ``postgresql``.

    The database_type_enum on the shared metadata database only permits
    'postgres'/'mysql'/'snowflake'. Read paths keep seeing "postgresql"
    because ``normalize_database_type`` maps it back, so this only constrains
    what gets written.
    """
    if database_type is None:
        return None
    value = str(database_type).lower()
    return "postgres" if value == "postgresql" else value


def _build_internal_details_from_env() -> Dict[str, Any]:
    """
    Build a connection-details dict for the product's own database from the
    RDS_* env vars -- the same shape ``get_connection_details`` returns for a
    stored row, so every downstream caller is unaffected.

    This is what keeps product DB credentials out of ``database_connection``:
    the file-based ingest path refers to its staging host by sentinel, and the
    credentials are resolved here, in memory, at the moment they're needed.
    """
    return {
        "connection_id": INTERNAL_DB_SENTINEL,
        "connection_name": INTERNAL_DB_SENTINEL,
        "database_type": "postgres",
        "host": os.getenv("RDS_HOST"),
        "port": _env_int("RDS_PORT", 5432),
        "username": os.getenv("RDS_USERNAME"),
        "password": os.getenv("RDS_PASSWORD") or "",
        "database_name": os.getenv("RDS_DATABASE"),
        "db_schema": os.getenv("RDS_SCHEMA", "public"),
        "additional_params": None,
    }

def build_connector_config(
    database_type: str,
    host: Optional[str],
    port: Optional[int],
    username: str,
    password: Optional[str],
    database_name: str,
    db_schema: str,
    additional_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Merge stored columns with additional_params and expose aliases expected by connectors:
    database / schema alongside database_name / db_schema.
    Column values win over conflicting keys in additional_params for logical DB/schema.
    ``host`` and ``port`` may be ``None`` (Snowflake Option B).
    """
    merged = dict(additional_params or {})
    db_type = (database_type or "").lower()

    merged["database_type"] = database_type
    merged["host"] = host
    merged["port"] = port
    merged["username"] = username
    merged["password"] = password or ""
    merged["database_name"] = database_name
    merged["db_schema"] = db_schema
    merged["database"] = database_name
    merged["schema"] = db_schema

    if db_type == "rds" and "engine" not in merged:
        merged["engine"] = "postgresql"

    return merged


def connection_record_to_details(
    record: DatabaseConnection,
    password: str,
) -> Dict[str, Any]:
    """
    API-shaped connection payload: column fields at top level, connector extras nested.
    """

    if record.additional_params is None:
        record.additional_params = {}

    return {
        "connection_id": record.connection_id,
        "connection_name": record.connection_name,
        "database_type": record.database_type,
        "host": record.host,
        "port": record.port,
        "username": record.username,
        "password": password,
        "database_name": record.database_name,
        "db_schema": record.db_schema,
        "additional_params": (
            json.loads(record.additional_params)
            if isinstance(record.additional_params, str) and record.additional_params
            else dict(record.additional_params) if record.additional_params
            else None
        ),
    }


def details_to_connector_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert ``get_connection_details`` output (or legacy flat config) into the
    merged dict expected by connectors via ``build_connector_config``.
    """
    if config.get("connection_id") is not None or config.get("connection_name") is not None:
        extra = config.get("additional_params") or {}
        if not isinstance(extra, dict):
            extra = {}
        return build_connector_config(
            database_type=config.get("database_type", ""),
            host=config.get("host"),
            port=config.get("port"),
            username=config.get("username", ""),
            password=config.get("password"),
            database_name=config.get("database_name", ""),
            db_schema=config.get("db_schema", ""),
            additional_params=extra,
        )
    return dict(config)


def _prepare_update_kwargs_from_details(config: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Split column fields and nested additional_params for ``update_connection``."""
    cfg = dict(config)
    extra = cfg.pop("additional_params", None) or {}
    if not isinstance(extra, dict):
        extra = {}

    if "database" in cfg and "database_name" not in cfg:
        cfg["database_name"] = cfg.pop("database")
    if "schema" in cfg and "db_schema" not in cfg:
        cfg["db_schema"] = cfg.pop("schema")

    for key in ("connection_id", "database", "schema"):
        cfg.pop(key, None)

    return cfg, extra


def _qualify_table_reference(config: Dict[str, Any], table_name: str) -> str:
    """Build a Snowflake-safe table reference; pass through if already qualified."""
    name = (table_name or "").strip()
    if not name or "." in name:
        return name
    if (config.get("database_type") or "").lower() != "snowflake":
        return name
    database = (config.get("database") or config.get("database_name") or "").strip()
    schema = (config.get("schema") or config.get("db_schema") or "PUBLIC").strip()
    if database and schema:
        return f"{database}.{schema}.{name}"
    if schema:
        return f"{schema}.{name}"
    return name


def _validate_save_connection_fields(
    connection_name: str,
    database_type: str,
    host: Optional[str],
    port: Optional[int],
    username: str,
    password: Optional[str],
    database_name: str,
    db_schema: str,
    additional_params: Optional[Dict[str, Any]] = None,
    require_connection_name: bool = True,
    partial: bool = False,
) -> List[str]:
    """
    Return validation error messages for save_connection / equivalent payloads.

    ``partial=True`` is the update mode: a field left as ``None`` means "don't
    change it" and is skipped, but any field that *was* supplied is validated
    exactly as on save. Without this, update_connection accepted anything --
    empty passwords, negative ports -- and the breakage only surfaced later,
    at connect time.
    """
    errors: List[str] = []

    def _supplied(value) -> bool:
        """In partial mode, only validate what the caller actually passed."""
        return not (partial and value is None)

    if require_connection_name and _supplied(connection_name) and not connection_name:
        errors.append("connection_name is required")
    if _supplied(database_type) and not database_type:
        errors.append("database_type is required")
    if _supplied(username) and not username:
        errors.append("username is required")
    db_type = (database_type or "").lower()
    extra = additional_params or {}

    # if db_type != "snowflake" and not password: errors.append("password is required")
    if _supplied(password) and not password: errors.append("password is required")
    if _supplied(database_name) and not database_name: errors.append("database_name is required")
    if _supplied(db_schema) and not db_schema: errors.append("db_schema is required")

    # db_schema is interpolated into SQL as an identifier downstream, so reject
    # anything that isn't a plain unquoted identifier here, at save time, rather
    # than letting it through to a psycopg2 parse error at connect time.
    if db_schema:
        try:
            _safe_pg_identifier(db_schema)
        except ValueError:
            errors.append(
                f"db_schema must be a plain identifier (letters, digits, underscore, "
                f"not starting with a digit); got {db_schema!r}"
            )

    if partial and not db_type:
        # Type not being changed -- the type-specific rules below can't be
        # evaluated without it, and the stored value already passed them.
        return errors

    if db_type == "snowflake":
        if not (extra.get("account") or "").strip():
            errors.append("additional_params.account is required for snowflake")
        pk_val = (password or "").strip()
        if _supplied(password) and not pk_val:
            errors.append("Snowflake private key is required")
    elif db_type in ("postgresql", "postgres", "mysql", "rds"):
        if _supplied(host) and not (host or "").strip():
            errors.append("host is required for postgresql, mysql, and rds")
        if port is None:
            if not partial:
                errors.append("port is required for postgresql, mysql, and rds")
        else:
            try:
                if int(port) <= 0:
                    errors.append("port must be a positive integer for postgresql, mysql, and rds")
            except (TypeError, ValueError):
                errors.append("port must be a valid integer for postgresql, mysql, and rds")
    else:
        errors.append(f"unsupported database_type: {database_type}")

    return errors


class DatabaseConnectionManager:
    """
    Manager for database connections (create, read, update, delete, test).

    Runtime configs use ``build_connector_config`` so column values and
    ``additional_params`` merge consistently with ``database`` / ``schema`` aliases.
    Snowflake rows use NULL ``host``/``port`` (Option B); see module header and the
    ``additional_params`` contract.
    """
    
    def __init__(self, log_system_func: Callable, log_validation_func: Callable):
        self.log_system = log_system_func
        self.log_validation = log_validation_func

    def generate_database_connection_id(self, session=None) -> str:
        """
        Generate a connection ID with format 'DBXXX'.
        Example: DB001, DB002

        Allocated from a PostgreSQL sequence, so two concurrent saves can
        never receive the same ID. Pass ``session`` to allocate inside the
        caller's transaction; omitted, a short-lived session is used.

        The existing-ID scan is deliberately *not* filtered by ``enabled`` --
        a soft-deleted DB005 still occupies that primary key, so its number
        must stay claimed.
        """
        own_session = session is None
        session = session or get_db_session()
        try:
            existing_ids = [cid for (cid,) in session.query(DatabaseConnection.connection_id).all()]
            return next_sequential_id(
                session,
                sequence_name=DATABASE_CONNECTION_ID_SEQ,
                prefix="DB",
                existing_ids=existing_ids,
            )
        except Exception as e:
            raise DataCodePersistenceError(f"Failed to generate database connection ID: {str(e)}") from e
        finally:
            if own_session:
                session.close()

    def save_connection(
        self,
        connection_name: str,
        database_type: str,
        host: Optional[str],
        port: Optional[int],
        username: str,
        password: Optional[str],
        database_name: str,
        db_schema: str,
        user_id: str = "system",
        **additional_params

    ) -> Tuple[bool, str, Optional[str]]:
        """
        Create a new database connection from credentials entered by a user.

        Create-only: a duplicate ``connection_name`` is rejected rather than
        overwritten. The old upsert-by-name behaviour let any caller silently
        take over someone else's connection just by reusing its name. Use
        ``update_connection(connection_id=...)`` to modify an existing one.

        The credentials are tested against the target before the row is
        committed, so a connection that can't actually connect never gets
        stored -- otherwise the failure surfaces much later, at job time.

        For ``snowflake``, pass ``host=None`` and ``port=None`` (persisted as NULL); TCP types
        require non-null host/port (enforced by validation).
        """
        extra = dict(additional_params) if additional_params else {}

        if (connection_name or "").strip() == INTERNAL_DB_SENTINEL:
            msg = (
                f'"{INTERNAL_DB_SENTINEL}" is reserved for the product database '
                "and cannot be used as a connection name"
            )
            self.log_validation(msg, context={'connection_name': connection_name})
            self.log_system("DB_SAVE_RESERVED_NAME", "WARNING", msg)
            return False, msg, None

        val_errors = _validate_save_connection_fields(
            connection_name=connection_name,
            database_type=database_type,
            host=host,
            port=port,
            username=username,
            password=password,
            database_name=database_name,
            db_schema=db_schema,
            additional_params=extra,
            require_connection_name=True,
        )

        if val_errors:
            msg = f"Validation failed: {', '.join(val_errors)}"
            self.log_validation(msg, context={'validation_errors': val_errors})
            self.log_system("DB_SAVE_VALIDATION_FAIL", "WARNING", msg)
            return False, msg, None
            
        session = get_db_session()
        try:
            # Create-only: a name collision is an error, not an overwrite.
            existing = session.query(DatabaseConnection).filter_by(connection_name=connection_name).first()
            if existing:
                msg = (
                    f'Connection name "{connection_name}" already exists '
                    f'({existing.connection_id}) -- use update_connection to modify it'
                )
                self.log_validation(msg, context={'connection_name': connection_name, 'connection_id': existing.connection_id})
                self.log_system("DB_CONN_SAVE_DUPLICATE_NAME", "WARNING", msg)
                return False, msg, None

            # Prove the credentials work before storing them.
            ok, test_msg = self.test_connection(
                database_type=database_type,
                username=username,
                password=password,
                database=database_name,
                schema=db_schema,
                host=host,
                port=port,
                **extra,
            )
            if not ok:
                msg = f'Connection "{connection_name}" not saved -- connection test failed: {test_msg}'
                self.log_system("DB_CONN_SAVE_TEST_FAIL", "ERROR", msg)
                return False, msg, None

            # Encrypt credential
            encrypted_password = encrypt_secret(password or "")
            self.log_system(
                "DB_SAVE_ENCRYPT_KEY",
                "DEBUG",
                "Encrypted password/private_key for storage"
            )

            # Generate connection_id inside this transaction
            connection_id = self.generate_database_connection_id(session=session)

            # Create new connection record
            db_connection = DatabaseConnection(
                connection_id=connection_id,
                connection_name=connection_name,
                database_type=_canonical_database_type(database_type),
                db_schema=db_schema,
                host=host,
                port=port,
                username=username,
                secret=encrypted_password,
                database_name=database_name,
                additional_params=extra,
                user_id=_normalize_user_id(user_id),
            )

            session.add(db_connection)
            session.commit()

            self.log_system("DB_CONN_SAVE", "INFO", 'Connection saved successfully')
            self.log_validation(f'Database connection "{connection_name}" created with ID {connection_id}', context={'connection_id': connection_id, 'connection_name': connection_name, 'database_type': database_type})
            return True, 'Connection saved successfully', connection_id

        except DataCodeValidationError as e:
            session.rollback()
            self.log_system("DB_CONN_SAVE_VALIDATION_ERROR", "ERROR", str(e))
            return False, str(e), None
        except Exception as e:
            session.rollback()
            msg = f'Error saving connection "{connection_name}": {str(e)}'
            self.log_system("DB_CONN_SAVE_ERROR", "ERROR", msg)
            return False, msg, None
        finally:
            session.close()

    def update_connection(
        self,
        connection_id: str,
        connection_name: Optional[str] = None,
        database_type: Optional[str] = None,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        database_name: Optional[str] = None,
        db_schema: Optional[str] = None,
        **additional_params
    ) -> Tuple[bool, str]:
        """
        Update an existing database connection using connection_id.

        Every field the caller supplies is validated the same way it would be
        on save (partial mode), and a rename to a name another connection
        already holds is rejected -- the uniqueness rule can't be enforced on
        create and then bypassed on update.
        """
        if not connection_id:
            msg = "Validation failed: connection_id is required"
            self.log_validation(msg, context={'validation_errors': ["connection_id is required"]})
            self.log_system("DB_UPDATE_VALIDATION_FAIL", "WARNING", msg)
            return False, msg

        if connection_id == INTERNAL_DB_SENTINEL or (connection_name or "").strip() == INTERNAL_DB_SENTINEL:
            msg = (
                f'"{INTERNAL_DB_SENTINEL}" is reserved for the product database '
                "and cannot be used as a connection id or name"
            )
            self.log_system("DB_UPDATE_RESERVED_NAME", "WARNING", msg)
            return False, msg

        val_errors = _validate_save_connection_fields(
            connection_name=connection_name,
            database_type=database_type,
            host=host,
            port=port,
            username=username,
            password=password,
            database_name=database_name,
            db_schema=db_schema,
            additional_params=dict(additional_params) if additional_params else {},
            require_connection_name=True,
            partial=True,
        )
        if val_errors:
            msg = f"Validation failed: {', '.join(val_errors)}"
            self.log_validation(msg, context={'validation_errors': val_errors})
            self.log_system("DB_UPDATE_VALIDATION_FAIL", "WARNING", msg)
            return False, msg

        session = get_db_session()
        try:
            existing = session.query(DatabaseConnection).filter_by(connection_id=connection_id).first()

            if not existing:
                msg = f"Connection ID {connection_id} not found."
                self.log_system("DB_CONN_UPDATE_NOT_FOUND", "ERROR", msg)
                return False, msg

            if connection_name is not None and connection_name != existing.connection_name:
                clash = (
                    session.query(DatabaseConnection)
                    .filter(DatabaseConnection.connection_name == connection_name)
                    .filter(DatabaseConnection.connection_id != connection_id)
                    .first()
                )
                if clash:
                    msg = (
                        f'Cannot rename to "{connection_name}" -- that name is already '
                        f'used by {clash.connection_id}'
                    )
                    self.log_validation(msg, context={'connection_id': connection_id, 'connection_name': connection_name})
                    self.log_system("DB_CONN_UPDATE_DUPLICATE_NAME", "WARNING", msg)
                    return False, msg

            # Update fields if provided
            if connection_name is not None:
                existing.connection_name = connection_name
            if database_type is not None:
                existing.database_type = _canonical_database_type(database_type)
            if host is not None:
                existing.host = host
            if port is not None:
                existing.port = port
            if username is not None:
                existing.username = username
            if password is not None:
                existing.secret = encrypt_secret(password)
                self.log_system(
                    "DB_UPDATE_ENCRYPT_KEY",
                    "DEBUG",
                    "Encrypted Snowflake private key for storage"
                )

            if database_name is not None:
                existing.database_name = database_name
            if db_schema is not None:
                existing.db_schema = db_schema
            if additional_params:

                if existing.additional_params is None:
                    existing.additional_params = additional_params
                else:
                    # Update existing additional params with new ones
                    current_params = dict(existing.additional_params)
                    current_params.update(additional_params)
                    existing.additional_params = current_params

            session.commit()

            name_for_log = connection_name if connection_name is not None else existing.connection_name
            self.log_system("DB_CONN_UPDATE", "INFO", f'Connection "{name_for_log}" ({connection_id}) updated successfully')
            self.log_validation(f'Database connection "{name_for_log}" ({connection_id}) was updated', context={'connection_id': connection_id, 'connection_name': name_for_log})
            return True, f'Connection "{name_for_log}" ({connection_id}) updated successfully'
            
        except Exception as e:
            session.rollback()
            msg = f'Error updating connection {connection_id}: {str(e)}'
            self.log_system("DB_CONN_UPDATE_ERROR", "ERROR", msg)
            return False, msg
        finally:
            session.close()

    def update_connection_details(self, connection_id: str, config: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Update an existing database connection using connection_id and a config dictionary.
        This provides a symmetric method to get_connection_details.
        """
        field_kwargs, extra = _prepare_update_kwargs_from_details(config)
        return self.update_connection(connection_id=connection_id, **field_kwargs, **extra)

    def test_connection(
        self,
        database_type: str,
        username: str,
        password: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        host: Optional[str] = None,
        port: Optional[int] = None,
        **additional_params
    ) -> Tuple[bool, str]:
        """
        Test whether the connection is created successfully.
        For ``snowflake``, omit ``host`` and ``port`` (or pass ``None``). For TCP types,
        pass both host and port.
        """
        extra = dict(additional_params) if additional_params else {}

        val_errors = _validate_save_connection_fields(
            connection_name="",
            database_type=database_type,
            host=host,
            port=port,
            username=username,
            password=password,
            database_name=database or "",
            db_schema=schema or "",
            additional_params=extra,
            require_connection_name=False,
        )
        if val_errors:
            msg = f"Validation failed: {', '.join(val_errors)}"
            self.log_validation(msg, context={'validation_errors': val_errors})
            self.log_system("DB_TEST_VALIDATION_FAIL", "WARNING", msg)
            return False, msg

        try:
            config = build_connector_config(
                database_type=database_type,
                host=host,
                port=port,
                username=username,
                password=password,
                database_name=database or "",
                db_schema=schema or "",
                additional_params=extra,
            )
            connector = get_connector(database_type, config, self.log_system, self.log_validation)
            return connector.test_connection()
        except (ValueError, TypeError) as e:
            msg = f"Connection test validation failed for {database_type}: {str(e)}"
            self.log_system("DB_CONN_TEST_VALIDATION_ERROR", "ERROR", msg)
            return False, msg
        except Exception as e:
            msg = f"Connection test failed for {database_type}: {str(e)}"
            self.log_system("DB_CONN_TEST_FAIL", "ERROR", msg)
            return False, msg

    def get_connection_details(self, connection_id: str) -> Dict[str, Any]:
        """
        Get stored connection fields for a connection_id.

        Returns column-backed fields at the top level with ``additional_params``
        nested (not merged). Use ``details_to_connector_config`` or
        ``set_connection`` for runtime connector configuration.

        Two behaviours worth knowing:

        - ``INTERNAL_DB_SENTINEL`` is intercepted and resolved from the RDS_*
          env vars. Every caller that needs the product database in its
          staging role (``get_connection``, metadata collection, cleanup)
          reaches it through here, so this one intercept covers them all.
        - Soft-deleted connections (``enabled=False``) are not returned. The
          flag was being set on delete but never read, which made the soft
          delete cosmetic -- the connection stayed fully usable.
        """
        if connection_id == INTERNAL_DB_SENTINEL:
            self.log_system(
                "DB_CONN_DETAILS_INTERNAL",
                "DEBUG",
                "Resolved internal product-database connection from RDS_* environment",
            )
            return _build_internal_details_from_env()

        session = get_db_session()
        try:
            connection_record = (
                session.query(DatabaseConnection)
                .filter_by(connection_id=connection_id, enabled=True)
                .first()
            )

            if not connection_record:
                self.log_system("DB_CONN_NOT_FOUND", "ERROR", f"Connection ID {connection_id} not found.")
                raise DataCodeValidationError(f"Connection ID {connection_id} not found.")

            if connection_record.secret:
                password = decrypt_password(connection_record.secret)
            else:
                password = ""
            self.log_system("DB_CONN_DETAILS_LOADED", "DEBUG", f"Loaded connection {connection_id} for database_type={connection_record.database_type}")
            return connection_record_to_details(connection_record, password)
            
        except DataCodeValidationError:
             raise
        except Exception as e:
             self.log_system("DB_GET_CONN_DETAILS_ERROR", "ERROR", f"Failed to get connection details for {connection_id}: {str(e)}")
             raise DataCodeConnectionError(f"Failed to get connection details for {connection_id}: {str(e)}") from e
        finally:
            session.close()

    def set_connection(self, config: Dict[str, Any]):
        """
        Takes the dictionary of connection parameters and returns the connection object.
        Accepts ``get_connection_details`` output or a legacy flat connector config.
        """
        try:
            runtime_config = details_to_connector_config(config)
            database_type = runtime_config.get('database_type')
            if not database_type:
                raise DataCodeValidationError("database_type is missing from connection configuration")
                
            connector = get_connector(database_type, runtime_config, self.log_system, self.log_validation)
            return connector.get_connection()
        except DataCodeValidationError:
             raise
        except Exception as e:
             self.log_system("DB_SET_CONN_ERROR", "ERROR", f"Failed to set connection: {str(e)}")
             raise DataCodeConnectionError(f"Failed to set connection: {str(e)}") from e

    def get_connection(self, connection_id: str):
        """
        Expect a connection id (DBnnn, e.g. DB001) and return the connection
        object (cursor/conn). Returns connection on success, or raises
        Exception on failure. Maintained for backward compatibility.

        Accepts ``INTERNAL_DB_SENTINEL`` too -- it goes through
        ``get_connection_details``, which intercepts it, so no separate path
        is needed here.
        """
        details = self.get_connection_details(connection_id)
        return self.set_connection(details)

    def get_table(self, connection_id: str, table_name: str) -> pd.DataFrame:
        """
        Return specific table in a dataframe.
        """

        conn = None
        cursor = None
        qualified_table = table_name or "<unknown>"
        try:
            if not table_name:
                raise DataCodeValidationError("Table name must be provided")

            details = self.get_connection_details(connection_id)
            runtime_config = details_to_connector_config(details)
            qualified_table = _qualify_table_reference(runtime_config, table_name)
            conn = self.set_connection(runtime_config)

            query = f"SELECT * FROM {qualified_table}"
            
            # Using manual cursor fetch to avoid pandas warning regarding raw DBAPI2 connections
            cursor = conn.cursor()
            cursor.execute(query)
            columns = [desc[0] for desc in cursor.description]
            data = cursor.fetchall()
            df = pd.DataFrame(data, columns=columns)
            cursor.close()
            cursor = None
            
            self.log_system("DB_READ_TABLE", "INFO", f"Read {len(df)} rows from {qualified_table}")
            return df
            
        except DataCodeValidationError:
            raise
        except Exception as e:
            self.log_system("DB_READ_TABLE_ERROR", "ERROR", f"Error fetching table {qualified_table}: {str(e)}")
            raise DataCodeConnectionError(f"Error fetching table {qualified_table}: {str(e)}") from e
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception as e:
                    self.log_system("DB_CURSOR_CLOSE_WARNING", "WARNING", f"Failed to close cursor for table {qualified_table}: {str(e)}")
            self.close_connection(conn)

    def get_table_with_credentials(self, config: Dict[str, Any], table_name: str) -> pd.DataFrame:
        """
        Return specific table in a dataframe.
        """

        conn = None
        cursor = None
        qualified_table = table_name or "<unknown>"
        try:
            if not table_name:
                raise DataCodeValidationError("Table name must be provided")

            runtime_config = details_to_connector_config(config)
            qualified_table = _qualify_table_reference(runtime_config, table_name)
            conn = self.set_connection(runtime_config)

            query = f"SELECT * FROM {qualified_table}"
            
            # Using manual cursor fetch to avoid pandas warning regarding raw DBAPI2 connections
            cursor = conn.cursor()
            cursor.execute(query)
            columns = [desc[0] for desc in cursor.description]
            data = cursor.fetchall()
            df = pd.DataFrame(data, columns=columns)
            cursor.close()
            cursor = None
            
            self.log_system("DB_READ_TABLE", "INFO", f"Read {len(df)} rows from {qualified_table}")
            return df
            
        except DataCodeValidationError:
            raise
        except Exception as e:
            self.log_system("DB_READ_TABLE_ERROR", "ERROR", f"Error fetching table {qualified_table}: {str(e)}")
            raise DataCodeConnectionError(f"Error fetching table {qualified_table}: {str(e)}") from e
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception as e:
                    self.log_system("DB_CURSOR_CLOSE_WARNING", "WARNING", f"Failed to close cursor for table {qualified_table}: {str(e)}")
            self.close_connection(conn)


    def close_connection(self, conn):
        """
        Close the db_session and close the connection.
        """
        if conn:
            try:
                conn.close()
            except Exception as e:
                self.log_system("DB_CONN_CLOSE_WARNING", "WARNING", f"Failed to close database connection cleanly: {str(e)}")



    def delete_connection(self, connection_id: str) -> Tuple[bool, str]:
        """
        Soft delete a saved database connection.
        Sets enabled=False and populates deactivated_at.

        Only an enabled connection can be deleted -- deleting one twice is a
        no-op that reports not-found, rather than silently re-stamping
        deactivated_at.
        """
        if connection_id == INTERNAL_DB_SENTINEL:
            msg = (
                f'"{INTERNAL_DB_SENTINEL}" is the product database, not a stored '
                "connection, and cannot be deleted"
            )
            self.log_system("DB_DEL_RESERVED", "WARNING", msg)
            return False, msg

        session = get_db_session()
        try:
            connection = (
                session.query(DatabaseConnection)
                .filter_by(connection_id=connection_id, enabled=True)
                .first()
            )

            if not connection:
                self.log_system(
                    "DB_DEL_NOT_FOUND",
                    "WARNING",
                    f"Connection ID {connection_id} not found."
                )
                return False, f"Connection ID {connection_id} not found."

            # Soft delete
            connection.enabled = False
            connection.deactivated_at = datetime.now(timezone.utc)

            session.commit()

            self.log_system(
                "DB_DEL_SUCCESS",
                "INFO",
                f"Connection {connection_id} deactivated successfully."
            )
            self.log_validation(
                f"Database connection {connection_id} was deactivated",
                context={"connection_id": connection_id}
            )

            return True, f"Connection {connection_id} deactivated successfully."

        except Exception as e:
            session.rollback()
            self.log_system(
                "DB_DEL_ERROR",
                "ERROR",
                f"Error deactivating connection: {str(e)}"
            )
            return False, f"Error deactivating connection: {str(e)}"

        finally:
            session.close()
