# Decides how data should move from source to target:
# same server (SQL), different server same engine, (fetch in memory and bulk insert), or different engines(file+COPY).


# Check for the same server or different
def is_same_host(source_connection_details, target_connection_details, database_type):
    
    if database_type == "postgresql" or database_type == "postgres":
        source_value = source_connection_details.get("host")
        target_value = target_connection_details.get("host")

    elif database_type == "snowflake":
        source_value = source_connection_details.get("additional_params", {}).get("account")
        target_value = target_connection_details.get("additional_params", {}).get("account")

    else:
        raise ValueError(f"Unsupported database type for host comparison: {database_type}")

    if not source_value or not target_value:
        raise ValueError(
            f"Cannot determine same-host vs cross-host: "
            f"required field missing for database_type={database_type!r}"
        )

    return source_value == target_value


def is_same_database(source_connection_details, target_connection_details):
    return (
        source_connection_details.get("database_name") ==
        target_connection_details.get("database_name")
    )
    

def decide_load_strategy(source_connection_details, target_connection_details):

    source_type = source_connection_details["database_type"]
    target_type = target_connection_details["database_type"]

    if source_type != target_type:
        return "file_copy"

    same_host = is_same_host(
        source_connection_details, target_connection_details, source_type
    )
    same_database = is_same_database(
        source_connection_details, target_connection_details
    )

    if source_type == "postgresql":
        
        if same_host and same_database:
            return "same_host"
        else:
            return "file_copy"

    elif source_type == "snowflake":

        if same_host:
            return "same_host"
        else:
            return "file_copy"

    return "file_copy"