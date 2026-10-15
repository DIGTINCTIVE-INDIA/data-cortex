"""
CRUD functions for db_based_checks_config, mirroring the style of
Data_Code/custom_checks/functions.py. Previously this table had no
application-level API at all -- only the ORM model (DbBasedCheckConfig in
Data_Code/common/database.py) existed, and every insert/update/delete in this
codebase's own test helpers went through raw SQL directly.
"""
from typing import Any, Callable, Dict, List, Optional

from Data_Code.common.database import DbBasedCheckConfig, get_db_session, resolve_label_id
from Data_Code.common.id_generation import (
    DB_BASED_CHECKS_CONFIG_ID_SEQ,
    next_sequential_id,
)
from Data_Code.common.exceptions import DataCodePersistenceError, DataCodeValidationError

_REQUIRED_FIELDS = (
    "config_name",
    "workstream",
    "check_category",
    "data_source",
    "impacted_downstream",
    "source_connection_id",
    "source_table_name",
    "target_connection_id",
    "target_table_prefix",
)


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _validate_save_payload(payload: Dict[str, Any], log_validation_func: Callable) -> None:
    errors = [f"{field} is required" for field in _REQUIRED_FIELDS if _is_blank(payload.get(field))]
    if errors:
        msg = "db_based_checks_config validation failed: " + "; ".join(errors)
        log_validation_func(msg, context={"validation_errors": errors})
        raise DataCodeValidationError(msg)


def generate_db_based_config_id(log_system_func: Callable) -> str:
    """Creates an id like 'DBCXXX' (e.g., DBC001)."""
    session = get_db_session()
    try:
        existing_ids = [cid for (cid,) in session.query(DbBasedCheckConfig.config_id).all()]
        new_id = next_sequential_id(
            session, sequence_name=DB_BASED_CHECKS_CONFIG_ID_SEQ, prefix="DBC", existing_ids=existing_ids
        )
        log_system_func("ID_GEN_SUCCESS", "INFO", f"Generated new db-based config ID: {new_id}", context={"new_id": new_id})
        return new_id
    except Exception as e:
        log_system_func("ID_GEN_ERROR", "ERROR", f"Failed to generate db-based config ID: {str(e)}")
        raise DataCodePersistenceError(f"Failed to generate db-based config ID: {str(e)}") from e
    finally:
        session.close()


def save_db_based_config(
    config_name: str,
    log_system_func: Callable,
    log_validation_func: Callable,
    workstream: Optional[str] = None,
    check_category: Optional[str] = None,
    data_source: Optional[str] = None,
    impacted_downstream: Optional[str] = None,
    source_connection_id: Optional[str] = None,
    source_table_name: Optional[str] = None,
    target_connection_id: Optional[str] = None,
    target_table_prefix: Optional[str] = None,
    landing_table: bool = True,
    landing_table_name: Optional[str] = None,
    schema_table_name: Optional[str] = None,
    config_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> str:
    """Creates a new db_based_checks_config row. Always INSERTs -- use update_db_based_config() to modify an existing row."""
    resolved_user_id = user_id or "SYSTEM"

    _validate_save_payload(
        {
            "config_name": config_name,
            "workstream": workstream,
            "check_category": check_category,
            "data_source": data_source,
            "impacted_downstream": impacted_downstream,
            "source_connection_id": source_connection_id,
            "source_table_name": source_table_name,
            "target_connection_id": target_connection_id,
            "target_table_prefix": target_table_prefix,
        },
        log_validation_func,
    )

    session = get_db_session()
    try:
        new_id = config_id if config_id else next_sequential_id(
            session,
            sequence_name=DB_BASED_CHECKS_CONFIG_ID_SEQ,
            prefix="DBC",
            existing_ids=[cid for (cid,) in session.query(DbBasedCheckConfig.config_id).all()],
        )

        workstream_id = resolve_label_id(session, "workstream_library", "workstream_id", "workstream_name", workstream)
        check_category_id = resolve_label_id(session, "category_label_library", "category_id", "category_name", check_category)
        data_source_id = resolve_label_id(session, "data_source_library", "data_source_id", "data_source_name", data_source)
        # impacted_downstream is a lookup library like the other three; it was
        # left as raw text while they were normalized. NULL when not supplied.
        impacted_downstream_id = resolve_label_id(
            session, "impacted_downstream_library",
            "impacted_downstream_id", "impacted_downstream_name", impacted_downstream
        )

        new_config = DbBasedCheckConfig(
            config_id=new_id,
            config_name=config_name,
            check_category=check_category_id,
            workstream=workstream_id,
            impacted_downstream=impacted_downstream_id,
            data_source=data_source_id,
            source_connection_id=source_connection_id,
            source_table_name=source_table_name,
            target_connection_id=target_connection_id,
            target_table_prefix=target_table_prefix,
            landing_table=landing_table,
            landing_table_name=landing_table_name,
            schema_table_name=schema_table_name,
            user_id=resolved_user_id,
        )
        session.add(new_config)
        session.commit()

        log_system_func("DBC_SAVE_SUCCESS", "INFO", f"db_based_checks_config '{config_name}' saved successfully", context={"config_id": new_id})
        log_validation_func(f"db-based check config '{config_name}' created with ID {new_id}", context={"config_id": new_id})
        return new_id
    except DataCodeValidationError:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        log_system_func("DBC_SAVE_ERROR", "ERROR", f"Failed to save db_based_checks_config: {str(e)}")
        raise DataCodePersistenceError(f"Failed to save db-based check config '{config_name}': {e}") from e
    finally:
        session.close()


def get_db_based_config(config_id: str, log_system_func: Callable) -> Optional[Dict[str, Any]]:
    """Fetches a db_based_checks_config row by config_id."""
    session = get_db_session()
    try:
        config = session.query(DbBasedCheckConfig).filter_by(config_id=config_id).first()
        if not config:
            log_system_func("DBC_NOT_FOUND", "WARNING", f"db_based_checks_config {config_id} not found", context={"config_id": config_id})
            return None
        log_system_func("DBC_FETCH_SUCCESS", "INFO", f"db_based_checks_config {config_id} retrieved", context={"config_id": config_id})
        return {c.name: getattr(config, c.name) for c in DbBasedCheckConfig.__table__.columns}
    except Exception as e:
        log_system_func("DBC_FETCH_ERROR", "ERROR", f"Error fetching db_based_checks_config {config_id}: {str(e)}")
        raise DataCodePersistenceError(f"Error fetching db-based check config {config_id}: {str(e)}") from e
    finally:
        session.close()


def list_db_based_configs(log_system_func: Callable) -> List[Dict[str, Any]]:
    """Returns all db_based_checks_config rows."""
    session = get_db_session()
    try:
        configs = session.query(DbBasedCheckConfig).all()
        log_system_func("DBC_LIST_SUCCESS", "INFO", f"Listed {len(configs)} db-based check configs", context={"count": len(configs)})
        return [{c.name: getattr(cfg, c.name) for c in DbBasedCheckConfig.__table__.columns} for cfg in configs]
    except Exception as e:
        log_system_func("DBC_LIST_ERROR", "ERROR", f"Failed to list db_based_checks_config: {str(e)}")
        raise DataCodePersistenceError(f"Failed to list db-based check configs: {str(e)}") from e
    finally:
        session.close()


def update_db_based_config(
    config_id: str,
    log_system_func: Callable,
    log_validation_func: Callable,
    config_name: Optional[str] = None,
    workstream: Optional[str] = None,
    check_category: Optional[str] = None,
    data_source: Optional[str] = None,
    impacted_downstream: Optional[str] = None,
    source_connection_id: Optional[str] = None,
    source_table_name: Optional[str] = None,
    target_connection_id: Optional[str] = None,
    target_table_prefix: Optional[str] = None,
    landing_table: Optional[bool] = None,
    landing_table_name: Optional[str] = None,
    schema_table_name: Optional[str] = None,
) -> bool:
    """Updates an existing db_based_checks_config row in place, by config_id."""
    session = get_db_session()
    try:
        config = session.query(DbBasedCheckConfig).filter_by(config_id=config_id).first()
        if not config:
            log_system_func("DBC_UPDATE_NOT_FOUND", "WARNING", f"Cannot update: db_based_checks_config {config_id} not found", context={"config_id": config_id})
            return False

        if config_name is not None:
            config.config_name = config_name
        if workstream is not None:
            config.workstream = resolve_label_id(session, "workstream_library", "workstream_id", "workstream_name", workstream)
        if check_category is not None:
            config.check_category = resolve_label_id(session, "category_label_library", "category_id", "category_name", check_category)
        if data_source is not None:
            config.data_source = resolve_label_id(session, "data_source_library", "data_source_id", "data_source_name", data_source)
        if impacted_downstream is not None:
            config.impacted_downstream = resolve_label_id(
                session, "impacted_downstream_library",
                "impacted_downstream_id", "impacted_downstream_name", impacted_downstream
            )
        if source_connection_id is not None:
            config.source_connection_id = source_connection_id
        if source_table_name is not None:
            config.source_table_name = source_table_name
        if target_connection_id is not None:
            config.target_connection_id = target_connection_id
        if target_table_prefix is not None:
            config.target_table_prefix = target_table_prefix
        if landing_table is not None:
            config.landing_table = landing_table
        if landing_table_name is not None:
            config.landing_table_name = landing_table_name
        if schema_table_name is not None:
            config.schema_table_name = schema_table_name

        session.commit()
        log_system_func("DBC_UPDATE_SUCCESS", "INFO", f"db_based_checks_config {config_id} updated successfully", context={"config_id": config_id})
        log_validation_func(f"db-based check config {config_id} was updated", context={"config_id": config_id})
        return True
    except Exception as e:
        session.rollback()
        log_system_func("DBC_UPDATE_ERROR", "ERROR", f"Failed to update db_based_checks_config {config_id}: {str(e)}")
        raise DataCodePersistenceError(f"Failed to update db-based check config {config_id}: {e}") from e
    finally:
        session.close()


def delete_db_based_config(config_id: str, log_system_func: Callable, log_validation_func: Callable = None) -> bool:
    """Deletes a db_based_checks_config row (hard delete -- no soft-delete column is used by any consumer today)."""
    session = get_db_session()
    try:
        config = session.query(DbBasedCheckConfig).filter_by(config_id=config_id).first()
        if not config:
            log_system_func("DBC_DEL_NOT_FOUND", "WARNING", f"Cannot delete: db_based_checks_config {config_id} not found", context={"config_id": config_id})
            return False

        session.delete(config)
        session.commit()
        log_system_func("DBC_DEL_SUCCESS", "INFO", f"db_based_checks_config {config_id} deleted successfully", context={"config_id": config_id})
        if log_validation_func:
            log_validation_func(f"db-based check config {config_id} was deleted", context={"config_id": config_id})
        return True
    except Exception as e:
        session.rollback()
        log_system_func("DBC_DEL_ERROR", "ERROR", f"Failed to delete db_based_checks_config {config_id}: {str(e)}")
        raise DataCodePersistenceError(f"Failed to delete db-based check config {config_id}: {e}") from e
    finally:
        session.close()
