"""
TC004 (datatype_check): do the VALUES fit the declared type?

It used to compare the declared type name with the database's own type name. That
answers "was the column defined this way", which is a different question from the
one a quality check exists to ask -- "can this data be used as an integer". A text
column full of integers is usable as an integer; an integer column cannot hold
anything that is not one. Only the values can tell, so the values are read.

Rules, per declared column:

  * declared text            -> always passes. Any value, digits included, is text.
  * native type compatible   -> passes without reading. It cannot hold a bad value
                                (an integer column; a NUMBER(10,0); a boolean column).
  * anything else            -> every non-null, non-blank value must coerce to the
                                declared type, whatever the column is defined as.

The result is a COUNT, like the null check's: how many rows have a value that does not fit,
and how many do not. It never stops the other checks -- only the file / column-name /
column-order checks do that. Files are staged as text, so every cell of a file is read here.

The declared type is never judged against the column's type NAME.
"""

from __future__ import annotations

from trad_ct_id.type_mapping import (
    SKIP,
    build_scan_sql,
    declared_family,
    normalize_type_name,
    plan_column,
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

    # Precision and scale tell NUMBER(10,0) (whole numbers only) from NUMBER(10,2). They are
    # only fetched when a declared integer sits on a numeric column, the one case they decide.
    numeric_scale = _numeric_details(cur, database_type, db_schema, table_name, expected_data_types, actual_by_name)

    to_scan = []  # (column as it exists, plan, native type name)
    unsupported = []

    for declared_column, declared_type in expected_data_types.items():
        if declared_family(declared_type) is None:
            unsupported.append(f'"{declared_column}" ({declared_type})')
            continue

        found = actual_by_name.get(str(declared_column).lower())

        if found is None:
            continue

        actual_name, actual_type = found
        precision, scale = numeric_scale.get(str(declared_column).lower(), (None, None))
        plan = plan_column(declared_type, actual_type, precision, scale, database_type)

        if plan.mode != SKIP:
            to_scan.append((actual_name, plan, actual_type))

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
        [(name, plan, native) for name, plan, native in to_scan],
        database_type,
    )

    cur.execute(sql)
    row = cur.fetchone()

    # Snowflake upper-cases the aliases; Postgres lower-cases them.
    values = {str(key).lower(): value for key, value in dict(row).items()}

    issue_rows = int(values.get("any_bad") or 0)
    findings = {}

    for index, (name, plan, _native) in enumerate(to_scan):
        bad = int(values.get(f"c{index}") or 0)

        if bad:
            findings[name] = {
                "declared": plan.declared,
                "family": plan.family,
                "bad": bad,
                "sample": values.get(f"s{index}"),
            }

    return issue_rows, findings


def _numeric_details(cur, database_type, db_schema, table_name, expected_data_types, actual_by_name):
    """{column (lower): (precision, scale)} for declared integers on numeric columns."""
    wanted = set()

    for declared_column, declared_type in expected_data_types.items():
        found = actual_by_name.get(str(declared_column).lower())

        if found is None or declared_family(declared_type) != "integer":
            continue

        if normalize_type_name(found[1]) in ("numeric", "number", "decimal", "fixed"):
            wanted.add(str(declared_column).lower())

    if not wanted:
        return {}

    snowflake = (database_type or "").lower() == "snowflake"

    cur.execute(
        """
        SELECT column_name, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = %(schema)s AND table_name = %(table)s
        """,
        {
            "schema": db_schema.upper() if snowflake else db_schema,
            "table": table_name.upper() if snowflake else table_name,
        },
    )

    details = {}

    for row in cur.fetchall():
        row = {str(key).lower(): value for key, value in dict(row).items()}
        name = str(row["column_name"]).lower()

        if name in wanted:
            details[name] = (row.get("numeric_precision"), row.get("numeric_scale"))

    return details
