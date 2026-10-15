"""
TC004 (datatype_check): do the VALUES fit the declared type?

It used to compare the declared type name with the database's own type name. That
answers "was the column defined this way", which is a different question from the
one a quality check exists to ask -- "can this data be used as an integer". A text
column full of integers is usable as an integer; an integer column cannot hold
anything that is not one. Only the values can tell, so the values are read.

Rules, per declared column:

  * declared text            -> always passes. Any value, digits included, is text.
  * native type compatible   -> passes without reading. It cannot hold a bad value.
  * anything else            -> every non-null, non-blank value must coerce to the
                                declared type, whatever the column is defined as.

The declared type is never judged against the column's type NAME.
"""

from __future__ import annotations

from trad_ct_id.type_mapping import (
    build_scan_sql,
    declared_family,
    native_family,
    needs_value_scan,
)


class UnsupportedDeclaredType(ValueError):
    """A schema file asked for a type this engine has no mapping for."""


def run_datatype_scan(cur, database_type, db_schema, table_name, expected_data_types, actual_data_types):
    """
    Returns (issue_rows, findings).

    issue_rows : rows with at least one value that does not fit, each counted once
                 no matter how many of its columns are bad.
    findings   : {column: {"declared", "bad", "sample"}} for failing columns only.

    Columns the table does not have are skipped -- TC002 (column_name_check) owns
    reporting those, and reporting them twice just doubles the noise.
    """
    snowflake = (database_type or "").lower() == "snowflake"

    # Snowflake reports upper-case names while schema files are usually lower-case.
    # Comparing them as-is made every column look wrong on Snowflake.
    actual_by_name = {str(name).lower(): (name, dtype) for name, dtype in (actual_data_types or {}).items()}

    to_scan: list[tuple[str, str, str]] = []  # (column as it exists, family, declared as written)
    unsupported = []

    for declared_column, declared_type in expected_data_types.items():
        family = declared_family(declared_type)

        if family is None:
            unsupported.append(f'"{declared_column}" ({declared_type})')
            continue

        found = actual_by_name.get(str(declared_column).lower())

        if found is None:
            continue

        actual_name, actual_type = found

        if needs_value_scan(family, native_family(actual_type, database_type)):
            to_scan.append((actual_name, family, str(declared_type)))

    if unsupported:
        raise UnsupportedDeclaredType(
            "Unsupported declared data type for " + ", ".join(unsupported) +
            ". Use one of: string, integer, float, date, datetime, boolean."
        )

    if not to_scan:
        return 0, {}

    sql = build_scan_sql(
        db_schema,
        table_name,
        [(name, family) for name, family, _ in to_scan],
        database_type,
    )

    cur.execute(sql)
    row = cur.fetchone()

    # Snowflake upper-cases the aliases; Postgres lower-cases them.
    values = {str(key).lower(): value for key, value in dict(row).items()}

    issue_rows = int(values.get("any_bad") or 0)
    findings = {}

    for index, (name, family, declared) in enumerate(to_scan):
        bad = int(values.get(f"c{index}") or 0)

        if bad:
            findings[name] = {
                "declared": declared,
                "family": family,
                "bad": bad,
                "sample": values.get(f"s{index}"),
            }

    return issue_rows, findings
