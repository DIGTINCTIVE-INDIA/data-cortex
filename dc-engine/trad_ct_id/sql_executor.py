# Executes all DQ checks against PostgreSQL and Snowflake.

# run_tc_checks() -- validates input and calls execute_tc_checks()
# execute_tc_checks()--builds query, executes, returns failed row ids

from datetime import datetime, timezone
from trad_ct_id.sql_tempelate import TC_SQL_TEMP
from trad_ct_id.failure_messege_builder import build_failure_message
from trad_ct_id.config import SCHEMA_CHECKS, DATA_CHECKS, TEMPLATE_DATA_CHECKS, FILE_CHECKS, ALL_CHECKS
import json, ast

import orjson
from trad_ct_id.value_converter import normalize_rows
from trad_ct_id.datatype_scan import run_datatype_scan


def parse_lov_values(raw_value):

    if raw_value is None:
        return []

    if isinstance(raw_value, list):
        return raw_value

    if not isinstance(raw_value, str):
        raise ValueError(f"Unsupported LOV type: {type(raw_value)}")

    value = raw_value.strip()

    if value.startswith("[") and value.endswith("]"):

        try:
            parsed = ast.literal_eval(value)
        except Exception:
            parsed = json.loads(value)

        return [str(v).strip() for v in parsed if str(v).strip()]

    if value.startswith("{") and value.endswith("}"):
        return [v.strip() for v in value[1:-1].split(",") if v.strip()]

    if "," in value:
        return [v.strip() for v in value.split(",") if v.strip()]

    return [value]


# Preserving case sensitivity for database_type
def quote_identifier(name, database_type):

    database_type = database_type.lower()

    if (database_type == "postgresql") or (database_type == "postgres"):
        return f'"{name}"'

    elif database_type == "snowflake":
        return f'"{name.upper()}"'

    raise ValueError(f"Unsupported database type: {database_type}")


# Trims leading and trailing whitespaces and converts empty string to NULL
def get_clean_column(column_name, database_type):

    quoted_column = quote_identifier(column_name, database_type)
    return f"NULLIF(TRIM({quoted_column}::TEXT), '')"


def get_template(check_mapping_name, database_type):

    entry = TC_SQL_TEMP.get(check_mapping_name)

    if entry is None:
        raise KeyError(
            f"No entry found for check='{check_mapping_name}' in TC_SQL_TEMP"
        )

    template = entry.get(database_type)

    if template is None:
        raise KeyError(
            f"No template found for check='{check_mapping_name}' "
            f"engine='{database_type}'"
        )

    return template


# Build lists for multiple columns and a string for single column
def build_columns_sql(field, database_type):

    if isinstance(field, list):
        return ", ".join(
            quote_identifier(col, database_type) for col in field
        )

    return quote_identifier(field, database_type)


# Null condition
def build_null_condition(field, database_type):

    columns = field if isinstance(field, list) else [field]
    conditions = []

    for col in columns:
        conditions.append(
            f"{get_clean_column(col, database_type)} IS NULL"
        )

    return " OR ".join(conditions)


# Not null condition (for duplicate checks)
def build_not_null_condition(field, database_type):

    columns = field if isinstance(field, list) else [field]
    conditions = []

    for col in columns:
        conditions.append(
            f"{get_clean_column(col, database_type)} IS NOT NULL"
        )

    return " AND ".join(conditions)

# Join conditions
def build_join_conditions(field, database_type):

    columns = field if isinstance(field, list) else [field]
    conditions = []

    for col in columns:

        quoted = quote_identifier(col, database_type)
        left_expression  = f"NULLIF(TRIM(t1.{quoted}::TEXT), '')"
        right_expression = f"NULLIF(TRIM(t2.{quoted}::TEXT), '')"
        conditions.append(f"{left_expression} = {right_expression}")

    return " AND ".join(conditions)


# Core executor

# How many rows of the child table are held in memory at once during a cross-connection
# RI scan, and the most distinct parent values we will hold. Past the second limit the
# check fails loudly rather than quietly using gigabytes or comparing against a partial set.
RI_CHILD_CHUNK = 50_000
RI_PARENT_MAX_VALUES = 5_000_000


def find_orphans_across_connections(
    cur, child_schema, child_table, child_column, database_type, row_identifier_column,
    parent_cur, parent_database_type, parent_schema, parent_table, parent_column,
):
    """
    Rows of the child whose value has no match in a parent table on another connection.

    Same comparison as the SQL used on a single connection -- trimmed text, case sensitive,
    a missing value is not a broken reference -- so the result does not depend on which
    way the check happens to be wired.
    """
    parent_values = set()

    parent_cur.execute(
        "SELECT DISTINCT NULLIF(TRIM({col}::TEXT), '') AS v FROM {schema}.{table}".format(
            col=quote_identifier(parent_column, parent_database_type),
            schema=quote_identifier(parent_schema, parent_database_type),
            table=quote_identifier(parent_table, parent_database_type),
        )
    )
    while True:
        chunk = parent_cur.fetchmany(RI_CHILD_CHUNK)
        if not chunk:
            break
        for row in normalize_rows(chunk):
            value = row.get("v")
            if value is not None:
                parent_values.add(str(value))
        if len(parent_values) > RI_PARENT_MAX_VALUES:
            raise ValueError(
                f"The reference table has more than {RI_PARENT_MAX_VALUES:,} distinct values, "
                "which is too many to compare across two connections."
            )

    row_id = (
        "ctid::text" if database_type == "postgresql"
        else quote_identifier(row_identifier_column, database_type) + "::TEXT"
    )

    cur.execute(
        "SELECT {row_id} AS row_identifier, NULLIF(TRIM({col}::TEXT), '') AS actual_value FROM {schema}.{table}".format(
            row_id=row_id,
            col=quote_identifier(child_column, database_type),
            schema=quote_identifier(child_schema, database_type),
            table=quote_identifier(child_table, database_type),
        )
    )

    orphans = []
    while True:
        chunk = cur.fetchmany(RI_CHILD_CHUNK)
        if not chunk:
            break
        for row in normalize_rows(chunk):
            value = row.get("actual_value")
            if value is not None and str(value) not in parent_values:
                orphans.append({"row_identifier": row["row_identifier"], "actual_value": value})

    return orphans


def execute_tc_checks(
    cur,
    table_name,
    field,
    database_type,
    row_identifier_column,
    check_mapping_name,
    logger,
    detail1=None,
    detail2=None,
    detail3=None,
    detail4=None,
    column_order=None,       
    column_datatype=None,
    db_schema="public",
    metadata_map=None,
    ri_parent=None
):

    issue_rows             = 0
    failed_row_identifiers = set()
    failed_details         = {}
    actual_columns         = None
    actual_data_types      = None


    if check_mapping_name in FILE_CHECKS:

        template = get_template(check_mapping_name, database_type)

        try:
            cur.execute(
                template,
                {
                    "db_schema": db_schema.upper() if database_type == "snowflake" else db_schema,
                    "table_name": table_name.upper() if database_type == "snowflake" else table_name,
                }
            )

        except Exception as e:

            logger.log_system(
                code="TC_FILE_CHECK_ERROR",
                severity="CRITICAL",
                message="File availability check failed",
                context={
                    "table":  table_name,
                    "schema": db_schema,
                    "error":  str(e)
                }
            )

            raise RuntimeError(f"File check failed: {str(e)}")

        # If fetchone returns a row the file exists - 0 issues
        # If fetchone returns nothing the file is missing - 1 issue
        issue_rows = 0 if cur.fetchone() else 1

        return issue_rows, failed_row_identifiers, failed_details, None, None

    if check_mapping_name in SCHEMA_CHECKS:

        if not column_order or not column_datatype:
            raise ValueError(
                "column_order and column_datatype are both required "
                "for schema checks"
            )

        cur.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = %(schema)s
              AND table_name   = %(table)s
            ORDER BY ordinal_position
            """,
            {
                "schema": db_schema.upper()  if database_type == "snowflake" else db_schema,
                "table":  table_name.upper() if database_type == "snowflake" else table_name
            }
        )

        rows = cur.fetchall()

        if database_type == "snowflake":
            actual_columns    = [r["COLUMN_NAME"] for r in rows]
            actual_data_types = {r["COLUMN_NAME"]: r["DATA_TYPE"] for r in rows}
        else:
            actual_columns    = [r["column_name"] for r in rows]
            actual_data_types = {r["column_name"]: r["data_type"] for r in rows}

        expected_columns = sorted(column_order, key=column_order.get)

        expected_data_types = column_datatype

        # Count how many expected columns are missing from actual columns
        if check_mapping_name == "column_name_check":
            issue_rows = len(set(expected_columns) - set(actual_columns))

        # Check if column order exactly matches - 0 if match else 1
        elif check_mapping_name == "column_order_check":
            issue_rows = 0 if actual_columns == expected_columns else 1

        # TC004 judges the VALUES, not the column's type name. See datatype_scan.py.
        # issue_rows is a row count (rows with at least one value that does not fit).
        #
        # `actual_data_types` is deliberately replaced by the per-column findings:
        # build_failure_message already receives that slot, and the raw type names
        # are no use to it once the values have been judged.
        elif check_mapping_name == "datatype_check":
            issue_rows, actual_data_types = run_datatype_scan(
                cur, database_type, db_schema, table_name,
                expected_data_types, actual_data_types,
            )

        return (
            issue_rows,
            failed_row_identifiers,
            failed_details,
            actual_columns,
            actual_data_types
        )

    if check_mapping_name in DATA_CHECKS or check_mapping_name in TEMPLATE_DATA_CHECKS:

        template = get_template(check_mapping_name, database_type)

        columns_sql = build_columns_sql(field, database_type)
        null_condition = build_null_condition(field, database_type)
        not_null_condition = build_not_null_condition(field, database_type)
        join_conditions = build_join_conditions(field, database_type)

        params = {}

        if check_mapping_name == "ri_check":

            # Get parent table schema from metadata using connection id
            ri_connection_id = detail1
            parent_schema    = metadata_map[ri_connection_id]["db_schema"]

            if ri_parent is not None:
                # The parent lives on a different connection, so it does not exist on
                # this cursor and a join cannot reach it. The parent's distinct values are
                # read through ITS connection; the child is then scanned here in bounded
                # chunks and anything without a parent is collected. Nothing is written to
                # either database.
                cross_rows = find_orphans_across_connections(
                    cur, db_schema, table_name, field, database_type, row_identifier_column,
                    ri_parent["cursor"], ri_parent["database_type"], parent_schema, detail2, detail3,
                )
                query = None
            else:
                query  = template.format(
                child_schema=quote_identifier(db_schema, database_type),
                child_table=quote_identifier(table_name, database_type),
                child_column=quote_identifier(field, database_type),
                parent_schema=quote_identifier(parent_schema, database_type),
                    parent_table=quote_identifier(detail2, database_type),
                    parent_column=quote_identifier(detail3, database_type),
                    row_identifier_column=quote_identifier(
                        row_identifier_column, database_type
                    )
                )
            params = {}
            
        elif check_mapping_name == "null_check":

            # Normalise field to list so we can check multiple columns
            fields_to_check  = field if isinstance(field, list) else [field]
            # Assuming DB enforces NOT NULL on all columns
            db_enforces_not_null = True

            for col in fields_to_check:

                cur.execute(
                    """
                    SELECT is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = %s
                      AND table_name   = %s
                      AND column_name  = %s
                    """,
                    (
                        db_schema.upper()  if database_type == "snowflake" else db_schema,
                        table_name.upper() if database_type == "snowflake" else table_name,
                        col.upper()        if database_type == "snowflake" else col
                    )
                )

                nullable_info = cur.fetchone()

                # Snowflake returns uppercase key
                # PostgreSQL returns lowercase key
                if database_type == "snowflake":
                    nullable_key = "IS_NULLABLE"
                else:
                    nullable_key = "is_nullable"

                # Run the check
                if nullable_info is None:
                    db_enforces_not_null = False
                    break

                # Column found but allows NULL, run the check
                elif nullable_info[nullable_key] == "YES":
                    db_enforces_not_null = False
                    break

                # Column found and is NOT NULL 
                elif nullable_info[nullable_key] == "NO":
                    continue

            # If not null contraint exists return
            if db_enforces_not_null:
                return 0, [], {}, None, None

            query  = template.format(
                schema=quote_identifier(db_schema, database_type),
                table=quote_identifier(table_name, database_type),
                null_condition=null_condition,
                row_identifier_column=quote_identifier(
                    row_identifier_column, database_type
                )
            )
            params = {}

        elif check_mapping_name == "duplicate_check":

            query  = template.format(
                schema=quote_identifier(db_schema, database_type),
                table=quote_identifier(table_name, database_type),
                columns=columns_sql,
                not_null_condition=not_null_condition,
                join_conditions=join_conditions,
                row_identifier_column=quote_identifier(
                    row_identifier_column, database_type
                )
            )
        
            params = {}

        elif check_mapping_name == "lov_check":

            # Convert detail1 string into a Python list
            allowed_values = parse_lov_values(detail1)

            if database_type == "postgresql":

                # Pass whole list as single parameter
                params = {"allowed_values": allowed_values}

                query = template.format(
                    schema=quote_identifier(db_schema, database_type),
                    table=quote_identifier(table_name, database_type),
                    column=get_clean_column(field, database_type),
                    row_identifier_column=quote_identifier(
                        row_identifier_column, database_type
                    )
                )
                
            else:

                placeholders = ", ".join(
                    f"%(lov_{i})s" for i in range(len(allowed_values))
                )

                params = {
                    f"lov_{i}": val
                    for i, val in enumerate(allowed_values)
                }

                # Build query with lov_placeholders injected into IN clause
                query = template.format(
                    schema=quote_identifier(db_schema, database_type),
                    table=quote_identifier(table_name, database_type),
                    column=get_clean_column(field, database_type),
                    row_identifier_column=quote_identifier(
                        row_identifier_column, database_type
                    ),
                    lov_placeholders=placeholders
                )
                
        elif check_mapping_name == "length_check":

            # Convert expected length from string to integer for SQL
            params = {"expected_length": int(detail1)}

            query  = template.format(
                schema=quote_identifier(db_schema, database_type),
                table=quote_identifier(table_name, database_type),
                column=get_clean_column(field, database_type),
                row_identifier_column=quote_identifier(
                    row_identifier_column, database_type
                )
            )

        elif check_mapping_name == "format_check":

            # Pass regex pattern as string parameter to SQL query
            params = {"regex_pattern": detail1}

            query  = template.format(
                schema=quote_identifier(db_schema, database_type),
                table=quote_identifier(table_name, database_type),
                column=get_clean_column(field, database_type),
                row_identifier_column=quote_identifier(
                    row_identifier_column, database_type
                )
            )


        if query is None:
            # Cross-connection RI already produced its orphans.
            normalised_rows = cross_rows
        else:
            cur.execute(query, params)

            # Fetch all rows that failed the check
            rows = cur.fetchall()
            normalised_rows = normalize_rows(rows)

        # Loop through every failed row
        for row in normalised_rows:

            row_identifier = str(row["row_identifier"])

            if check_mapping_name == "length_check":
                expected_value = detail1
                actual_value = row.get("actual_length")
                failed_details[row_identifier] = orjson.dumps({
                    "expected_length": expected_value,
                    "actual_length":   actual_value
                }).decode("utf-8")

            elif check_mapping_name == "format_check":
                expected_value = detail1
                actual_value   = row.get("actual_value")
                failed_details[row_identifier] = orjson.dumps({
                    "expected_format": expected_value,
                    "actual_value": actual_value
                }).decode("utf-8")

            elif check_mapping_name == "lov_check":
                expected_value = parse_lov_values(detail1)
                actual_value   = row.get("actual_value")
                failed_details[row_identifier] = orjson.dumps({
                    "expected_lovs": expected_value,
                    "actual_value":  actual_value
                }).decode("utf-8")

            # RI check - value does not exist in parent table
            elif check_mapping_name == "ri_check":
                actual_value = row.get("actual_value")
                failed_details[row_identifier] = orjson.dumps({
                    "expected":   "Value should exist in parent table",
                    "actual_value": actual_value
                }).decode("utf-8")


            failed_row_identifiers.add(row_identifier)

    issue_rows = len(failed_row_identifiers)

    return (
        issue_rows,
        list(failed_row_identifiers),
        failed_details,
        None,
        None
    )


def run_tc_checks(
    cur,
    table_name,
    field,
    database_type,
    row_identifier_column,
    check_mapping_name,
    logger,
    config_id,
    config_name,
    check_id,
    check_name,
    check_description,
    check_category,
    workstream,
    data_source,
    criticality,
    impacted_downstream,
    abort,
    job_id,
    total_rows,
    detail1=None,
    detail2=None,
    detail3=None,
    detail4=None,
    column_order=None,
    column_datatype=None,
    db_schema="public",
    metadata_map=None,
    user_id=None,
    ri_parent=None
):
    # Log the start of this check with context for debugging and auditing
    logger.log_system(
        code="TC_CHECK_START",
        severity="INFO",
        message=f"Starting check {check_mapping_name}",
        context={
            "config_id": config_id,
            "table":     table_name,
            "column":    field,
            "schema":    db_schema
        }
    )

    actual_columns    = None
    actual_data_types = None
    # Empty dict to collect per row failure messages
    failed_details    = {}

    if check_mapping_name not in ALL_CHECKS:
        raise ValueError(f"Invalid check name: {check_mapping_name}")

    if check_mapping_name in SCHEMA_CHECKS and (not column_order or not column_datatype):
        raise ValueError("column_order and column_datatype are both required for schema checks")

    # Data checks must have a column name to operate on
    if check_mapping_name in DATA_CHECKS and not field:
        raise ValueError("Column name required")

    if check_mapping_name == "primary_key_check":

        # Run null check - grab only the failed row list
        _, null_failed, _, _, _ = execute_tc_checks(
            cur, table_name, field, database_type, row_identifier_column,
            "null_check", logger, db_schema=db_schema
        )

        # Run duplicate check - grab only the failed row list
        _, dup_failed, _, _, _ = execute_tc_checks(
            cur, table_name, field, database_type, row_identifier_column,
            "duplicate_check", logger, db_schema=db_schema
        )

        # Union both sets to get unique list of all rows that failed either check
        failed_row_identifiers = list(set(null_failed) | set(dup_failed))
        # Count combined unique failures
        issue_rows = len(failed_row_identifiers)
        # No per row messages for PK check
        failed_details = {}
        failed_ids = failed_row_identifiers


    else:

        (
            issue_rows,
            failed_row_identifiers,
            failed_details,
            actual_columns,
            actual_data_types
        ) = execute_tc_checks(
            cur, table_name, field, database_type, row_identifier_column,
            check_mapping_name, logger,
            detail1, detail2, detail3, detail4, column_order, column_datatype,
            db_schema, metadata_map, ri_parent
        )

        failed_ids = failed_row_identifiers

    if issue_rows == 0:
        message = "Check successfully passed"
        passed_rows = total_rows

    # At least one row failed - build detailed failure summary
    else:
        message = build_failure_message(
            check_mapping_name, table_name, field, db_schema,
            issue_rows, detail1, actual_columns, actual_data_types, column_order, column_datatype,
            detail2=detail2, detail3=detail3
        )

 
    # TC002 (names) and TC003 (order) inspect only the table definition, so a row
    # count means nothing for them. TC004 reads values and does have one.
    if check_mapping_name == "datatype_check":
        passed_rows = total_rows - issue_rows
        # Several columns can be involved, so none is the field. NULL, not "NA":
        # the results table documents NULL as "not about one column".
        field       = None

    elif check_mapping_name in SCHEMA_CHECKS or check_mapping_name in FILE_CHECKS:
        issue_rows  = "NA"
        passed_rows = "NA"
        # No single column for schema checks
        field       = None
        
    else:
        passed_rows = total_rows - issue_rows

    result = {
        "job_id":job_id,
        "job_timestamp":datetime.now(timezone.utc),
        "check_id":check_id,
        "check_name":check_name,
        "check_description":check_description,
        "config_id":config_id,
        "config_name":config_name,
        "check_category":check_category,
        "workstream":workstream,
        "data_source":data_source,
        "impacted_downstream":impacted_downstream,
        "file_or_table_name":table_name,
        "field":field,
        # "traditional", not "conformance": the results table is queried across
        # check families, and each family using its own word for its own type
        # means any cross-family filter silently misses one of them.
        "check_type":"traditional",
        "check_status": (
            "passed"
            if message == "Check successfully passed"
            else "failed"
        ),
        "criticality":criticality,
        "abort":abort,
        "issue_rows":issue_rows,
        "passed_rows":passed_rows,
        "failure_reason":message,
        "issue_status":   "open",
        "user_id":        user_id
    }

    return (
        result,          
        failed_ids,      
        failed_details,  
        actual_columns,  
        actual_data_types  
    )