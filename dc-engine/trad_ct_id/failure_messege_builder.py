def build_failure_message(
    check_mapping_name,
    table_name,
    column_name,
    db_schema,
    issue_rows,
    detail1,
    actual_columns=None,
    actual_data_types=None,
    column_order=None,       
    column_datatype=None,
    detail2=None,
    detail3=None,
):
    if check_mapping_name == "file_availability_check":
        return f"Table not found in schema {db_schema}: {table_name}"

    elif check_mapping_name == "column_name_check":

        if not column_order:
            raise ValueError("column_order is missing")

        # Fetch keys of colum_order to get column_name
        expected_columns = list(column_order.keys())
        actual_columns = actual_columns

        # Ordered as declared. A set difference came back in a different order on
        # every run, so the same failure produced a different message each time.
        actual_set = set(actual_columns)
        missing_cols = [col for col in expected_columns if col not in actual_set]

        return "Missing columns " + ", ".join(f'"{col}"' for col in missing_cols) + " from expected schema"

    elif check_mapping_name == "column_order_check":

        if not column_order:
            raise ValueError("column_order is missing")

        if actual_columns is None:
            raise ValueError("Actual columns not fetched")
        
        # Sort columns as per column order 
        expected_columns = sorted(column_order, key=column_order.get)
        actual_columns = actual_columns

        mismatches = []
        # loop throught expected and actual columns 
        for i, (exp, act) in enumerate(zip(expected_columns, actual_columns)):
            if exp != act:
                mismatches.append(
                    f'position {i+1} expected "{exp}" but found "{act}"'
                )

        return f"Column order mismatch in table {table_name}: " + ", ".join(mismatches)

    elif check_mapping_name == "datatype_check":

        if actual_data_types is None:
            raise ValueError("Datatype findings were not produced")

        # `actual_data_types` is the per-column findings from datatype_scan, not raw
        # type names: {column: {"declared", "bad", "sample"}}, failing columns only.
        parts = []
        for col, finding in actual_data_types.items():
            sample = finding.get("sample")
            example = f', e.g. "{sample}"' if sample not in (None, "") else ""
            parts.append(
                f'"{col}" (expected {finding["declared"]}): '
                f'{finding["bad"]} value(s) cannot be read as {finding["declared"]}{example}'
            )

        return (
            f"Values do not match the expected data types in table {table_name}: "
            + "; ".join(parts)
        )

    elif check_mapping_name == "length_check":
        return f"Length of {detail1} was expected, but {issue_rows} rows were found with mismatched values"

    elif check_mapping_name == "format_check":
        return f"{issue_rows} rows do not match the expected format {detail1}"

    elif check_mapping_name == "lov_check":
        return f"{issue_rows} rows contain values outside the allowed list {detail1}"

    elif check_mapping_name == "null_check":
        return f"No null values were expected, but {issue_rows} rows were found with null values"

    elif check_mapping_name == "duplicate_check":
        return f"Unique values were expected, but {issue_rows} rows were found with duplicate values"

    elif check_mapping_name == "primary_key_check":
        # "Primary Key constraint is failing" was wrong twice over: nothing here reads a
        # constraint (the check scans the values), and it told the reader neither how
        # many rows were affected nor what was actually wrong with them.
        field_text = (
            ", ".join(f'"{col}"' for col in column_name)
            if isinstance(column_name, (list, tuple))
            else f'"{column_name}"'
        )

        return (
            f"{field_text} must be unique and never empty, but {issue_rows} row(s) "
            f"are duplicated or blank"
        )

    elif check_mapping_name == "ri_check":
        # Name the parent, so the reader knows where the missing records should be.
        parent = f' in "{detail2}"."{detail3}"' if detail2 and detail3 else " in the parent table"
        return (
            f'{issue_rows} row(s) have a "{column_name}" value that does not exist{parent}'
        )

    # Reached only if a check is added without giving it a message. It used to print
    # the internal variable name ("...for check_mapping_name null_check"), which is the
    # engine talking to itself in front of the reader.
    return f"{issue_rows} row(s) did not pass this check"