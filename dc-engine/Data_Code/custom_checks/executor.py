from typing import Optional, List, Dict, Any, Callable

# Internal imports
from . import functions

class CustomCheckManager:
    """
    Manager class for Custom SQL Checks.
    Coordinates template management and execution.
    """
    
    @staticmethod
    def generate_id(log_system_func: Callable) -> str:
        """Generates a unique custom check ID (CBXXX)."""
        return functions.generate_custom_check_id(log_system_func)
    
    @staticmethod
    def save_check(
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
        """Saves a new custom check template."""
        return functions.save_custom_check(
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
    
    @staticmethod
    def get_check(check_id: str, log_system_func: Callable) -> Optional[Dict[str, Any]]:
        """Fetches a custom check template by ID."""
        return functions.get_custom_check(check_id, log_system_func)
    
    @staticmethod
    def delete_check(check_id: str, log_system_func: Callable) -> bool:
        """Deletes a custom check template."""
        return functions.delete_custom_check(check_id, log_system_func)
    
    @staticmethod
    def list_checks(log_system_func: Callable) -> List[Dict[str, Any]]:
        """Lists all custom check templates."""
        return functions.list_custom_checks(log_system_func)
        
    @staticmethod
    def validate_check(connection_id: str, sql_query: str, log_system_func: Callable, log_validation_func: Callable) -> Dict[str, Any]:
        """Validates an ad-hoc query by running it with LIMIT 1."""
        return functions.validate_custom_check_query(connection_id, sql_query, log_system_func, log_validation_func)

    @staticmethod
    def return_control_to_airflow(log_system_func: Callable, reason: str = "Unspecified"):
        """
        Stops execution and returns control to the workflow orchestrator.
        """
        log_system_func("RETURN_TO_AIRFLOW", "ERROR", f"Stopping execution and returning control to Airflow. Reason: {reason}")
        raise RuntimeError(f"Workflow stopped: {reason}")

    @staticmethod
    def execute_from_json(json_input: Any, log_system_func: Callable, log_validation_func: Callable, **kwargs) -> Dict[str, Any]:
        """
        Main entry point for running custom checks from a JSON input.
        Flow: JSON -> Parse -> Execution DF -> Iterator -> Execute -> Log -> Store
        Returns: Dict containing 'results' list, 'overall_criticality'.
        """
        
        log_system_func("WORKFLOW_START", "INFO", "Starting custom check execution workflow...")
        
        try:
            # 1. Validate and parse JSON
            json_valid, parsed_items = functions.validate_and_parse_json(json_input, log_system_func, log_validation_func)
            
            if not json_valid:
                CustomCheckManager.return_control_to_airflow(log_system_func, "JSON Validation Failed")

            # 2. Create custom_check_execution_df
            execution_df = functions.create_custom_check_execution_df(parsed_items, log_system_func, log_validation_func)
            
            # 3. Run execution iterator (performs SQL execution, logging, and insertion)
            results = functions.run_custom_checks_from_execution_df(execution_df, log_system_func, log_validation_func, **kwargs)
            
            # 4. Calculate Overall Criticality
            overall_criticality = functions.calculate_overall_criticality(results, log_system_func, log_validation_func)

            persisted_job_id = functions.save_results_to_rds(results, log_system_func, log_validation_func, **kwargs)

            log_system_func("WORKFLOW_COMPLETE", "INFO", f"Custom check execution workflow completed. Overall Criticality: {overall_criticality}", context={'overall_criticality': overall_criticality})
            
            return {
                "results": results,
                "overall_criticality": overall_criticality,
                "job_id": persisted_job_id,
            }
            
        except Exception as e:
            log_system_func("WORKFLOW_CRITICAL_FAILURE", "CRITICAL", f"Workflow failed: {str(e)}")
            return {
                "results": [],
                "overall_criticality": "critical",
                "error": str(e)
            }
