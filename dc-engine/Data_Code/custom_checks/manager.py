from typing import Optional, List, Dict, Any, Callable

# Internal imports
from .executor import CustomCheckManager

# -----------------------------------------------------------------------------
# Functional API (Exposed for backward compatibility and ease of use)
# -----------------------------------------------------------------------------

def save_custom_check(
    check_name: str,
    sql_query: str,
    log_system_func: Callable,
    log_validation_func: Callable,
    check_description: Optional[str] = None,
    workstream: Optional[str] = None,
    check_category: Optional[str] = None,
    data_source: Optional[str] = None,
    impacted_downstream: Optional[str] = None,
    source_connection_id: Optional[str] = None,
    target_connection_id: Optional[str] = None,
    target_table_prefix: Optional[str] = None,
    criticality: Optional[str] = None,
    error_message: Optional[str] = None,
    check_id: Optional[str] = None,
    table_name: Optional[str] = None,
    source_or_process: Optional[str] = None,
    connection_id: Optional[str] = None,
) -> str:
    return CustomCheckManager.save_check(
        check_name=check_name,
        sql_query=sql_query,
        log_system_func=log_system_func,
        log_validation_func=log_validation_func,
        check_description=check_description,
        workstream=workstream,
        check_category=check_category,
        data_source=data_source,
        impacted_downstream=impacted_downstream,
        source_connection_id=source_connection_id,
        target_connection_id=target_connection_id,
        target_table_prefix=target_table_prefix,
        criticality=criticality,
        error_message=error_message,
        check_id=check_id,
        table_name=table_name,
        source_or_process=source_or_process,
        connection_id=connection_id,
    )

def get_custom_check(check_id: str, log_system_func: Callable) -> Optional[Dict[str, Any]]:
    return CustomCheckManager.get_check(check_id, log_system_func)

def delete_custom_check(check_id: str, log_system_func: Callable) -> bool:
    return CustomCheckManager.delete_check(check_id, log_system_func)

def list_custom_checks(log_system_func: Callable) -> List[Dict[str, Any]]:
    return CustomCheckManager.list_checks(log_system_func)

def validate_check_query(connection_id: str, sql_query: str, log_system_func: Callable, log_validation_func: Callable) -> Dict[str, Any]:
    """
    Validates an ad-hoc SQL query by running it with LIMIT 1.
    Returns result_dict.
    """
    return CustomCheckManager.validate_check(connection_id, sql_query, log_system_func, log_validation_func)

def run_custom_checks_json(json_input: Any, log_system_func: Callable, log_validation_func: Callable) -> Dict[str, Any]:
    """
    Runs checks from a JSON input.
    Returns: {'results': [...], 'overall_criticality': ...}
    """
    return CustomCheckManager.execute_from_json(json_input, log_system_func, log_validation_func)

def validate_custom_check(check_id: str, database_connection_id: str, log_system_func: Callable, log_validation_func: Callable) -> Dict[str, Any]:
    """
    Maintains compatibility with previous validation logic.
    Returns the results of a single check run packaged as execution result dict.
    """
    items = [{'check_id': check_id, 'connection_id': database_connection_id}]
    # Note: Returning results summary as per new execution flow
    return CustomCheckManager.execute_from_json(items, log_system_func, log_validation_func)

def run_custom_check(check_id: str, database_connection_id: str, log_system_func: Callable, log_validation_func: Callable, file_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Maintains compatibility with previous run logic.
    """
    items = [{'check_id': check_id, 'connection_id': database_connection_id}]
    return CustomCheckManager.execute_from_json(items, log_system_func, log_validation_func)

def generate_custom_check_id(log_system_func: Callable) -> str:
    return CustomCheckManager.generate_id(log_system_func)
