from typing import Callable, Any, Dict, List, Optional
from .executor import CustomCheckManager

class CustomEngine:
    """
    Engine wrapper for the Custom Checks module.
    Encapsulates all custom checks functionality. Instances of this class
    require log_system and log_validation functions upon initialization.
    """
    
    def __init__(self, log_system_func: Callable, log_validation_func: Callable):
        self.log_system_func = log_system_func
        self.log_validation_func = log_validation_func

    def execute_from_json(self, json_input: Any, **kwargs) -> Dict[str, Any]:
        """Runs the complete custom check workflow from a JSON input."""
        return CustomCheckManager.execute_from_json(
            json_input, 
            self.log_system_func, 
            self.log_validation_func, 
            **kwargs
        )

    def validate_check_query(self, connection_id: str, sql_query: str) -> Dict[str, Any]:
        """Validates an ad-hoc SQL query by running it with LIMIT 1."""
        return CustomCheckManager.validate_check(
            connection_id,
            sql_query,
            self.log_system_func, 
            self.log_validation_func
        )

    def save_check(self, check_name: str, sql_query: str, **kwargs) -> str:
        """Saves a new custom check template."""
        return CustomCheckManager.save_check(
            check_name=check_name,
            sql_query=sql_query,
            log_system_func=self.log_system_func,
            log_validation_func=self.log_validation_func,
            **kwargs
        )

    def delete_check(self, check_id: str) -> bool:
        """Deletes a custom check template."""
        return CustomCheckManager.delete_check(check_id, self.log_system_func)

    def get_check(self, check_id: str) -> Optional[Dict[str, Any]]:
        """Fetches a custom check template by ID."""
        return CustomCheckManager.get_check(check_id, self.log_system_func)
        
    def list_checks(self) -> List[Dict[str, Any]]:
        """Lists all custom check templates."""
        return CustomCheckManager.list_checks(self.log_system_func)

    def generate_id(self) -> str:
        """Generates a unique custom check ID (CBXXX)."""
        return CustomCheckManager.generate_id(self.log_system_func)
