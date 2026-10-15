"""
File connection manager functions.
"""
import json
import os
import csv
import io
from typing import Dict, Any, Optional, Tuple, Callable
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from .models import FileConnection
from Data_Code.common.constants import INTERNAL_DB_SENTINEL
from Data_Code.common.database import get_db_session
from Data_Code.common.id_generation import (
    FILE_CONNECTION_ID_SEQ,
    next_sequential_id,
)
from Data_Code.common.sanitization import sanitize_file_name_for_table
from Data_Code.common.encryption import encrypt_secret, decrypt_secret
from Data_Code.common.exceptions import (
    DataCodeConfigurationError,
    DataCodeConnectionError,
    DataCodeFileParseError,
    DataCodeValidationError,
)
from .connectors import get_file_connector
from Data_Code.connectors.db.connectors import get_connector
import datetime

# Rows per round-trip when loading a source file into the staging table.
_INSERT_BATCH_SIZE = 1000


class FileConnectionManager:
    """
    Manager for file connections.
    Includes create, read, update, delete, and test operations.
    """

    def __init__(self, log_system_func: Callable, log_validation_func: Callable):
        self.log_system = log_system_func
        self.log_validation = log_validation_func

    def generate_file_connection_id(self) -> str:
        """
        Generate an ID like 'FCXXX' (e.g., FC001, FC002).

        Allocated from a PostgreSQL sequence so concurrent saves can't collide.
        The existing-ID scan only positions a sequence that doesn't exist yet,
        and is deliberately unfiltered -- a soft-deleted FC005 still holds that
        primary key.
        """
        session = get_db_session()
        try:
            existing_ids = [cid for (cid,) in session.query(FileConnection.connection_id).all()]
            return next_sequential_id(
                session,
                sequence_name=FILE_CONNECTION_ID_SEQ,
                prefix="FC",
                existing_ids=existing_ids,
            )
        finally:
            session.close()

    def _map_credentials_to_db_fields(
        self, connector_type: str, credentials: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], Optional[str], Dict[str, Any]]:
        """Map connector credentials to database fields."""
        connector_type_lower = connector_type.lower()
        db_fields = {
            'storage_type': connector_type_lower
        }
        extra_params: Dict[str, Any] = {}
        secret_value = None

        if connector_type_lower == 's3':
            db_fields['bucket_or_container_name'] = credentials.get('bucket')
            db_fields['region'] = credentials.get('region')
            db_fields['access_key_id'] = credentials.get('access_key_id')
            if credentials.get('endpoint_url'):
                extra_params['endpoint_url'] = credentials.get('endpoint_url')
            secret_value = credentials.get('secret_key')
        elif connector_type_lower == 'azure_blob':
            db_fields['bucket_or_container_name'] = credentials.get('container')
            db_fields['access_key_id'] = credentials.get('client_id')
            db_fields['region'] = credentials.get('region')
            extra_params['account_name'] = credentials.get('account_name')
            extra_params['tenant_id'] = credentials.get('tenant_id')
            if credentials.get('account_url'):
                extra_params['account_url'] = credentials.get('account_url')
            secret_value = credentials.get('client_secret')
        elif connector_type_lower == 'local':
            db_fields['bucket_or_container_name'] = credentials.get('path') # Using bucket_name for local path
            db_fields['region'] = credentials.get('region')
            db_fields['access_key_id'] = credentials.get('access_key_id')
            if credentials.get('endpoint_url'):
                extra_params['endpoint_url'] = credentials.get('endpoint_url')
            secret_value = credentials.get('secret_key')
        elif connector_type_lower == 'sftp':
            db_fields['access_key_id'] = credentials.get('username')
            db_fields['region'] = credentials.get('region')
            if credentials.get('host'):
                extra_params['host'] = credentials.get('host')
            if credentials.get('port') is not None:
                extra_params['port'] = credentials.get('port')
            db_fields['bucket_or_container_name'] = credentials.get('remote_path', '.')
            secret_value = credentials.get('password')

        # DB schema marks these fields NN; normalize missing values for compatibility.
        db_fields['bucket_or_container_name'] = db_fields.get('bucket_or_container_name') or ''
        db_fields['region'] = db_fields.get('region') or ''
        db_fields['access_key_id'] = db_fields.get('access_key_id') or ''
        extra_params = {k: v for k, v in extra_params.items() if v is not None}

        return db_fields, secret_value, extra_params

    def _map_db_to_config(self, connection: FileConnection) -> Dict[str, Any]:
        """Map DB model back to credentials dictionary."""
        config = {}
        
        ctype = connection.storage_type.lower()
        additional_params = connection.additional_params or {}
        if ctype == 's3':
            config['bucket_or_container_name'] = connection.bucket_or_container_name
            config['region'] = connection.region
            config['access_key_id'] = connection.access_key_id
            config['secret_access_key'] = decrypt_secret(connection.secret_access_key) if connection.secret_access_key else None
            if additional_params.get('endpoint_url'):
                config['endpoint_url'] = additional_params.get('endpoint_url')
        elif ctype == 'azure_blob':
            config['container'] = connection.bucket_or_container_name
            config['client_id'] = connection.access_key_id
            config['client_secret'] = decrypt_secret(connection.secret_access_key) if connection.secret_access_key else None
            config['account_url'] = additional_params.get('account_url')
            config['region'] = connection.region
            config['account_name'] = additional_params.get('account_name')
            config['tenant_id'] = additional_params.get('tenant_id')
        elif ctype == 'local':
            config['path'] = connection.bucket_or_container_name
            config['region'] = connection.region or None
            config['access_key_id'] = connection.access_key_id or None
            config['secret_key'] = decrypt_secret(connection.secret_access_key) if connection.secret_access_key else None
            if additional_params.get('endpoint_url'):
                config['endpoint_url'] = additional_params.get('endpoint_url')
        elif ctype == 'sftp':
            config['username'] = connection.access_key_id
            config['password'] = decrypt_secret(connection.secret_access_key) if connection.secret_access_key else None
            config['remote_path'] = connection.bucket_or_container_name
            config['region'] = connection.region or None
            config['host'] = additional_params.get('host')
            config['port'] = additional_params.get('port', 22)
        
        return config

    def file_connection_to_details(self, connection: FileConnection) -> Dict[str, Any]:
        """
        API-shaped file connection payload: column fields at top level,
        connector-specific extras nested under ``additional_params``.
        """
        return {
            "connection_id": connection.connection_id,
            "connection_name": connection.connection_name,
            "storage_type": connection.storage_type,
            "bucket_or_container_name": connection.bucket_or_container_name,
            "region": connection.region,
            "access_key_id": connection.access_key_id,
            "additional_params": (
                dict(connection.additional_params) if connection.additional_params else None
            ),
        }

    def get_connection_details(self, file_connection_id: str) -> Dict[str, Any]:
        """
        Get stored file connection fields for a connection_id.

        Returns column-backed fields with ``additional_params`` nested (not merged
        into the top level). Use ``_map_db_to_config`` via ``get_connection`` for
        runtime connector configuration.
        """
        session = get_db_session()
        try:
            conn_record = session.query(FileConnection).filter_by(
                connection_id=file_connection_id
            ).first()
            if not conn_record:
                self.log_system(
                    "FILE_CONN_NOT_FOUND",
                    "ERROR",
                    f"Connection ID '{file_connection_id}' not found",
                )
                raise DataCodeValidationError(f"Connection ID '{file_connection_id}' not found")
            return self.file_connection_to_details(conn_record)
        except DataCodeValidationError:
            raise
        except Exception as e:
            self.log_system(
                "FILE_GET_CONN_DETAILS_ERROR",
                "ERROR",
                f"Failed to get connection details for {file_connection_id}: {str(e)}",
            )
            raise DataCodeConnectionError(
                f"Failed to get file connection details for {file_connection_id}: {str(e)}"
            ) from e
        finally:
            session.close()

    def save_file_connection(
        self,
        connection_name: str,
        storage_type: str,
        credentials: Dict[str, Any] = None,
        user_id: str = "system"
    ) -> Tuple[bool, str, Optional[str]]:
        """Save credentials entered for all the file based connectors."""
        
        # Validation
        val_errors = []
        if not connection_name:
            val_errors.append("connection_name is required")
        if not storage_type:
             val_errors.append("storage_type is required")
        if not credentials:
             val_errors.append("credentials must be provided")
             
        if val_errors:
            msg = f"Validation failed: {', '.join(val_errors)}"
            self.log_validation(msg, context={'validation_errors': val_errors})
            self.log_system("FILE_SAVE_VALIDATION_FAIL", "WARNING", msg)
            return False, msg, None

        session = get_db_session()
        try:
            # Check for existing by name
            existing = session.query(FileConnection).filter_by(connection_name=connection_name).first()
            
            db_fields, secret_value, extra_params = self._map_credentials_to_db_fields(
                storage_type, credentials or {}
            )
            
            # DB schema marks secret_access_key NN, so persist as empty string when absent.
            encrypted_secret = encrypt_secret(secret_value) if secret_value else ""
            
            if existing:
                for k, v in db_fields.items():
                    setattr(existing, k, v)
                existing.secret_access_key = encrypted_secret
                merged_params = {**(existing.additional_params or {}), **extra_params}
                existing.additional_params = merged_params or None
                session.commit()
                self.log_system("FILE_CONN_UPDATE", "INFO", f"File connection '{connection_name}' updated successfully")
                self.log_validation(f"File connection '{connection_name}' ({existing.connection_id}) was updated", context={'connection_id': existing.connection_id, 'storage_type': storage_type})
                return True, f"File connection '{connection_name}' updated successfully", existing.connection_id
            else:
                fc_id = self.generate_file_connection_id()
                new_conn = FileConnection(
                    connection_id=fc_id,
                    connection_name=connection_name,
                    **db_fields,
                    secret_access_key=encrypted_secret,
                    additional_params=extra_params or None,
                    user_id=user_id
                )
                session.add(new_conn)
                session.commit()
                self.log_system("FILE_CONN_SAVE", "INFO", f"File connection '{connection_name}' saved successfully")
                self.log_validation(f"File connection '{connection_name}' created with ID {fc_id}", context={'connection_id': fc_id, 'storage_type': storage_type})
                return True, f"File connection '{connection_name}' saved successfully", fc_id
        except Exception as e:
            session.rollback()
            msg = f"Error saving file connection '{connection_name}': {str(e)}"
            self.log_system("FILE_CONN_SAVE_ERROR", "ERROR", msg)
            return False, msg, None
        finally:
            session.close()

    def update_file_connection(self, file_connection_id: str, updates: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Update an existing file connection by connection_id. Symmetric to
        DatabaseConnectionManager.update_connection_details() -- unlike
        save_file_connection()'s implicit update-by-matching-name behavior,
        this updates a specific connection_id directly regardless of name.

        `updates` may contain any of: connection_name, storage_type,
        credentials (a dict, mapped the same way save_file_connection() maps
        it -- bucket/region/access_key_id/secret_key etc. per storage_type).
        """
        if not file_connection_id:
            msg = "Validation failed: file_connection_id is required"
            self.log_validation(msg, context={'validation_errors': ["file_connection_id is required"]})
            self.log_system("FILE_UPDATE_VALIDATION_FAIL", "WARNING", msg)
            return False, msg

        session = get_db_session()
        try:
            existing = session.query(FileConnection).filter_by(connection_id=file_connection_id).first()
            if not existing:
                msg = f"Connection ID '{file_connection_id}' not found."
                self.log_system("FILE_CONN_UPDATE_NOT_FOUND", "ERROR", msg)
                return False, msg

            connection_name = updates.get("connection_name")
            storage_type = updates.get("storage_type")
            credentials = updates.get("credentials")

            if connection_name is not None:
                existing.connection_name = connection_name
            if storage_type is not None:
                existing.storage_type = storage_type.lower()

            if credentials is not None:
                db_fields, secret_value, extra_params = self._map_credentials_to_db_fields(
                    storage_type or existing.storage_type, credentials
                )
                for k, v in db_fields.items():
                    if v is not None:
                        setattr(existing, k, v)
                if secret_value:
                    existing.secret_access_key = encrypt_secret(secret_value)
                if extra_params:
                    merged_params = {**(existing.additional_params or {}), **extra_params}
                    existing.additional_params = merged_params or None

            session.commit()

            name_for_log = connection_name if connection_name is not None else existing.connection_name
            self.log_system("FILE_CONN_UPDATE_BY_ID", "INFO", f"File connection '{name_for_log}' ({file_connection_id}) updated successfully")
            self.log_validation(f"File connection '{name_for_log}' ({file_connection_id}) was updated", context={'connection_id': file_connection_id})
            return True, f"File connection '{name_for_log}' ({file_connection_id}) updated successfully"

        except Exception as e:
            session.rollback()
            msg = f"Error updating file connection {file_connection_id}: {str(e)}"
            self.log_system("FILE_CONN_UPDATE_ERROR", "ERROR", msg)
            return False, msg
        finally:
            session.close()

    def get_connection(self, file_connection_id: str) -> Tuple[bool, str, Optional[Any]]:
        """Connect to the provided connection_id file connection and give connection object."""

        session = get_db_session()
        try:
            conn_record = session.query(FileConnection).filter_by(connection_id=file_connection_id).first()
            if not conn_record:
                self.log_system("FILE_CONN_NOT_FOUND", "ERROR", f"Connection ID '{file_connection_id}' not found")
                return False, f"Connection ID '{file_connection_id}' not found", None
            
            config = self._map_db_to_config(conn_record)
            connector = get_file_connector(conn_record.storage_type, config, self.log_system, self.log_validation)
            return True, "Connection established", connector
        except DataCodeValidationError as e:
            self.log_system("FILE_CONN_GET_VALIDATION_ERROR", "ERROR", str(e))
            return False, str(e), None
        except Exception as e:
            msg = f"Error getting file connection {file_connection_id}: {str(e)}"
            self.log_system("FILE_CONN_GET_ERROR", "ERROR", msg)
            return False, msg, None
        finally:
            session.close()

    def _get_rds_connection_params(self) -> Optional[Dict[str, Any]]:
        rds_host = os.getenv('RDS_HOST')
        rds_port = os.getenv('RDS_PORT')
        rds_username = os.getenv('RDS_USERNAME')
        rds_password = os.getenv('RDS_PASSWORD')
        rds_database = os.getenv('RDS_DATABASE')
        rds_schema = os.getenv('RDS_SCHEMA', 'public')
        rds_engine = os.getenv('RDS_ENGINE', 'postgresql').lower()

        if not all([rds_host, rds_username, rds_password, rds_database]):
            self.log_system("RDS_ENV_ERROR", "ERROR", "Missing required RDS environment configuration")
            return None

        return {
            'host': rds_host,
            'port': self._parse_rds_port(rds_port, rds_engine),
            'username': rds_username,
            'password': rds_password,
            'database': rds_database,
            'schema': rds_schema,
            'engine': rds_engine
        }

    def _parse_rds_port(self, rds_port: Optional[str], rds_engine: str) -> int:
        """Return a valid RDS port or raise a clear configuration error."""
        if not rds_port:
            return 5432 if rds_engine == 'postgresql' else 3306
        try:
            port = int(rds_port)
        except (TypeError, ValueError) as e:
            raise DataCodeConfigurationError(f"RDS_PORT must be an integer, got {rds_port!r}") from e
        if port <= 0:
            raise DataCodeConfigurationError(f"RDS_PORT must be positive, got {rds_port!r}")
        return port

    def _fetch_schema_from_rds(self, config_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch the configured schema for `config_id` from traditional_config_details.

        Returns ``{field: {"dtype": <column_datatype>, "order": <column_order>}}``,
        ordered by ``column_order``. The order is part of the contract, not
        decoration: it fixes the column positions of the table we create, and
        it's what TC003 compares the actual table against.

        Returns None on a fetch failure. Raises RuntimeError when the config
        genuinely has no field rows -- see the raise site for why that isn't
        an empty dict.
        """
        if not config_id:
            self.log_system("SCHEMA_FETCH_CONFIG_ID_MISSING", "ERROR", "config_id is required to fetch schema")
            return None

        params = self._get_rds_connection_params()
        if not params:
            return None

        conn = None
        try:
            conn = psycopg2.connect(
                host=params['host'],
                port=params['port'],
                database=params['database'],
                user=params['username'],
                password=params['password']
            )
            with conn.cursor() as cursor:
                if params.get('schema'):
                    cursor.execute(f'SET search_path TO "{params["schema"]}"')
                cursor.execute(
                    'SELECT field, column_datatype, column_order '
                    'FROM traditional_config_details WHERE config_id = %s '
                    'ORDER BY column_order',
                    (config_id,)
                )
                records = cursor.fetchall()

            if not records:
                # Not an empty dict: a config with no field rows used to produce
                # a job that reported success with no check results, which is
                # indistinguishable from a job that had nothing to check. Fail
                # loud so the operator has to notice the broken config.
                msg = (
                    f"No traditional_config_details rows for config_id {config_id} "
                    "-- check cannot run. Configure at least one field check."
                )
                self.log_system("SCHEMA_NOT_FOUND", "ERROR", msg)
                raise RuntimeError(msg)

            schema_data = {
                row[0]: {"dtype": row[1], "order": row[2]}
                for row in records
            }
            return schema_data
        except RuntimeError:
            # The empty-schema hard failure above must reach the caller, not be
            # swallowed by the generic handler below.
            raise
        except DataCodeConfigurationError as e:
            self.log_system("SCHEMA_FETCH_CONFIG_ERROR", "ERROR", f"Invalid RDS configuration while fetching schema: {str(e)}")
            return None
        except Exception as e:
            self.log_system("SCHEMA_FETCH_ERROR", "ERROR", f"Failed to fetch schema from RDS: {str(e)}")
            return None
        finally:
            if conn:
                try:
                    conn.close()
                except Exception as e:
                    self.log_system("SCHEMA_CONN_CLOSE_WARNING", "WARNING", f"Failed to close schema fetch connection cleanly: {str(e)}")

    def _normalize_schema_file_payload(self, payload: Any, source_name: str) -> Dict[str, Any]:
        """
        Validate an S3 schema-file JSON payload into the internal schema shape.

        Expected: ``{field: {"dtype": ..., "order": ...}}``. The older
        ``{field: dtype}`` form is rejected -- without column_order there's no
        deterministic column layout to create or to compare TC003 against.
        """
        if not isinstance(payload, dict):
            raise DataCodeConfigurationError(
                f"Schema file '{source_name}' must be a JSON object of "
                '{field: {"dtype": ..., "order": ...}}'
            )

        normalized: Dict[str, Any] = {}
        for field, spec in payload.items():
            if not isinstance(spec, dict):
                raise DataCodeConfigurationError(
                    f"Schema file '{source_name}' entry for '{field}' must be an "
                    'object with "dtype" and "order" (got a bare datatype). '
                    "column_order is required for every column."
                )
            if "order" not in spec or spec["order"] is None or str(spec["order"]).strip() == "":
                raise DataCodeConfigurationError(
                    f"Schema file '{source_name}' is missing column_order for column '{field}'."
                )
            dtype = spec.get("dtype") or spec.get("column_datatype")
            if not dtype:
                raise DataCodeConfigurationError(
                    f"Schema file '{source_name}' is missing dtype for column '{field}'."
                )
            try:
                order = int(str(spec["order"]).strip())
            except ValueError:
                raise DataCodeConfigurationError(
                    f"Schema file '{source_name}' has a non-integer column_order "
                    f"{spec['order']!r} for column '{field}'."
                ) from None
            normalized[field] = {"dtype": dtype, "order": order}
        return normalized

    def test_file_connection(self, file_connection_id: str) -> Tuple[bool, str]:
        """Test whether the connection is created successfully."""

        try:
            success, msg, connector = self.get_connection(file_connection_id)
            if not success or not connector:
                return False, f"Failed to get connection: {msg}"
            
            # Call connector test
            return connector.test_connection()
        except Exception as e:
            msg = f"Error testing file connection {file_connection_id}: {str(e)}"
            self.log_system("FILE_CONN_TEST_ERROR", "ERROR", msg)
            return False, msg

    def get_file(self, file_connection_id: str, filename: str, config_id: Optional[str] = None) -> Tuple[bool, str, Optional[bytes], Optional[Dict[str, Any]]]:
        """Return specific file and the respected schema."""

        success, msg, connector = self.get_connection(file_connection_id)
        if not success or not connector:
            return False, f"Failed to get connection: {msg}", None, None, filename
            
        resolved_filename = connector._resolve_pattern_key(filename)
    
        # Fetch data file
        success_file, msg_file, file_content = connector.fetch_file(resolved_filename)
        if not success_file:
            return False, f"Failed to fetch file '{resolved_filename}': {msg_file}", None, None, resolved_filename

        # Fetch schema from application RDS by config_id
        schema_data = None
        if config_id:
            schema_data = self._fetch_schema_from_rds(config_id)
            if schema_data is None:
                return False, f"Failed to fetch schema for config_id '{config_id}'", None, None, resolved_filename
            if not schema_data:
                return False, f"No schema found for config_id '{config_id}'", None, None, resolved_filename
        else:
            # Backup: try fetching schema file from the same storage if config_id was not provided.
            # column_order is mandatory here too -- a schema without it can't
            # produce a deterministic table layout, so a file that omits it is
            # rejected rather than quietly ordered however it happened to parse.
            filename_no_ext = os.path.splitext(resolved_filename)[0]
            schema_filename = f"{filename_no_ext}_schema"
            for ext in ['.json', '.csv', '']:
                s_filename = f"{schema_filename}{ext}"
                s_success, _, s_content = connector.fetch_file(s_filename)
                if s_success and s_content:
                    try:
                        schema_data = self._normalize_schema_file_payload(
                            json.loads(s_content.decode('utf-8')), s_filename
                        )
                        break
                    except json.JSONDecodeError as e:
                        self.log_system("SCHEMA_JSON_PARSE_WARNING", "WARNING", f"Schema file '{s_filename}' is not valid JSON: {str(e)}")
                        if ext == '.csv' or ext == '':
                            try:
                                csv_reader = csv.reader(io.StringIO(s_content.decode('utf-8-sig')))
                                schema_data = {}
                                for row in csv_reader:
                                    if len(row) >= 2:
                                        col_name = row[0].strip()
                                        col_type = row[1].strip()
                                        if col_name.lower().replace('_', '') in ['name', 'column', 'columnname', 'field'] and \
                                           col_type.lower().replace('_', '') in ['type', 'datatype', 'columntype']:
                                            continue
                                        if len(row) < 3 or not str(row[2]).strip():
                                            raise DataCodeConfigurationError(
                                                f"Schema file '{s_filename}' is missing column_order for "
                                                f"column '{col_name}'. Expected 3 columns per row: "
                                                "field, datatype, column_order."
                                            )
                                        try:
                                            col_order = int(str(row[2]).strip())
                                        except ValueError:
                                            raise DataCodeConfigurationError(
                                                f"Schema file '{s_filename}' has a non-integer column_order "
                                                f"{row[2]!r} for column '{col_name}'."
                                            ) from None
                                        schema_data[col_name] = {"dtype": col_type, "order": col_order}
                                break
                            except (UnicodeDecodeError, csv.Error, ValueError) as csv_error:
                                self.log_system("SCHEMA_CSV_PARSE_WARNING", "WARNING", f"Schema file '{s_filename}' could not be parsed as CSV: {str(csv_error)}")
                                continue
                    except UnicodeDecodeError as e:
                        self.log_system("SCHEMA_DECODE_WARNING", "WARNING", f"Schema file '{s_filename}' could not be decoded: {str(e)}")
                        continue

        self.log_system("FILE_AND_SCHEMA_FETCH", "INFO", "File and schema fetched")
        return True, f"File and schema fetched", file_content, schema_data, resolved_filename

    # The config stores the delimiter as a word (the database enum is comma | pipe | tab |
    # semicolon), but the CSV parser needs the character. The word used to be passed through
    # as-is, so a config with any delimiter set failed with '"delimiter" must be a
    # 1-character string' -- it only went unseen because the UI never sends one.
    _DELIMITER_CHARACTERS = {"comma": ",", "pipe": "|", "tab": "	", "semicolon": ";"}

    def _parse_file_bytes(self, file_content: bytes, file_name: str, csv_delimiter: str = None):
        if isinstance(csv_delimiter, str):
            csv_delimiter = self._DELIMITER_CHARACTERS.get(csv_delimiter.strip().lower(), csv_delimiter)

        extension = os.path.splitext(file_name.lower())[1]

        if extension in ['.csv', '.tsv', '']:
            try:
                content = file_content.decode('utf-8-sig')
            except UnicodeDecodeError as e:
                raise DataCodeFileParseError(f"Unable to decode {file_name} as UTF-8 CSV/TSV: {e}") from e
            
            if extension == '.tsv' and csv_delimiter is None:
                csv_delimiter = '\t'

            # Use user-provided delimiter if given
            if csv_delimiter is not None:
                reader = csv.DictReader(io.StringIO(content), delimiter=csv_delimiter)
            else:
                # Auto-detect delimiter from sample
                sample = content[:1024]
                try:
                    dialect = csv.Sniffer().sniff(sample)
                    delimiter = dialect.delimiter
                except csv.Error:
                    delimiter = ','  # fallback
                reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
            
            return [row for row in reader]

        if extension in ['.json']:
            try:
                parsed = json.loads(file_content.decode('utf-8-sig'))
            except UnicodeDecodeError as e:
                raise DataCodeFileParseError(f"Unable to decode JSON file {file_name}: {e}") from e
            except json.JSONDecodeError as e:
                raise DataCodeFileParseError(f"Invalid JSON in {file_name}: {e}") from e
            if isinstance(parsed, dict):
                return [parsed]
            if isinstance(parsed, list):
                return parsed
            raise DataCodeFileParseError('JSON must contain an object or an array of objects')

        if extension in ['.parquet']:
            try:
                df = pd.read_parquet(io.BytesIO(file_content))
            except Exception as e:
                raise DataCodeFileParseError(f'Unable to parse parquet file {file_name}: {e}') from e
            return df.to_dict(orient='records')

        if extension in ['.xls', '.xlsx']:
            try:
                excel_data = pd.read_excel(io.BytesIO(file_content), sheet_name=None)
            except Exception as e:
                raise DataCodeFileParseError(f'Unable to parse excel file {file_name}: {e}') from e
            if len(excel_data) != 1:
                raise DataCodeFileParseError('Excel file must contain exactly one sheet for ingestion')
            df = next(iter(excel_data.values()))
            return df.to_dict(orient='records')

        raise DataCodeFileParseError(f'Unsupported file format for {file_name}: {extension}')





    def close_file_connection(self, connector: Any) -> Tuple[bool, str]:
        """Close the connection."""
        try:
            if hasattr(connector, 'close'):
                connector.close()
            return True, "Connection closed"
        except Exception as e:
            self.log_system("FILE_CONN_CLOSE_ERROR", "ERROR", f"Error closing connection: {str(e)}")
            return False, f"Error closing connection: {str(e)}"

    def delete_file_connection(self, file_connection_id: str) -> Tuple[bool, str]:
        """Delete the file connection from the template table using template id."""
        
        session = get_db_session()
        try:
            conn_record = session.query(FileConnection).filter_by(connection_id=file_connection_id).first()
            if not conn_record:
                self.log_system("FILE_DEL_NOT_FOUND", "WARNING", f"Connection ID '{file_connection_id}' not found")
                return False, f"Connection ID '{file_connection_id}' not found"
            
            session.delete(conn_record)
            session.commit()
            self.log_system("FILE_DEL_SUCCESS", "INFO", f"Connection '{file_connection_id}' deleted successfully")
            self.log_validation(f"File connection {file_connection_id} was deleted", context={'connection_id': file_connection_id})
            return True, f"Connection '{file_connection_id}' deleted successfully"
        except Exception as e:
            session.rollback()
            msg = f"Error deleting file connection {file_connection_id}: {str(e)}"
            self.log_system("FILE_DEL_ERROR", "ERROR", msg)
            return False, msg
        finally:
            session.close()

    def _try_parse_date(self, value: str) -> Any:
        """Try to parse a date string into a datetime object."""
        if not value or not isinstance(value, str):
            return value
        
        # Common formats
        formats = [
            '%Y-%m-%d', '%d-%m-%Y', '%m/%d/%Y', '%Y/%m/%d',
            '%Y-%m-%d %H:%M:%S', '%d-%b-%Y', '%Y-%b-%d'
        ]
        
        for fmt in formats:
            try:
                return datetime.datetime.strptime(value, fmt)
            except ValueError:
                continue
        
        return value

    def _get_or_create_db_connection(self, rds_config: Dict[str, Any]) -> str:
        """
        Return the identifier for the product database in its staging role.

        Nothing is looked up and nothing is created. This used to encrypt the
        product DB password and save it as an ``Ingest_Dest_<db>_<timestamp>``
        row in ``database_connection`` -- storing the credentials that grant
        access to a database inside that same database, once per file-based
        job. Those rows were the phantoms.

        The sentinel is resolved from the RDS_* env vars in memory, by
        ``DatabaseConnectionManager.get_connection_details``, for the life of
        one job. ``rds_config`` is accepted for signature compatibility with
        the callers and is intentionally unused.
        """
        return INTERNAL_DB_SENTINEL

    def _finalize_ingestion_details(self, rds_config: Dict[str, Any], schema_data: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Get connection details and schema after ingestion.
        Returns (connection_id, schema_data).
        """
        conn_id = self._get_or_create_db_connection(rds_config)
        return conn_id, schema_data

    def ingest_file_data_to_db(
        self,
        file_connection_id: str,
        file_name: str,
        config_id: Optional[str] = None,
        csv_delimiter: Optional[str] = None,
    ) -> Optional[str]:
        """
        Ingest file data from a file connection into the product database's
        staging table.

        Returns ``INTERNAL_DB_SENTINEL`` on success (the staging host is the
        product database, referred to by sentinel rather than by a stored
        connection row), or None on failure.

        ``csv_delimiter`` comes from the FBC config's ``source_file_delimiter``.
        Passed through to the parser -- previously the field was stored but
        never reached the parser, so every file was parsed as comma-separated
        regardless of what the config said.
        """

        # Step 1: Get file and schema
        success, msg, file_content, schema_data, file_name = self.get_file(file_connection_id, file_name, config_id)
        if not success or not file_content:
            return None
        if not schema_data:
            return None

        # Column positions are fixed by the configured column_order, not by
        # dict insertion order, for both the DDL and the insert below.
        ordered_columns = sorted(schema_data.items(), key=lambda kv: kv[1]["order"])

        # Step 2: Parse file data and support multiple formats
        try:
            data_rows = self._parse_file_bytes(file_content, file_name, csv_delimiter=csv_delimiter)
        except DataCodeFileParseError as e:
            self.log_system("FILE_PARSE_ERROR", "ERROR", f"Failed to parse file '{file_name}': {str(e)}")
            return None
        except Exception as e:
            self.log_system("FILE_PARSE_UNEXPECTED_ERROR", "ERROR", f"Unexpected error while parsing file '{file_name}': {str(e)}")
            return None

        if not data_rows:
            return None
        

        # Step 3: Connect to RDS from .env
        rds_host = os.getenv('RDS_HOST')
        rds_port = os.getenv('RDS_PORT')
        rds_username = os.getenv('RDS_USERNAME')
        rds_password = os.getenv('RDS_PASSWORD')
        rds_database = os.getenv('RDS_DATABASE')
        rds_schema = os.getenv('RDS_SCHEMA', 'public')
        rds_engine = os.getenv('RDS_ENGINE', 'postgresql').lower()

        if not all([rds_host, rds_username, rds_password, rds_database]):
            return None

        try:
            rds_config = {
                'host': rds_host,
                'port': self._parse_rds_port(rds_port, rds_engine),
                'username': rds_username,
                'password': rds_password,
                'database': rds_database,
                'schema': rds_schema,
                'engine': rds_engine
            }
        except DataCodeConfigurationError as e:
            self.log_system("INGEST_RDS_CONFIG_ERROR", "ERROR", str(e))
            return None

        # Step 3.5: Get Connection ID early
        conn_id = self._get_or_create_db_connection(rds_config)
        if not conn_id or conn_id == "UNKNOWN_ID":
            self.log_system("INGEST_ERROR", "ERROR", "Could not determine DB connection ID before table creation.")
            return None

        # Step 4: Create table name ({connection_id}_{file_name})
        sanitized_base_name = sanitize_file_name_for_table(file_name)
        table_name = f"{conn_id}_{sanitized_base_name}"
        
        # Step 5: Build and execute CREATE TABLE
        rds_connector = None
        rds_conn = None
        cursor = None
        try:
            rds_connector = get_connector('rds', rds_config, self.log_system, self.log_validation)
            # Assuming rds_connector.get_connection is updated to accept logs
            rds_conn = rds_connector.get_connection()
            cursor = rds_conn.cursor()

            # Build columns, in configured column_order
            columns = []
            for col_name, col_spec in ordered_columns:
                col_type = col_spec["dtype"]
                sql_type = col_type.upper()
                if sql_type in ['STRING', 'TEXT', 'VARCHAR']:
                    sql_type = 'TEXT'
                elif sql_type in ['INTEGER', 'INT']:
                    sql_type = 'INTEGER'
                elif sql_type in ['FLOAT', 'DOUBLE']:
                    sql_type = 'DOUBLE PRECISION' if rds_engine == 'postgresql' else 'DOUBLE'
                elif sql_type in ['DECIMAL', 'NUMERIC']:
                    sql_type = 'NUMERIC' if rds_engine == 'postgresql' else 'DECIMAL'
                elif sql_type == 'BOOLEAN':
                    sql_type = 'BOOLEAN'
                elif sql_type == 'DATE':
                    sql_type = 'DATE'
                elif sql_type == 'TIMESTAMP':
                    sql_type = 'TIMESTAMP'
                else:
                    sql_type = col_type.upper()
                
                safe_col_name = col_name.replace('-', '_').replace(' ', '_')
                safe_col_name = ''.join(c for c in safe_col_name if c.isalnum() or c == '_')
                
                if rds_engine == 'postgresql':
                    columns.append(f'"{safe_col_name}" {sql_type}')
                else:
                    columns.append(f'`{safe_col_name}` {sql_type}')

            # Drop and Create
            if rds_engine == 'postgresql':
                cursor.execute(f'DROP TABLE IF EXISTS "{rds_schema}"."{table_name}" CASCADE')
                cursor.execute(f'CREATE TABLE "{rds_schema}"."{table_name}" ({", ".join(columns)})')
            else:
                cursor.execute(f'DROP TABLE IF EXISTS `{rds_database}`.`{table_name}`')
                cursor.execute(f'CREATE TABLE `{rds_database}`.`{table_name}` ({", ".join(columns)})')
            
            # --- Create Schema Table ---
            schema_table_name = f"{table_name}_schema"
            schema_columns_def = []
            
            if rds_engine == 'postgresql':
                 schema_columns_def = ['"column_name" TEXT', '"data_type" TEXT', '"column_order" INTEGER']
                 cursor.execute(f'DROP TABLE IF EXISTS "{rds_schema}"."{schema_table_name}" CASCADE')
                 cursor.execute(f'CREATE TABLE "{rds_schema}"."{schema_table_name}" ({", ".join(schema_columns_def)})')
            else:
                 schema_columns_def = ['`column_name` TEXT', '`data_type` TEXT', '`column_order` INTEGER']
                 cursor.execute(f'DROP TABLE IF EXISTS `{rds_database}`.`{schema_table_name}`')
                 cursor.execute(f'CREATE TABLE `{rds_database}`.`{schema_table_name}` ({", ".join(schema_columns_def)})')

            # Insert schema definition
            for col_n, col_spec in ordered_columns:
                if rds_engine == 'postgresql':
                     cursor.execute(f'INSERT INTO "{rds_schema}"."{schema_table_name}" ("column_name", "data_type", "column_order") VALUES (%s, %s, %s)', (col_n, col_spec["dtype"], col_spec["order"]))
                else:
                     cursor.execute(f'INSERT INTO `{rds_database}`.`{schema_table_name}` (`column_name`, `data_type`, `column_order`) VALUES (%s, %s, %s)', (col_n, col_spec["dtype"], col_spec["order"]))
            # ---------------------------

            # Step 6: Insert data
            col_names = [col_name for col_name, _ in ordered_columns]
            safe_col_names = [col.replace('-', '_').replace(' ', '_') for col in col_names]
            safe_col_names = [''.join(c for c in col if c.isalnum() or c == '_') for col in safe_col_names]

            if rds_engine == 'postgresql':
                col_list = ', '.join([f'"{col}"' for col in safe_col_names])
                insert_query = f'INSERT INTO "{rds_schema}"."{table_name}" ({col_list}) VALUES %s'
            else:
                placeholders = ', '.join(['%s'] * len(safe_col_names))
                col_list = ', '.join([f'`{col}`' for col in safe_col_names])
                insert_query = f'INSERT INTO `{rds_database}`.`{table_name}` ({col_list}) VALUES ({placeholders})'

            rows_to_insert = []
            for row in data_rows:
                values = []
                for col_name in col_names:
                    val = row.get(col_name)
                    col_type = (schema_data.get(col_name, {}).get("dtype") or '').upper()
                    if val is None or val == '':
                        values.append(None)
                    elif isinstance(val, str) and val.strip().lower() == 'null':
                        values.append(None)
                    elif col_type in ['DATE', 'TIMESTAMP', 'DATETIME']:
                        # Parse the date using the existing helper method
                        # psycopg2 will serialize real datetime objects into PostgreSQL's standard format
                        values.append(self._try_parse_date(val))
                    else:
                        # Append raw value to preserve trailing zeros and exact date formattings
                        values.append(val)
                rows_to_insert.append(tuple(values))

            # Batched insert. Per-row execute meant one network round-trip per
            # source row, so a million-row file meant a million round-trips.
            if rds_engine == 'postgresql':
                execute_values(cursor, insert_query, rows_to_insert, page_size=_INSERT_BATCH_SIZE)
            else:
                for start in range(0, len(rows_to_insert), _INSERT_BATCH_SIZE):
                    cursor.executemany(insert_query, rows_to_insert[start:start + _INSERT_BATCH_SIZE])

            rds_conn.commit()
            cursor.close()
            cursor = None
            rds_connector.close_connection(rds_conn)
            rds_conn = None

            self.log_system("INGEST_SUCCESS", "INFO", f"File uploaded and table created: {table_name}")
            # print(f"Table name where it is stored: {table_name}")
            return conn_id

        except Exception as e:
            if rds_conn and hasattr(rds_conn, 'rollback'):
                try:
                    rds_conn.rollback()
                except Exception as rollback_error:
                    self.log_system("INGEST_ROLLBACK_WARNING", "WARNING", f"Rollback failed for {table_name}: {str(rollback_error)}")
            self.log_system("INGEST_ERROR", "ERROR", f"Error during ingestion for table {table_name}: {str(e)}")
            return None
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception as close_error:
                    self.log_system("INGEST_CURSOR_CLOSE_WARNING", "WARNING", f"Failed to close cursor for {table_name}: {str(close_error)}")
            if rds_conn:
                try:
                    if rds_connector:
                        rds_connector.close_connection(rds_conn)
                    else:
                        rds_conn.close()
                except Exception as close_error:
                    self.log_system("INGEST_CONN_CLOSE_WARNING", "WARNING", f"Failed to close RDS connection for {table_name}: {str(close_error)}")

    def delete_table(self, cursor: Any, table_name: str, schema: Optional[str] = None) -> str:
        """
        Delete a table from the database using the provided cursor.
        """
        
        try:
            # Use provided schema or default from environment
            target_schema = schema or os.getenv('RDS_SCHEMA', 'public')
            
            # Standardize based on typical usage (Postgres)
            query = f'DROP TABLE IF EXISTS "{target_schema}"."{table_name}" CASCADE'
            try:
                cursor.execute(query)
            except Exception as primary_error:
                # Fallback for systems that don't support CASCADE or schema-prefix
                self.log_system("TABLE_DEL_PRIMARY_QUERY_WARNING", "WARNING", f"Primary table delete query failed for {table_name}: {str(primary_error)}")
                cursor.execute(f'DROP TABLE IF EXISTS {table_name}')
            
            self.log_system("TABLE_DEL_SUCCESS", "INFO", f"Table {table_name} deleted successfully")
            return "table has been deleted successfully."
        except Exception as e:
            self.log_system("TABLE_DEL_ERROR", "ERROR", f"Error deleting table: {str(e)}")
            return f"Error deleting table: {str(e)}"
