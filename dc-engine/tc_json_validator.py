import pandas as pd
import json

from trad_ct_id.config import SCHEMA_CHECKS

class TcJSONConfigValidator:
    """
    A class to validate and process configuration JSON through multiple validation stages.
    
    This class encapsulates all validation functions and manages the validation pipeline,
    ensuring proper error handling and conditional execution at each stage.
    """
    
    def __init__(self, config_json, traditional_config_details_df, traditional_checks_library_df, log_system_func, log_validation_func):
        """
        Initialize the ConfigValidator with required data and logging functions.
        
        Args:
            config_json: The configuration JSON to validate (string or dict/list)
            traditional_config_details_df: DataFrame with config details
            traditional_checks_library_df: DataFrame with check library
            log_system_func: Function to log system messages
            log_validation_func: Function to log validation messages
        """
        self.config_json = config_json
        self.traditional_config_details_df = traditional_config_details_df
        self.traditional_checks_library_df = traditional_checks_library_df

        # Store logging functions
        self.log_system = log_system_func
        self.log_validation = log_validation_func

        # Initialize state - don't need to track logs since functions handle it
        self.json_valid = True
        self.execution_df = pd.DataFrame()

    def validate_json_readability(self, config_json, json_valid=True):
        """
        Validates if the config_json can be read and is valid JSON.
        
        Args:
            config_json: The configuration JSON to validate (could be string or already parsed)
            json_valid: Flag indicating current validity state (default=True)
        
        Returns:
            tuple: (json_valid, parsed_json)
        """
        
        self.log_system(
            code="JSON_READABILITY_START",
            severity="INFO",
            message="Starting JSON readability validation",
            context={"step": "validate_json_readability"}
        )
        
        parsed_json = None
        
        try:
            # If config_json is a string, try to parse it
            if isinstance(config_json, str):
                import json
                parsed_json = json.loads(config_json)
            else:
                # If it's already parsed (dict/list), use it as is
                parsed_json = config_json
                
        except json.JSONDecodeError as e:
            json_valid = False
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            self.log_system(
                code="JSON_PARSE_ERROR",
                severity="ERROR",
                message="Configuration JSON is malformed",
                context={
                    "error_type": "JSONDecodeError",
                    "error_message": str(e),
                    "line": e.lineno,
                    "column": e.colno
                }
            )
            return json_valid, None
            
        except Exception as e:
            json_valid = False
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            self.log_system(
                code="JSON_READ_ERROR",
                severity="ERROR",
                message="Failed to read configuration JSON",
                context={
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            return json_valid, None
        
        # Check if parsed result is None or empty
        if parsed_json is None:
            json_valid = False
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            self.log_system(
                code="JSON_EMPTY_ERROR",
                severity="ERROR",
                message="Configuration JSON resulted in null value",
                context={"parsed_value": None}
            )
            return json_valid, None
        
        self.log_system(
            code="JSON_READABILITY_COMPLETE",
            severity="INFO",
            message="JSON readability validation completed successfully",
            context={
                "step": "validate_json_readability",
                "json_type": type(parsed_json).__name__,
                "success": True
            }
        )
        
        return json_valid, parsed_json


    def create_config_field_check_mapping(self, traditional_config_details_df, traditional_checks_library_df, json_valid):
        """
        Creates a mapping of config_id, field, and check_ids based on enabled checks.
        
        Args:
            traditional_config_details_df: DataFrame with config details
            traditional_checks_library_df: DataFrame with check library
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, mapping_df)
        """
        
        self.log_system(
            code="MAPPING_START",
            severity="INFO",
            message="Starting config-field-check mapping creation",
            context={"step": "create_config_field_check_mapping"}
        )
        
        try:
            # Identify check columns (columns ending with '_check')
            check_columns = [col for col in traditional_config_details_df.columns if col.endswith('_check')]

            # Create mapping name to check_id lookup dictionary (vectorized)
            check_library_dict = traditional_checks_library_df.set_index('check_mapping_name')['check_id'].to_dict()
            
            # Build list of records for mapping
            mapping_records = []
            
            # For each check column, filter rows where check is True and create records
            for check_col in check_columns:
                # Get the mapping name (remove '_check' suffix)
                mapping_name = check_col
                
                # Filter rows where this check is enabled (True)
                enabled_rows = traditional_config_details_df[traditional_config_details_df[check_col] == True]
                
                if not enabled_rows.empty:
                    # Get check_id from library
                    check_id = check_library_dict.get(mapping_name)
                    
                    if check_id is None:
                        json_valid = False
                        self.log_validation(
                            message=f"Unexpected error during JSON processing."
                        )
                        continue
                    
                    # Create records for this check (vectorized - no loop over rows)
                    check_records = enabled_rows[['tc_req_id', 'config_id', 'field']].copy()
                    check_records['check_id'] = check_id
                    check_records['check_mapping_name'] = mapping_name
                    
                    mapping_records.append(check_records)
            
            # Concatenate all records into single DataFrame
            if mapping_records:
                mapping_df = pd.concat(mapping_records, ignore_index=True)
            else:
                mapping_df = pd.DataFrame(columns=['tc_req_id', 'config_id', 'field', 'check_id', 'check_mapping_name'])
                json_valid = False
                self.log_validation(
                    message="Unexpected error during JSON processing."
                )
            
            self.log_system(
                code="MAPPING_COMPLETE",
                severity="INFO",
                message="Config-field-check mapping creation completed",
                context={
                    "step": "create_config_field_check_mapping",
                    "total_mappings": len(mapping_df),
                    "unique_configs": mapping_df['config_id'].nunique() if not mapping_df.empty else 0,
                    "unique_fields": mapping_df['field'].nunique() if not mapping_df.empty else 0,
                    "unique_checks": mapping_df['check_id'].nunique() if not mapping_df.empty else 0,
                    "success": json_valid
                }
            )
            
            return json_valid, mapping_df
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="MAPPING_ERROR",
                severity="ERROR",
                message="Config-field-check mapping creation failed",
                context={
                    "step": "create_config_field_check_mapping",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, pd.DataFrame(columns=['tc_req_id', 'config_id', 'field', 'check_id', 'check_mapping_name'])


    def get_mandatory_checks(self, traditional_checks_library_df, json_valid):
        """
        Retrieves a list of mandatory check_ids where abort is True.
        
        Args:
            traditional_checks_library_df: DataFrame with check library
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (mandatory_checks, json_valid)
        """
        
        self.log_system(
            code="MANDATORY_CHECKS_RETRIEVAL_START",
            severity="INFO",
            message="Starting mandatory checks retrieval",
            context={"step": "get_mandatory_checks"}
        )
        
        try:
            # Filter rows where abort is True (handling potential NaN values)
            mandatory_checks = traditional_checks_library_df[
                traditional_checks_library_df['abort'] == True
            ]['check_id'].dropna().tolist()
            
            self.log_system(
                code="MANDATORY_CHECKS_RETRIEVAL_COMPLETE",
                severity="INFO",
                message="Mandatory checks retrieval completed",
                context={
                    "step": "get_mandatory_checks",
                    "mandatory_checks_count": len(mandatory_checks),
                    "mandatory_checks": mandatory_checks
                }
            )
            
            return mandatory_checks, json_valid
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="MANDATORY_CHECKS_RETRIEVAL_ERROR",
                severity="ERROR",
                message="Mandatory checks retrieval failed",
                context={
                    "step": "get_mandatory_checks",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return [], json_valid


    def validate_json_structure(self, config_json, json_valid):
        """
        Validates the structure of config_json.
        
        Args:
            config_json: The configuration JSON to validate
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, valid_configs_with_index)
        """
        
        self.log_system(
            code="VALIDATION_START",
            severity="INFO",
            message="Starting JSON structure validation",
            context={"step": "validate_json_structure"}
        )
        
        try:
            valid_configs_with_index = []
            
            # Check if config_json is a list
            if not isinstance(config_json, list):
                json_valid = False
                self.log_validation(
                    message="Configuration must be a list",
                    context={"received_type": type(config_json).__name__}
                )
                
                self.log_system(
                    code="VALIDATION_COMPLETE",
                    severity="INFO",
                    message="JSON structure validation completed with errors",
                    context={
                        "step": "validate_json_structure",
                        "valid_configs": 0,
                        "total_configs": 0
                    }
                )
                return json_valid, valid_configs_with_index
            
            # Define expected keys once (keep it outside the loop for optimization)
            expected_keys = {"config_id", "checklist"}
            total_configs = len(config_json)

            self.log_system(
                code="VALIDATION_PROCESSING",
                severity="INFO",
                message="Processing configuration items",
                context={
                    "step": "validate_json_structure",
                    "total_items": total_configs
                }
            )

            # Why we can't fully remove loops:
            # The logging functions (log_validation, log_system) need to be called for each individual error with specific context. Even if we collect errors in bulk, we still need to iterate to create individual log entries.
            
            # Check each item in the list
            for idx, item in enumerate(config_json):
                
                # Check if item is a dictionary
                if not isinstance(item, dict):
                    json_valid = False
                    self.log_validation(
                        message=f"Configuration item at index {idx} must be an object",
                        context={"index": idx, "received_type": type(item).__name__}
                    )
                    continue
                
                # Get actual keys as set (already a set from dict.keys() view)
                actual_keys = item.keys()
                
                # Check for exact match first (faster path for valid configs)
                if actual_keys == expected_keys:
                    valid_configs_with_index.append({"index": idx, "config": item})
                    continue
                
                # Only compute differences if keys don't match
                actual_keys_set = set(actual_keys)
                missing_keys = expected_keys - actual_keys_set
                extra_keys = actual_keys_set - expected_keys
                
                json_valid = False
                
                # Validation logs for key mismatch
                if missing_keys:
                    self.log_validation(
                        message=f"Configuration item at index {idx} is missing required keys",
                        context={"index": idx, "missing_keys": list(missing_keys)}
                    )
                
                if extra_keys:
                    self.log_validation(
                        message=f"Configuration item at index {idx} contains unexpected keys",
                        context={"index": idx, "extra_keys": list(extra_keys)}
                    )
            
            # Log completion with summary
            self.log_system(
                code="VALIDATION_COMPLETE",
                severity="INFO",
                message="JSON structure validation completed",
                context={
                    "step": "validate_json_structure",
                    "valid_configs": len(valid_configs_with_index),
                    "total_configs": total_configs,
                    "success": json_valid
                }
            )
            
            return json_valid, valid_configs_with_index
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="VALIDATION_ERROR",
                severity="ERROR",
                message="JSON structure validation failed",
                context={
                    "step": "validate_json_structure",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, []


    def validate_config_ids(self, config_json_with_index, valid_config_ids, json_valid):
        """
        Validates that config_ids are strings and exist in the valid_config_ids list.
        
        Args:
            config_json_with_index: List of dicts with 'index' and 'config' keys
            valid_config_ids: List of valid config_id strings
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, valid_configs_with_index)
        """
        
        self.log_system(
            code="VALIDATION_START",
            severity="INFO",
            message="Starting config_id validation",
            context={"step": "validate_config_ids"}
        )
        
        try:
            valid_configs_with_index = []
            total_config_ids = len(valid_config_ids)
            
            self.log_system(
                code="VALIDATION_PROCESSING",
                severity="INFO",
                message="Processing config_id validation",
                context={
                    "step": "validate_config_ids",
                    "total_config_ids": total_config_ids
                }
            )
            
            # Check each item in the list
            for item_with_index in config_json_with_index:
                
                idx = item_with_index["index"]
                item = item_with_index["config"]
                config_id = item.get("config_id")
                
                # Check if config_id is a string
                if not isinstance(config_id, str):
                    json_valid = False
                    self.log_validation(
                        message=f"Configuration item at index {idx} has invalid config_id type",
                        context={
                            "index": idx,
                            "config_id": config_id,
                            "expected_type": "str",
                            "received_type": type(config_id).__name__
                        }
                    )
                    continue
                
                # Check if config_id exists in valid_config_ids list
                if config_id not in valid_config_ids:
                    json_valid = False
                    self.log_validation(
                        message=f"Configuration item at index {idx} has unrecognized config_id",
                        context={
                            "index": idx,
                            "config_id": config_id,
                            "valid_config_ids": valid_config_ids
                        }
                    )
                    continue
                
                # If both checks pass, add to valid_configs (preserving original index)
                valid_configs_with_index.append({"index": idx, "config": item})
            
            # Log completion with summary
            self.log_system(
                code="VALIDATION_COMPLETE",
                severity="INFO",
                message="Config_id validation completed",
                context={
                    "step": "validate_config_ids",
                    "valid_configs": len(valid_configs_with_index),
                    "total_configs": total_config_ids,
                    "success": json_valid
                }
            )
            
            return json_valid, valid_configs_with_index
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="VALIDATION_ERROR",
                severity="ERROR",
                message="Config_id validation failed",
                context={
                    "step": "validate_config_ids",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, []


    def validate_checklists(self, config_json_with_index, json_valid):
        """
        Validates that checklists are either dicts or the string "default" (case insensitive).
        
        Args:
            config_json_with_index: List of dicts with 'index' and 'config' keys
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, valid_configs_with_index)
        """
        
        self.log_system(
            code="VALIDATION_START",
            severity="INFO",
            message="Starting checklist validation",
            context={"step": "validate_checklists"}
        )
        
        try:
            valid_configs_with_index = []
            total_checklists = len(config_json_with_index)
            
            self.log_system(
                code="VALIDATION_PROCESSING",
                severity="INFO",
                message="Processing checklist validation",
                context={
                    "step": "validate_checklists",
                    "total_items": total_checklists
                }
            )
            
            # Check each item in the list
            for item_with_index in config_json_with_index:
                
                idx = item_with_index["index"]
                item = item_with_index["config"]
                checklist = item.get("checklist")
                
                # Check if checklist is a dict
                if isinstance(checklist, dict):
                    valid_configs_with_index.append({"index": idx, "config": item})
                    continue
                
                # Check if checklist is the string "default" (case insensitive)
                if isinstance(checklist, str) and checklist.lower() == "default":
                    valid_configs_with_index.append({"index": idx, "config": item})
                    continue
                
                # If neither condition is met, log validation error
                json_valid = False
                
                if isinstance(checklist, str):
                    # It's a string but not "default"
                    self.log_validation(
                        message=f"Configuration item at index {idx} has invalid checklist string value",
                        context={
                            "index": idx,
                            "checklist_value": checklist,
                            "expected": "dict or 'default' (case insensitive)",
                            "received_type": "str"
                        }
                    )
                else:
                    # It's not a dict or string at all
                    self.log_validation(
                        message=f"Configuration item at index {idx} has invalid checklist type",
                        context={
                            "index": idx,
                            "checklist_value": checklist,
                            "expected_type": "dict or str ('default')",
                            "received_type": type(checklist).__name__
                        }
                    )
            
            # Log completion with summary
            self.log_system(
                code="VALIDATION_COMPLETE",
                severity="INFO",
                message="Checklist validation completed",
                context={
                    "step": "validate_checklists",
                    "valid_configs": len(valid_configs_with_index),
                    "total_configs": total_checklists,
                    "success": json_valid
                }
            )
            
            return json_valid, valid_configs_with_index
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="VALIDATION_ERROR",
                severity="ERROR",
                message="Checklist validation failed",
                context={
                    "step": "validate_checklists",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, []


    def validate_fields(self, config_json_with_index, mapping_df, json_valid):
        """
        Validates that fields in checklists match the config_id/field pairs from mapping_df
        and that field values are either "default" string or list of strings.
        
        Args:
            config_json_with_index: List of dicts with 'index' and 'config' keys
            mapping_df: DataFrame with columns: tc_req_id, config_id, field, check_id, check_mapping_name
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, valid_configs_with_index)
        """
        
        self.log_system(
            code="VALIDATION_START",
            severity="INFO",
            message="Starting field validation",
            context={"step": "validate_fields"}
        )
        
        try:
            valid_configs_with_index = []
            total_config_objects = len(config_json_with_index)
            
            # Create a set of valid (config_id, field) pairs for fast lookup - O(1)
            valid_config_field_pairs = set(
                zip(mapping_df['config_id'], mapping_df['field'])
            )
            
            self.log_system(
                code="VALIDATION_PROCESSING",
                severity="INFO",
                message="Processing field validation",
                context={
                    "step": "validate_fields",
                    "total_items": total_config_objects,
                    "valid_config_field_pairs": len(valid_config_field_pairs)
                }
            )
            
            # Check each item in the list
            for item_with_index in config_json_with_index:
                
                idx = item_with_index["index"]
                item = item_with_index["config"]
                config_id = item.get("config_id")
                checklist = item.get("checklist")
                
                # Skip validation for "default" checklists (case insensitive)
                if isinstance(checklist, str) and checklist.lower() == "default":
                    valid_configs_with_index.append({"index": idx, "config": item})
                    continue
                
                # For dict checklists, validate each field
                if isinstance(checklist, dict):
                    all_fields_valid = True
                    invalid_fields = []
                    invalid_field_values = []
                    
                    for field, field_value in checklist.items():
                        # Check if (config_id, field) pair exists in mapping_df
                        if (config_id, field) not in valid_config_field_pairs:
                            all_fields_valid = False
                            invalid_fields.append(field)
                            continue
                        
                        # Validate field value type
                        # Valid: string "default" (case insensitive)
                        if isinstance(field_value, str):
                            if field_value.lower() != "default":
                                all_fields_valid = False
                                invalid_field_values.append({
                                    "field": field,
                                    "value": field_value,
                                    "reason": "String value must be 'default' (case insensitive)"
                                })
                            # If it's "default", it's valid - continue to next field
                            continue
                        
                        # Valid: list of strings
                        elif isinstance(field_value, list):
                            # Check if all elements in the list are strings
                            non_string_elements = [
                                elem for elem in field_value 
                                if not isinstance(elem, str)
                            ]
                            
                            if non_string_elements:
                                all_fields_valid = False
                                invalid_field_values.append({
                                    "field": field,
                                    "value": field_value,
                                    "reason": f"List contains non-string elements: {[type(e).__name__ for e in non_string_elements]}"
                                })
                            # If all elements are strings, it's valid - continue to next field
                            continue
                        
                        # Invalid: any other type (int, float, dict, nested list, etc.)
                        else:
                            all_fields_valid = False
                            invalid_field_values.append({
                                "field": field,
                                "value": field_value,
                                "reason": f"Invalid type '{type(field_value).__name__}'. Must be 'default' string or list of strings"
                            })
                    
                    # If all fields are valid, add to valid configs
                    if all_fields_valid:
                        valid_configs_with_index.append({"index": idx, "config": item})
                    else:
                        # Log validation errors
                        json_valid = False
                        
                        # Log invalid field names (not in mapping_df)
                        if invalid_fields:
                            self.log_validation(
                                message=f"Configuration item at index {idx} contains invalid fields",
                                context={
                                    "index": idx,
                                    "config_id": config_id,
                                    "invalid_fields": invalid_fields,
                                    "invalid_count": len(invalid_fields)
                                }
                            )
                        
                        # Log invalid field values (wrong type or format)
                        if invalid_field_values:
                            self.log_validation(
                                message=f"Configuration item at index {idx} contains invalid check_id values of field",
                                context={
                                    "index": idx,
                                    "config_id": config_id,
                                    "invalid_field_values": invalid_field_values,
                                    "invalid_count": len(invalid_field_values)
                                }
                            )
            
            # Log completion with summary
            self.log_system(
                code="VALIDATION_COMPLETE",
                severity="INFO",
                message="Field validation completed",
                context={
                    "step": "validate_fields",
                    "valid_configs": len(valid_configs_with_index),
                    "total_configs": total_config_objects,
                    "success": json_valid
                }
            )
            
            return json_valid, valid_configs_with_index
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="VALIDATION_ERROR",
                severity="ERROR",
                message="Field validation failed",
                context={
                    "step": "validate_fields",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, []


    def validate_check_ids(self, config_json_with_index, mapping_df, mandatory_checks, json_valid):
        """
        Validates that check_ids in checklists are either mandatory checks or match the config_id/field/check_id combos from mapping_df.
        
        Args:
            config_json_with_index: List of dicts with 'index' and 'config' keys
            mapping_df: DataFrame with columns: tc_req_id, config_id, field, check_id, check_mapping_name
            mandatory_checks: List of mandatory check_id strings (where abort is True)
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, valid_configs_with_index)
        """
        
        self.log_system(
            code="VALIDATION_START",
            severity="INFO",
            message="Starting check_id validation",
            context={"step": "validate_check_ids"}
        )
        
        try:
            valid_configs_with_index = []
            total_config_objects = len(config_json_with_index)
            
            # Create a set of valid (config_id, field, check_id) tuples for fast lookup - O(1)
            valid_config_field_check_combos = set(
                zip(mapping_df['config_id'], mapping_df['field'], mapping_df['check_id'])
            )
            
            # Convert mandatory_checks to a set for O(1) lookup
            mandatory_checks_set = set(mandatory_checks)
            
            self.log_system(
                code="VALIDATION_PROCESSING",
                severity="INFO",
                message="Processing check_id validation",
                context={
                    "step": "validate_check_ids",
                    "total_items": total_config_objects,
                    "valid_config_field_check_combos": len(valid_config_field_check_combos),
                    "mandatory_checks_count": len(mandatory_checks_set)
                }
            )
            
            # Check each item in the list
            for item_with_index in config_json_with_index:
                
                idx = item_with_index["index"]
                item = item_with_index["config"]
                config_id = item.get("config_id")
                checklist = item.get("checklist")
                
                # Skip validation for "default" checklists (case insensitive)
                if isinstance(checklist, str) and checklist.lower() == "default":
                    valid_configs_with_index.append({"index": idx, "config": item})
                    continue
                
                # For dict checklists, validate each field's check_ids
                if isinstance(checklist, dict):
                    all_checks_valid = True
                    invalid_check_ids = []
                    
                    for field, field_value in checklist.items():
                        
                        # Skip validation for "default" field values (case insensitive)
                        if isinstance(field_value, str) and field_value.lower() == "default":
                            continue
                        
                        # For list of check_ids, validate each one
                        if isinstance(field_value, list):
                            for check_id in field_value:
                                # Check if check_id is mandatory OR exists in the valid combo
                                is_mandatory = check_id in mandatory_checks_set
                                is_in_mapping = (config_id, field, check_id) in valid_config_field_check_combos
                                
                                if not (is_mandatory or is_in_mapping):
                                    all_checks_valid = False
                                    invalid_check_ids.append({
                                        "field": field,
                                        "check_id": check_id,
                                        "reason": "Not a mandatory check and not found in config/field/check mapping"
                                    })
                    
                    # If all check_ids are valid, add to valid configs
                    if all_checks_valid:
                        valid_configs_with_index.append({"index": idx, "config": item})
                    else:
                        # Log validation error for invalid check_ids
                        json_valid = False
                        self.log_validation(
                            message=f"Configuration item at index {idx} contains invalid check_ids",
                            context={
                                "index": idx,
                                "config_id": config_id,
                                "invalid_check_ids": invalid_check_ids,
                                "invalid_count": len(invalid_check_ids)
                            }
                        )
            
            # Log completion with summary
            self.log_system(
                code="VALIDATION_COMPLETE",
                severity="INFO",
                message="Check_id validation completed",
                context={
                    "step": "validate_check_ids",
                    "valid_configs": len(valid_configs_with_index),
                    "total_configs": total_config_objects,
                    "success": json_valid
                }
            )
            
            return json_valid, valid_configs_with_index
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="VALIDATION_ERROR",
                severity="ERROR",
                message="Check_id validation failed",
                context={
                    "step": "validate_check_ids",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, []


    def expand_and_combine_configs(self, valid_config_json, mapping_df, mandatory_checks, json_valid):
        """
        Expands 'default' values, combines entries, and ensures mandatory checks are present.
        
        Steps:
        1. Replace 'default' checklists with field names and 'default' check_ids
        2. Replace 'default' check_ids with actual check_ids from mapping_df
        3. Combine entries by config_id -> field -> check_ids
        4. Set field to None for mandatory check_ids
        5. Add missing mandatory checks for each config
        
        Args:
            valid_config_json: List of dicts with 'index' and 'config' keys
            mapping_df: DataFrame with columns: tc_req_id, config_id, field, check_id, check_mapping_name
            mandatory_checks: List of mandatory check_id strings
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, expanded_config_df)
        """
        
        self.log_system(
            code="EXPANSION_START",
            severity="INFO",
            message="Starting config expansion and combination",
            context={"step": "expand_and_combine_configs"}
        )
        
        try:
            # Convert mandatory_checks to set for O(1) lookup
            mandatory_checks_set = set(mandatory_checks)
            
            # Create check_id to check_mapping_name lookup dictionary
            check_id_to_mapping_name = mapping_df.set_index('check_id')['check_mapping_name'].to_dict()
            
            # Step 1 & 2: Expand defaults and create records
            self.log_system(
                code="DEFAULT_EXPANSION_START",
                severity="INFO",
                message="Expanding default checklists and check_ids",
                context={"step": "expand_defaults"}
            )
            
            expanded_records = []
            
            for item_with_index in valid_config_json:
                idx = item_with_index["index"]
                config = item_with_index["config"]
                config_id = config["config_id"]
                checklist = config["checklist"]
                
                # Case 1: Checklist is "default" - expand to all fields for this config
                if isinstance(checklist, str) and checklist.lower() == "default":
                    # Get all fields for this config from mapping_df
                    config_fields = mapping_df[mapping_df['config_id'] == config_id]
                    
                    for _, row in config_fields.iterrows():
                        expanded_records.append({
                            'original_index': idx,
                            'config_id': config_id,
                            'field': row['field'],
                            'check_id': row['check_id'],
                            'check_mapping_name': row['check_mapping_name']
                        })
                
                # Case 2: Checklist is a dict
                elif isinstance(checklist, dict):
                    for field, field_value in checklist.items():
                        
                        # Case 2a: Field value is "default" - expand to all checks for this config/field
                        if isinstance(field_value, str) and field_value.lower() == "default":
                            # Get all check_ids for this config/field from mapping_df
                            field_checks = mapping_df[
                                (mapping_df['config_id'] == config_id) & 
                                (mapping_df['field'] == field)
                            ]
                            
                            for _, row in field_checks.iterrows():
                                expanded_records.append({
                                    'original_index': idx,
                                    'config_id': config_id,
                                    'field': field,
                                    'check_id': row['check_id'],
                                    'check_mapping_name': row['check_mapping_name']
                                })
                        
                        # Case 2b: Field value is a list of check_ids
                        elif isinstance(field_value, list):
                            for check_id in field_value:
                                expanded_records.append({
                                    'original_index': idx,
                                    'config_id': config_id,
                                    'field': field,
                                    'check_id': check_id,
                                    'check_mapping_name': check_id_to_mapping_name.get(check_id)
                                })
            
            # Convert to DataFrame
            expanded_df = pd.DataFrame(expanded_records)
            
            self.log_system(
                code="DEFAULT_EXPANSION_COMPLETE",
                severity="INFO",
                message="Default expansion completed",
                context={
                    "step": "expand_defaults",
                    "total_expanded_records": len(expanded_df)
                }
            )
            
            # Step 3: Set field to None for mandatory checks
            self.log_system(
                code="MANDATORY_FIELD_PROCESSING",
                severity="INFO",
                message="Setting field to None for mandatory checks",
                context={"step": "process_mandatory_fields"}
            )
            
            expanded_df['field'] = expanded_df.apply(
                lambda row: None if row['check_id'] in mandatory_checks_set else row['field'],
                axis=1
            )
            
            # Step 4: Combine duplicates (same config_id, field, check_id)
            self.log_system(
                code="COMBINATION_START",
                severity="INFO",
                message="Combining duplicate config/field/check combinations",
                context={"step": "combine_duplicates"}
            )
            
            # Group by config_id, field, check_id and keep unique combinations
            combined_df = expanded_df.drop_duplicates(
                subset=['config_id', 'field', 'check_id']
            ).copy()
            
            self.log_system(
                code="COMBINATION_COMPLETE",
                severity="INFO",
                message="Combination completed",
                context={
                    "step": "combine_duplicates",
                    "records_before": len(expanded_df),
                    "records_after": len(combined_df),
                    "duplicates_removed": len(expanded_df) - len(combined_df)
                }
            )
            
            # Step 5: Add missing mandatory checks for each config
            self.log_system(
                code="MANDATORY_CHECKS_ADDITION_START",
                severity="INFO",
                message="Adding missing mandatory checks",
                context={"step": "add_mandatory_checks"}
            )
            
            # Get unique config_ids
            unique_configs = combined_df['config_id'].unique()
            
            missing_mandatory_records = []
            
            for config_id in unique_configs:
                # Get existing mandatory checks for this config
                existing_mandatory = set(
                    combined_df[
                        (combined_df['config_id'] == config_id) & 
                        (combined_df['check_id'].isin(mandatory_checks_set))
                    ]['check_id']
                )
                
                # Find missing mandatory checks
                missing_mandatory = mandatory_checks_set - existing_mandatory
                
                # Add missing mandatory checks
                for check_id in missing_mandatory:
                    missing_mandatory_records.append({
                        'original_index': None,  # No original index for auto-added checks
                        'config_id': config_id,
                        'field': None,  # Mandatory checks have field = None
                        'check_id': check_id,
                        'check_mapping_name': check_id_to_mapping_name.get(check_id)
                    })
            
            # Append missing mandatory checks
            if missing_mandatory_records:
                missing_df = pd.DataFrame(missing_mandatory_records)
                combined_df = pd.concat([combined_df, missing_df], ignore_index=True)
            
            self.log_system(
                code="MANDATORY_CHECKS_ADDITION_COMPLETE",
                severity="INFO",
                message="Missing mandatory checks added",
                context={
                    "step": "add_mandatory_checks",
                    "missing_mandatory_added": len(missing_mandatory_records)
                }
            )
            
            # Final summary
            self.log_system(
                code="EXPANSION_COMPLETE",
                severity="INFO",
                message="Config expansion and combination completed successfully",
                context={
                    "step": "expand_and_combine_configs",
                    "total_configs": len(unique_configs),
                    "total_records": len(combined_df),
                    "unique_config_field_check_combos": len(combined_df),
                    "success": True
                }
            )
            
            return json_valid, combined_df
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="EXPANSION_ERROR",
                severity="ERROR",
                message="Config expansion failed",
                context={
                    "step": "expand_and_combine_configs",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, pd.DataFrame()


    @staticmethod
    def _build_config_level_details(traditional_config_details_df):
        """
        Build per-config JSON detail strings for datatype and column order checks.
        Keys are field names; values are column_datatype or column_order respectively.

        Requires 'column_datatype' / 'column_order' columns on
        traditional_config_details_df; both exist on the real table. If neither
        is present an empty frame comes back and the schema checks stay blank,
        which is what used to happen unconditionally.

        The field order in these maps follows column_order, so the JSON that
        reaches the schema checks carries the configured ordering rather than
        whatever order the rows happened to arrive in.
        """
        has_datatype_col = "column_datatype" in traditional_config_details_df.columns
        has_order_col = "column_order" in traditional_config_details_df.columns

        empty_result = pd.DataFrame(columns=["config_id", "config_column_datatype", "config_column_order"])

        if not has_datatype_col and not has_order_col:
            return empty_result

        records = []
        for config_id, group in traditional_config_details_df.groupby("config_id"):
            if has_order_col:
                # Configured column order decides the field order in both maps.
                group = group.sort_values("column_order")

            datatype_map = {}
            if has_datatype_col:
                datatype_rows = group.dropna(subset=["field", "column_datatype"])
                datatype_map = datatype_rows.set_index("field")["column_datatype"].astype(str).to_dict()

            order_map = {}
            if has_order_col:
                order_rows = group.dropna(subset=["field", "column_order"]).sort_values("column_order")
                order_map = dict(zip(order_rows["field"], order_rows["column_order"]))

            records.append({
                "config_id": config_id,
                "config_column_datatype": json.dumps(datatype_map, default=str) if datatype_map else "",
                "config_column_order": json.dumps(order_map, default=str) if order_map else "",
            })

        if not records:
            return empty_result

        return pd.DataFrame(records)

    def add_check_details(self, final_config_df, traditional_config_details_df, traditional_checks_library_df, json_valid):
        """
        Adds check-specific details and criticality columns to the final config DataFrame.
        
        Args:
            final_config_df: DataFrame with columns: original_index, config_id, field, check_id, check_mapping_name
            traditional_config_details_df: DataFrame with config details and check-specific columns
            traditional_checks_library_df: DataFrame with check library information
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, enhanced_config_df)
        """
        
        self.log_system(
            code="DETAILS_ADDITION_START",
            severity="INFO",
            message="Starting check details addition",
            context={"step": "add_check_details"}
        )
        
        try:
            # Create a copy to avoid modifying the original
            enhanced_df = final_config_df.copy()
            
            # Merge with traditional_config_details_df to get check-specific columns
            # Only merge on config_id and field (for non-mandatory checks where field is not None)
            self.log_system(
                code="MERGE_START",
                severity="INFO",
                message="Merging with traditional config details",
                context={"step": "merge_config_details"}
            )
            
            # Separate mandatory checks (field is None) from field-specific checks
            mandatory_mask = enhanced_df['field'].isna()
            field_specific_df = enhanced_df[~mandatory_mask].copy()
            mandatory_df = enhanced_df[mandatory_mask].copy()
            
            # Merge field-specific checks with traditional config details
            if not field_specific_df.empty:
                field_specific_df = field_specific_df.merge(
                    traditional_config_details_df,
                    on=['config_id', 'field'],
                    how='left',
                    suffixes=('', '_details')
                )
            
            # Initialize detail columns for mandatory checks
            if not mandatory_df.empty:
                for col in ['detail1', 'detail2', 'detail3', 'detail4', 'criticality']:
                    mandatory_df[col] = ""
            
            # Combine back
            if not field_specific_df.empty and not mandatory_df.empty:
                enhanced_df = pd.concat([field_specific_df, mandatory_df], ignore_index=True)
            elif not field_specific_df.empty:
                enhanced_df = field_specific_df
            elif not mandatory_df.empty:
                enhanced_df = mandatory_df

            # Merge in per-config JSON details (column order / datatype) for
            # column_order_check and datatype_check, keyed on config_id only
            config_level_df = self._build_config_level_details(traditional_config_details_df)
            if not config_level_df.empty:
                enhanced_df = enhanced_df.merge(config_level_df, on='config_id', how='left')

            self.log_system(
                code="MERGE_COMPLETE",
                severity="INFO",
                message="Merge with traditional config details completed",
                context={
                    "step": "merge_config_details",
                    "total_records": len(enhanced_df)
                }
            )
            
            # Initialize detail columns if not already present
            for col in ['detail1', 'detail2', 'detail3', 'detail4', 'criticality']:
                if col not in enhanced_df.columns:
                    enhanced_df[col] = ""
            
            # Apply fill_details function
            self.log_system(
                code="DETAILS_FILLING_START",
                severity="INFO",
                message="Filling check-specific details",
                context={"step": "fill_details"}
            )
            
            def fill_details(row):
                """Fill detail columns based on check_mapping_name"""
                check = row.get("check_mapping_name", "")
                
                # Reset all details
                row["detail1"] = ""
                row["detail2"] = ""
                row["detail3"] = ""
                row["detail4"] = ""
                row["criticality"] = ""
                
                if check == "column_order_check":
                    row["detail1"] = str(row.get("config_column_order", "")) if pd.notna(row.get("config_column_order")) else ""

                elif check == "datatype_check":
                    row["detail1"] = str(row.get("config_column_datatype", "")) if pd.notna(row.get("config_column_datatype")) else ""

                elif check == "primary_key_check":
                    row["criticality"] = row.get("primary_key_check_criticality", "")

                elif check == "ri_check":
                    # Real traditional_config_details schema only has ri_connection_id /
                    # ri_reference_table / ri_field_name (no separate reference-schema
                    # column) -- these detail1-3 names (ri_referenced_from /
                    # ri_reference_schema / ri_reference_file_or_table) never existed on
                    # the real table, so RI checks always errored with an empty
                    # connection id (sql_executor.py reads detail1 as ri_connection_id,
                    # detail2 as the parent table, detail3 as the parent column).
                    row["detail1"] = str(row.get("ri_connection_id", "")) if pd.notna(row.get("ri_connection_id")) else ""
                    row["detail2"] = str(row.get("ri_reference_table", "")) if pd.notna(row.get("ri_reference_table")) else ""
                    row["detail3"] = str(row.get("ri_field_name", "")) if pd.notna(row.get("ri_field_name")) else ""
                    row["criticality"] = row.get("ri_check_criticality", "")
                
                elif check == "null_check":
                    row["criticality"] = row.get("null_check_criticality", "")
                
                elif check == "duplicate_check":
                    row["criticality"] = row.get("duplicate_check_criticality", "")
                
                elif check == "lov_check":
                    row["detail1"] = str(row.get("lovs", "")) if pd.notna(row.get("lovs")) else ""
                    row["criticality"] = row.get("lov_check_criticality", "")
                
                elif check == "format_check":
                    row["detail1"] = str(row.get("format_regex", "")) if pd.notna(row.get("format_regex")) else ""
                    row["criticality"] = row.get("format_check_criticality", "")
                
                elif check == "length_check":
                    row["detail1"] = str(int(row.get("expected_length"))) if pd.notna(row.get("expected_length")) else ""
                    row["criticality"] = row.get("length_check_criticality", "")
                
                return row
            
            # Apply the function to each row
            enhanced_df = enhanced_df.apply(fill_details, axis=1)
            
            self.log_system(
                code="DETAILS_FILLING_COMPLETE",
                severity="INFO",
                message="Check-specific details filled",
                context={"step": "fill_details"}
            )
            
            # Merge with traditional_checks_library_df to get check library columns
            self.log_system(
                code="LIBRARY_MERGE_START",
                severity="INFO",
                message="Merging with checks library",
                context={"step": "merge_checks_library"}
            )
            
            # Select columns from checks library (avoiding duplicate check_mapping_name if it exists)
            # check_function is not present on the real traditional_checks_library_rev
            # schema -- only include it if this particular library dataframe has it.
            library_columns = ['check_id', 'check_name', 'check_description', 'abort']
            if 'check_function' in traditional_checks_library_df.columns:
                library_columns.append('check_function')

            # Always take check_mapping_name from the library when the library
            # has it. The guard used to be "only if enhanced_df lacks the
            # column", but enhanced_df always HAS it -- unset (None) on the
            # mandatory rows, which are exactly the ones that need filling.
            # That meant the merge never produced check_mapping_name_library,
            # so the fillna below never ran, TC001-TC004 kept check_mapping_name
            # None, and every mask keyed on SCHEMA_CHECKS matched nothing.
            if 'check_mapping_name' in traditional_checks_library_df.columns:
                library_columns.insert(1, 'check_mapping_name')

            enhanced_df = enhanced_df.merge(
                traditional_checks_library_df[library_columns],
                on='check_id',
                how='left',
                suffixes=('', '_library')
            )
            
            # If check_mapping_name was added from library, use it; otherwise keep existing
            if 'check_mapping_name_library' in enhanced_df.columns:
                enhanced_df['check_mapping_name'] = enhanced_df['check_mapping_name'].fillna(
                    enhanced_df['check_mapping_name_library']
                )
                enhanced_df.drop('check_mapping_name_library', axis=1, inplace=True)

            # The schema checks (column_name/column_order/datatype) are
            # config-level, not field-level, so they come through as mandatory
            # rows with field=None and pick up nothing from the field merge
            # earlier. ChecksExecutor reads `column_order` / `column_datatype`
            # off the row, so the per-config maps have to land under exactly
            # those names -- previously they only existed as
            # `config_column_order` / `config_column_datatype` and as detail1,
            # which is why sql_executor's guard always tripped and TC002/TC003/
            # TC004 reported "error" on every job.
            #
            # This has to run HERE, after the library merge: mandatory rows
            # arrive with check_mapping_name unset and only get it from the
            # fillna just above, so matching on SCHEMA_CHECKS any earlier
            # selects nothing and the copy silently does nothing at all.
            if 'check_mapping_name' in enhanced_df.columns:
                schema_check_mask = enhanced_df['check_mapping_name'].isin(SCHEMA_CHECKS)
                if schema_check_mask.any():
                    for target_col, source_col in (
                        ('column_order', 'config_column_order'),
                        ('column_datatype', 'config_column_datatype'),
                    ):
                        if source_col not in enhanced_df.columns:
                            continue
                        if target_col not in enhanced_df.columns:
                            enhanced_df[target_col] = None
                        enhanced_df[target_col] = enhanced_df[target_col].astype(object)
                        enhanced_df.loc[schema_check_mask, target_col] = (
                            enhanced_df.loc[schema_check_mask, source_col]
                        )

            self.log_system(
                code="LIBRARY_MERGE_COMPLETE",
                severity="INFO",
                message="Merge with checks library completed",
                context={
                    "step": "merge_checks_library",
                    "columns_added": ['check_name', 'check_description', 'check_function', 'abort']
                }
            )
            
            # Set criticality to "high" for checks where abort is True
            self.log_system(
                code="CRITICALITY_UPDATE_START",
                severity="INFO",
                message="Updating criticality for abort checks",
                context={"step": "update_abort_criticality"}
            )
            
            # Only override criticality if abort is True
            if 'abort' in enhanced_df.columns:
                abort_mask = enhanced_df['abort'] == True
                abort_count = abort_mask.sum()
                enhanced_df.loc[abort_mask, 'criticality'] = 'high'
                
                self.log_system(
                    code="CRITICALITY_UPDATE_COMPLETE",
                    severity="INFO",
                    message="Criticality updated for abort checks",
                    context={
                        "step": "update_abort_criticality",
                        "records_updated": abort_count
                    }
                )
            
            # Select only the required columns for final output.
            # column_order/column_datatype are carried through because the
            # schema checks (TC002/TC003/TC004) read them straight off the row
            # in ChecksExecutor. They are populated above from the per-config
            # maps; leaving them out of this list silently dropped them again
            # right after that merge, so sql_executor's guard still tripped and
            # the three gates errored with "column_order and column_datatype are
            # both required for schema checks" on every job.
            final_columns = [
                'original_index', 'config_id', 'field', 'check_id', 'check_mapping_name',
                'check_name', 'check_description',
                'check_function', 'abort', 'detail1', 'detail2', 'detail3', 'detail4',
                'criticality', 'column_order', 'column_datatype'
            ]
            
            # Keep only final columns (if they exist)
            available_columns = [col for col in final_columns if col in enhanced_df.columns]
            enhanced_df = enhanced_df[available_columns].copy()
            
            self.log_system(
                code="DETAILS_ADDITION_COMPLETE",
                severity="INFO",
                message="Check details addition completed successfully",
                context={
                    "step": "add_check_details",
                    "total_records": len(enhanced_df),
                    "columns_added": ['check_name', 'check_description', 'check_function', 'abort', 
                                    'detail1', 'detail2', 'detail3', 'detail4', 'criticality'],
                    "success": True
                }
            )
            
            return json_valid, enhanced_df
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="DETAILS_ADDITION_ERROR",
                severity="ERROR",
                message="Check details addition failed",
                context={
                    "step": "add_check_details",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, pd.DataFrame()


    def create_execution_dataframe(self, final_config_df, json_valid):
        """
        Creates execution DataFrame by dropping original_index, sorting, and adding execution_id.
        
        Args:
            final_config_df: DataFrame with final configuration details
            json_valid: Flag indicating current validity state
        
        Returns:
            tuple: (json_valid, execution_df)
        """
        
        self.log_system(
            code="EXECUTION_DF_START",
            severity="INFO",
            message="Starting execution DataFrame creation",
            context={"step": "create_execution_dataframe"}
        )
        
        try:
            # Drop original_index column
            self.log_system(
                code="EXECUTION_DF_PROCESSING",
                severity="INFO",
                message="Dropping original_index column",
                context={
                    "step": "create_execution_dataframe",
                    "columns_before": list(final_config_df.columns)
                }
            )
            
            execution_df = final_config_df.drop(columns=["original_index"])
            
            # Sort by config_id, check_id, field
            self.log_system(
                code="EXECUTION_DF_SORTING",
                severity="INFO",
                message="Sorting execution DataFrame",
                context={
                    "step": "create_execution_dataframe",
                    "sort_columns": ["config_id", "check_id", "field"],
                    "records_before_sort": len(execution_df)
                }
            )
            
            execution_df = execution_df.sort_values(
                by=["config_id", "check_id", "field"],
                ascending=[True, True, True]
            ).reset_index(drop=True)
            
            # Add execution_id column
            self.log_system(
                code="EXECUTION_ID_ADDITION",
                severity="INFO",
                message="Adding execution_id column",
                context={
                    "step": "create_execution_dataframe",
                    "total_execution_ids": len(execution_df)
                }
            )
            
            execution_df.insert(
                0,
                "execution_id",
                range(1, len(execution_df) + 1)
            )
            
            self.log_system(
                code="EXECUTION_DF_COMPLETE",
                severity="INFO",
                message="Execution DataFrame creation completed successfully",
                context={
                    "step": "create_execution_dataframe",
                    "total_records": len(execution_df),
                    "columns": list(execution_df.columns),
                    "success": True
                }
            )
            
            return json_valid, execution_df
        
        except KeyError as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="EXECUTION_DF_ERROR",
                severity="ERROR",
                message="Execution DataFrame creation failed - missing column",
                context={
                    "step": "create_execution_dataframe",
                    "error_type": "KeyError",
                    "error_message": str(e),
                    "available_columns": list(final_config_df.columns) if 'final_config_df' in locals() else []
                }
            )
            
            return json_valid, pd.DataFrame()
        
        except Exception as e:
            json_valid = False
            
            self.log_validation(
                message="Unexpected error during JSON processing."
            )
            
            self.log_system(
                code="EXECUTION_DF_ERROR",
                severity="ERROR",
                message="Execution DataFrame creation failed",
                context={
                    "step": "create_execution_dataframe",
                    "error_type": type(e).__name__,
                    "error_message": str(e)
                }
            )
            
            return json_valid, pd.DataFrame()

    def _is_empty(self, data):
        """
        Check if data is empty (None, empty list, or empty DataFrame).
        
        Args:
            data: Data to check (can be None, list, or DataFrame)
        
        Returns:
            bool: True if data is empty, False otherwise
        """
        if data is None:
            return True
        if isinstance(data, list) and len(data) == 0:
            return True
        if isinstance(data, pd.DataFrame) and data.empty:
            return True
        return False
    
    def _log_unexpected_error(self, step, error=None):
        """
        Log unexpected error with validation and system logs.
        
        Args:
            step: Name of the step where error occurred
            error: Exception object (optional)
        """
        self.log_validation(message="Unexpected error during JSON processing.")
        
        self.log_system(
            code="VALIDATION_PIPELINE_ERROR",
            severity="ERROR",
            message=f"Validation pipeline failed at step: {step}",
            context={
                "step": step,
                "error_type": type(error).__name__ if error else "Unknown",
                "error_message": str(error) if error else "No error details available"
            }
        )
    
    def validate(self):
        """
        Execute the complete validation pipeline.
        
        Returns:
            tuple: (json_valid, execution_df)
        """
        try:
            # Step 1: Validate JSON readability
            self.json_valid, config_json = self.validate_json_readability(
                self.config_json
            )
            
            # PROCEED ONLY IF config_json IS NOT EMPTY
            if self._is_empty(config_json):
                return self.json_valid, self.execution_df
            
            # Step 2: Create config-field-check mapping
            self.json_valid, mapping_df = self.create_config_field_check_mapping(
                self.traditional_config_details_df,
                self.traditional_checks_library_df,
                self.json_valid
            )
            
            # PROCEED ONLY IF mapping_df IS NOT EMPTY
            if self._is_empty(mapping_df):
                return self.json_valid, self.execution_df
            
            # Step 3: Get mandatory checks
            mandatory_checks, self.json_valid = self.get_mandatory_checks(
                self.traditional_checks_library_df,
                self.json_valid
            )
            
            # PROCEED ONLY IF mandatory_checks IS NOT EMPTY
            if self._is_empty(mandatory_checks):
                return self.json_valid, self.execution_df
            
            # Step 4: Validate JSON structure
            self.json_valid, valid_config_json = self.validate_json_structure(
                config_json,
                self.json_valid
            )
            
            # PROCEED ONLY IF valid_config_json IS NOT EMPTY
            if self._is_empty(valid_config_json):
                return self.json_valid, self.execution_df
            
            # Step 5: Prepare valid config IDs
            mapping_df.columns = mapping_df.columns.str.lower()
            valid_config_ids = mapping_df["config_id"].unique().tolist()
            
            # Step 6: Validate config IDs
            self.json_valid, valid_config_json = self.validate_config_ids(
                valid_config_json,
                valid_config_ids,
                self.json_valid
            )
            
            # PROCEED ONLY IF valid_config_json IS NOT EMPTY
            if self._is_empty(valid_config_json):
                return self.json_valid, self.execution_df
            
            # Step 7: Validate checklists
            self.json_valid, valid_config_json = self.validate_checklists(
                valid_config_json,
                self.json_valid
            )
            
            # PROCEED ONLY IF valid_config_json IS NOT EMPTY
            if self._is_empty(valid_config_json):
                return self.json_valid, self.execution_df
            
            # Step 8: Validate fields
            self.json_valid, valid_config_json = self.validate_fields(
                valid_config_json,
                mapping_df,
                self.json_valid
            )
            
            # PROCEED ONLY IF valid_config_json IS NOT EMPTY
            if self._is_empty(valid_config_json):
                return self.json_valid, self.execution_df
            
            # Step 9: Validate check IDs
            self.json_valid, valid_config_json = self.validate_check_ids(
                valid_config_json,
                mapping_df,
                mandatory_checks,
                self.json_valid
            )
            
            # PROCEED ONLY IF valid_config_json IS NOT EMPTY
            if self._is_empty(valid_config_json):
                return self.json_valid, self.execution_df
            
            # Step 10: Expand and combine configs
            self.json_valid, final_config_df = self.expand_and_combine_configs(
                valid_config_json,
                mapping_df,
                mandatory_checks,
                self.json_valid
            )
            
            # PROCEED ONLY IF final_config_df IS NOT EMPTY
            if self._is_empty(final_config_df):
                return self.json_valid, self.execution_df
            
            # Step 11: Add check details
            self.json_valid, final_config_df = self.add_check_details(
                final_config_df,
                self.traditional_config_details_df,
                self.traditional_checks_library_df,
                self.json_valid
            )
            
            # PROCEED ONLY IF final_config_df IS NOT EMPTY
            if self._is_empty(final_config_df):
                return self.json_valid, self.execution_df
            
            # Step 12: Create execution DataFrame
            self.json_valid, self.execution_df = self.create_execution_dataframe(
                final_config_df,
                self.json_valid
            )
            
            return self.json_valid, self.execution_df
        
        except Exception as e:
            self.json_valid = False
            self._log_unexpected_error("validation_pipeline", e)
            return self.json_valid, pd.DataFrame()