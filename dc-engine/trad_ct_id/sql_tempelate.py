# Central store for all DQ check SQL templates

TC_SQL_TEMP = {
    # DATA CHECKS

    
    "null_check": {

        "postgresql": """
            SELECT ctid::text AS row_identifier
            FROM {schema}.{table}
            WHERE {null_condition}
        """,

        "snowflake": """
            SELECT {row_identifier_column}::TEXT AS row_identifier
            FROM {schema}.{table}
            WHERE {null_condition}
        """
    },

    "length_check": {

        "postgresql": """
            SELECT
                ctid::text AS row_identifier,
                LENGTH({column}::TEXT) AS actual_length
            FROM {schema}.{table}
            WHERE {column} IS NULL
               OR LENGTH({column}::TEXT) NOT BETWEEN %(min_length)s AND %(max_length)s
        """,

        "snowflake": """
            SELECT
                {row_identifier_column}::TEXT AS row_identifier,
                LENGTH({column}::TEXT) AS actual_length
            FROM {schema}.{table}
            WHERE {column} IS NULL
               OR LENGTH({column}::TEXT) NOT BETWEEN %(min_length)s AND %(max_length)s
        """
    },

    "format_check": {

        "postgresql": """
            SELECT
                ctid::text AS row_identifier,
                {column}::TEXT AS actual_value
            FROM {schema}.{table}
            WHERE {column} IS NULL
               OR {column} !~ %(regex_pattern)s
        """,

        "snowflake": """
            SELECT
                {row_identifier_column}::TEXT AS row_identifier,
                {column}::TEXT AS actual_value
            FROM {schema}.{table}
            WHERE {column} IS NULL
               OR NOT REGEXP_LIKE({column}::TEXT, %(regex_pattern)s)
        """
    },

    "lov_check": {

        "postgresql": """
            SELECT
                ctid::text AS row_identifier,
                {column}::TEXT AS actual_value
            FROM {schema}.{table}
            WHERE {column} IS NULL
               OR {column} <> ALL(%(allowed_values)s)
        """,

        "snowflake": """
            SELECT
                {row_identifier_column}::TEXT AS row_identifier,
                {column}::TEXT AS actual_value
            FROM {schema}.{table}
            WHERE {column} IS NULL
               OR {column} NOT IN ({lov_placeholders})
        """
    },

    "duplicate_check": {

        "postgresql": """
            SELECT t1.ctid::text AS row_identifier
            FROM {schema}.{table} t1
            JOIN (
                SELECT {columns}
                FROM {schema}.{table}
                WHERE {not_null_condition}
                GROUP BY {columns}
                HAVING COUNT(*) > 1
            ) t2
            ON {join_conditions}
        """,

        "snowflake": """
            SELECT t1.{row_identifier_column}::TEXT AS row_identifier
            FROM {schema}.{table} t1
            JOIN (
                SELECT {columns}
                FROM {schema}.{table}
                WHERE {not_null_condition}
                GROUP BY {columns}
                HAVING COUNT(*) > 1
            ) t2
            ON {join_conditions}
        """
    },

    "ri_check": {

        "postgresql": """
            SELECT
                child.ctid::text AS row_identifier,
                NULLIF(TRIM(child.{child_column}::TEXT), '') AS actual_value
            FROM {child_schema}.{child_table} child
            WHERE NULLIF(TRIM(child.{child_column}::TEXT), '') IS NOT NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM {parent_schema}.{parent_table} parent
                    WHERE NULLIF(TRIM(parent.{parent_column}::TEXT), '')
                          =
                          NULLIF(TRIM(child.{child_column}::TEXT), '')
               )
        """,

        "snowflake": """
            SELECT
                child.{row_identifier_column}::TEXT AS row_identifier,
                NULLIF(TRIM(child.{child_column}::TEXT), '') AS actual_value
            FROM {child_schema}.{child_table} child
            WHERE NULLIF(TRIM(child.{child_column}::TEXT), '') IS NOT NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM {parent_schema}.{parent_table} parent
                    WHERE NULLIF(TRIM(parent.{parent_column}::TEXT), '')
                          =
                          NULLIF(TRIM(child.{child_column}::TEXT), '')
               )
        """
    },

    # SCHEMA CHECKS
    
    # Checks if all expected columns exist in the table
    "column_name_check": {

        "postgresql": """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
            ORDER BY column_name
        """,

        "snowflake": """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
            ORDER BY column_name
        """
    },
    
    # Checks if columns appear in the correct order
    "column_order_check": {

        "postgresql": """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
            ORDER BY ordinal_position
        """,

        "snowflake": """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
            ORDER BY ordinal_position
        """
    },
    
    # # Checks if column data types match the expected schema
    "datatype_check": {

        "postgresql": """
            SELECT
                column_name,
                data_type
            FROM information_schema.columns
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
        """,

        "snowflake": """
            SELECT
                column_name,
                data_type
            FROM information_schema.columns
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
        """
    },

    # FILE CHECKS
    # Checks if the source table exists in the database
    "file_availability_check": {

        "postgresql": """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
        """,

        "snowflake": """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = %(db_schema)s
              AND table_name = %(table_name)s
        """
    }

}