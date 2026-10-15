"""
One place that knows how data types line up across the three vocabularies in play:

  * DECLARED  -- what a person types or uploads in a schema file ("int", "Number(10,2)")
  * POSTGRES  -- information_schema.columns.data_type ("character varying")
  * SNOWFLAKE -- information_schema.columns.DATA_TYPE ("TEXT", "NUMBER")

Everything is reduced to six FAMILIES. A declared type and a native type agree
when they are in the same family, or when the native one is strictly narrower
(an integer column satisfies a declared float).

The old datatype check compared the declared string to the database's own type
name with `!=`, so "varchar" never equalled "character varying" and a perfectly
healthy table failed TC004 -- and because TC004 is an abort gate, that false
failure took every row-level check down with it as "upstream_failed".

Nothing in this module touches a database.
"""

from __future__ import annotations

import re

TEXT = "text"
INTEGER = "integer"
FLOAT = "float"
DATE = "date"
DATETIME = "datetime"
BOOLEAN = "boolean"

FAMILIES = (TEXT, INTEGER, FLOAT, DATE, DATETIME, BOOLEAN)

# A native type that fits none of the families (uuid, json, bytea, arrays...).
# It is still scanned by its text rendering rather than being waved through.
OTHER = "other"


# ---------------------------------------------------------------------------
# Declared types: what users write.
# ---------------------------------------------------------------------------
_DECLARED_ALIASES = {
    TEXT: (
        "string", "str", "text", "varchar", "char", "character", "character varying",
        "nvarchar", "nchar", "clob", "bpchar",
    ),
    INTEGER: (
        "integer", "int", "int2", "int4", "int8", "smallint", "bigint", "tinyint",
        "mediumint", "long", "short",
    ),
    # "number" and "decimal" are ambiguous (NUMBER(38,0) is an integer in Snowflake),
    # so they land here: a float declaration accepts whole numbers as well.
    FLOAT: (
        "float", "float4", "float8", "real", "double", "double precision",
        "decimal", "numeric", "number", "dec", "fixed",
    ),
    DATE: ("date",),
    DATETIME: (
        "datetime", "timestamp", "timestamptz", "timestamp_ntz", "timestamp_ltz",
        "timestamp_tz", "timestamp without time zone", "timestamp with time zone",
    ),
    BOOLEAN: ("boolean", "bool"),
}

_DECLARED_LOOKUP = {alias: family for family, aliases in _DECLARED_ALIASES.items() for alias in aliases}

_PARAMS = re.compile(r"\s*\(.*\)\s*$")


def normalize_type_name(raw: str | None) -> str:
    """'  Number(10, 2) ' -> 'number'. Drops precision/length and collapses spaces."""
    if raw is None:
        return ""

    return " ".join(_PARAMS.sub("", str(raw)).strip().lower().split())


def declared_family(raw: str | None) -> str | None:
    """Family for a user-declared type, or None when it is not recognised."""
    return _DECLARED_LOOKUP.get(normalize_type_name(raw))


# ---------------------------------------------------------------------------
# Native types: what the database reports.
# ---------------------------------------------------------------------------
_NATIVE = {
    "postgresql": {
        TEXT: ("character varying", "character", "text", "citext", "name", "bpchar"),
        INTEGER: ("integer", "bigint", "smallint"),
        FLOAT: ("numeric", "real", "double precision", "money"),
        DATE: ("date",),
        DATETIME: ("timestamp without time zone", "timestamp with time zone"),
        BOOLEAN: ("boolean",),
    },
    "snowflake": {
        TEXT: ("text", "varchar", "char", "character", "string"),
        # Snowflake reports every numeric as NUMBER, integer or not. Treating it as
        # FLOAT is the safe reading: a declared integer then gets scanned instead of
        # being waved through on a type name that cannot tell the two apart.
        INTEGER: (),
        FLOAT: ("number", "float", "float4", "float8", "real", "double", "decimal", "numeric", "fixed"),
        DATE: ("date",),
        DATETIME: ("timestamp_ntz", "timestamp_ltz", "timestamp_tz", "timestamp", "datetime"),
        BOOLEAN: ("boolean",),
    },
}

_NATIVE_LOOKUP = {
    dialect: {name: family for family, names in families.items() for name in names}
    for dialect, families in _NATIVE.items()
}


def dialect_of(database_type: str) -> str:
    value = (database_type or "").lower()

    if value in ("postgres", "postgresql"):
        return "postgresql"

    if value == "snowflake":
        return "snowflake"

    raise ValueError(f"Unsupported database type: {database_type!r}")


def native_family(db_type: str | None, database_type: str) -> str:
    """Family for a type name as reported by the database; OTHER if unknown."""
    return _NATIVE_LOOKUP[dialect_of(database_type)].get(normalize_type_name(db_type), OTHER)


# What a native family satisfies without reading a single value.
_SATISFIES = {
    INTEGER: {INTEGER},
    FLOAT: {INTEGER, FLOAT},
    DATE: {DATE},
    DATETIME: {DATETIME, DATE},
    BOOLEAN: {BOOLEAN},
}


def needs_value_scan(declared: str, native: str) -> bool:
    """
    False when the answer is already known from the column definition.

    TEXT is never scanned: any value, digits included, is valid text. A natively
    compatible column cannot contain a value that fails to coerce, so scanning it
    would only cost a table read to learn nothing.
    """
    if declared == TEXT:
        return False

    return native not in _SATISFIES[declared]


# ---------------------------------------------------------------------------
# Value predicates.
#
# Every predicate is TRUE for a value that is PRESENT and NOT coercible. NULL and
# blank are not judged here -- they are the null check's business, and a column
# that is half empty should not also be reported as full of bad types.
#
# One regex source serves both dialects, which is deliberate: it is what keeps
# "valid integer" meaning the same thing on Postgres and Snowflake. It contains no
# backslashes (Snowflake treats them as string escapes) and is anchored (Postgres
# regexes are unanchored by default; Snowflake's are implicitly anchored).
# ---------------------------------------------------------------------------
_DATE_PART = "[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"
_TIME_PART = "([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?"

_PATTERNS = {
    # A fractional part of all zeros is still a whole number (numeric(10,2) renders 12.00).
    INTEGER: "^[+-]?[0-9]+([.]0+)?$",
    FLOAT: "^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]+)?$",
    # A date column holding midnight timestamps is still a date.
    DATE: f"^{_DATE_PART}([ T]00:00(:00([.]0+)?)?)?$",
    DATETIME: f"^{_DATE_PART}([ T]{_TIME_PART})?(Z|[+-][0-9]{{2}}(:?[0-9]{{2}})?)?$",
}

_BOOLEAN_WORDS = ("true", "false", "t", "f", "yes", "no", "y", "n", "1", "0")


def quote_ident(name: str, database_type: str) -> str:
    """Quote an identifier, escaping embedded double quotes. Snowflake folds to upper case."""
    folded = name.upper() if dialect_of(database_type) == "snowflake" else name
    return '"' + folded.replace('"', '""') + '"'


def text_of(column_sql: str, database_type: str) -> str:
    if dialect_of(database_type) == "snowflake":
        return f"TO_VARCHAR({column_sql})"

    return f"CAST({column_sql} AS TEXT)"


def bad_value_predicate(family: str, column_sql: str, database_type: str) -> str:
    """SQL boolean: the value is present and does NOT coerce to `family`."""
    if family not in _PATTERNS and family != BOOLEAN:
        raise ValueError(f"No value predicate for family {family!r}")

    dialect = dialect_of(database_type)
    trimmed = f"TRIM({text_of(column_sql, database_type)})"
    present = f"({column_sql} IS NOT NULL AND {trimmed} <> '')"

    if family == BOOLEAN:
        words = ", ".join(f"'{word}'" for word in _BOOLEAN_WORDS)
        ok = f"LOWER({trimmed}) IN ({words})"
    elif dialect == "snowflake":
        ok = f"REGEXP_LIKE({trimmed}, '{_PATTERNS[family]}')"
    else:
        ok = f"{trimmed} ~ '{_PATTERNS[family]}'"

    return f"({present} AND NOT ({ok}))"


def build_scan_sql(schema: str, table: str, specs: list[tuple[str, str]], database_type: str) -> str:
    """
    One table read for every column that needs scanning.

    `specs` is [(column_name, family), ...]. Result columns are positional --
    any_bad, then c0/s0, c1/s1, ... -- so identifier quoting and Snowflake's
    upper-casing of aliases never matter:

        any_bad : rows with at least one bad value (a row is counted once)
        cN      : bad values in column N
        sN      : one example of a bad value in column N
    """
    if not specs:
        raise ValueError("build_scan_sql needs at least one column")

    predicates = []
    selects = []

    for index, (column, family) in enumerate(specs):
        column_sql = quote_ident(column, database_type)
        bad = bad_value_predicate(family, column_sql, database_type)

        predicates.append(bad)
        selects.append(f"SUM(CASE WHEN {bad} THEN 1 ELSE 0 END) AS c{index}")
        selects.append(f"MIN(CASE WHEN {bad} THEN {text_of(column_sql, database_type)} END) AS s{index}")

    any_bad = " OR ".join(predicates)

    return (
        f"SELECT SUM(CASE WHEN {any_bad} THEN 1 ELSE 0 END) AS any_bad, "
        + ", ".join(selects)
        + f" FROM {quote_ident(schema, database_type)}.{quote_ident(table, database_type)}"
    )
