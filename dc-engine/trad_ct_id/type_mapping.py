"""
One place that knows how data types line up across the vocabularies in play:

  * DECLARED  -- what a person types or uploads in a schema file ("int", "Number(10,2)")
  * POSTGRES  -- information_schema.columns.data_type ("character varying")
  * SNOWFLAKE -- information_schema.columns.DATA_TYPE ("TEXT", "NUMBER")
  * FILES     -- every cell of a file is text; see Data_Code/connectors/file/manager.py

Everything is reduced to six FAMILIES. The data-type check (TC004) then asks, per column,
one question: do the VALUES fit the declared type? The column's own type is used only to
skip reading a column that cannot hold a bad value. See `plan_column` for the decision and
documentation/datatype-check.md for the full rules.

The old check compared the declared type name with the database's own type name with `!=`,
so "varchar" never equalled "character varying" and a healthy table failed TC004.

Nothing in this module touches a database.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

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

# The largest whole number the engines can hold in NUMBER / NUMERIC(p,0) columns.
MAX_INTEGER_DIGITS = 38


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

# A declared integer that NAMES a width is held to it. "integer" and "int" are not given
# one: files report every whole number as "integer", so a 32-bit reading would fail values
# that are perfectly good whole numbers.
_INTEGER_BITS = {
    "tinyint": 8,
    "smallint": 16, "int2": 16, "short": 16,
    "mediumint": 24,
    "int4": 32,
    "bigint": 64, "int8": 64, "long": 64,
}

_PARAMS = re.compile(r"\s*\(.*\)\s*$")


def normalize_type_name(raw: str | None) -> str:
    """'  Number(10, 2) ' -> 'number'. Drops precision/length and collapses spaces."""
    if raw is None:
        return ""

    return " ".join(_PARAMS.sub("", str(raw)).strip().lower().split())


def declared_family(raw: str | None) -> str | None:
    """Family for a user-declared type, or None when it is not recognised."""
    return _DECLARED_LOOKUP.get(normalize_type_name(raw))


def declared_integer_bits(raw: str | None) -> int | None:
    """Width a declared integer names (smallint -> 16), or None for a plain integer."""
    return _INTEGER_BITS.get(normalize_type_name(raw))


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
        # Snowflake reports every numeric as NUMBER, integer or not. NUMBER(p,0) is
        # recognised from its scale in `native_integer_bits`; by name alone it is FLOAT,
        # the safe reading, so a declared integer is scanned rather than waved through.
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


def _bits_for_digits(precision: int) -> int:
    """Smallest signed width that holds every whole number of `precision` digits."""
    for digits, bits in ((2, 8), (4, 16), (6, 24), (9, 32), (18, 64)):
        if precision <= digits:
            return bits

    return 128  # wider than any named integer width


def native_integer_bits(db_type, precision, scale, database_type) -> int | None:
    """
    Width of a column that can only hold whole numbers, or None if it can hold fractions.

        Postgres  smallint 16, integer 32, bigint 64, numeric(p,0) by p
        Snowflake NUMBER(p,0) by p        (this is what every Snowflake integer is)
    """
    name = normalize_type_name(db_type)

    if dialect_of(database_type) == "postgresql":
        fixed = {"smallint": 16, "integer": 32, "bigint": 64}

        if name in fixed:
            return fixed[name]

        accepted = ("numeric",)
    else:
        accepted = ("number", "numeric", "decimal", "fixed")

    if name in accepted and precision and scale is not None and int(scale) == 0:
        return _bits_for_digits(int(precision))

    return None


# Types whose values are numbers, so "is it whole" can be asked of the number itself
# instead of its text rendering (12.00 and 1E+3 are both whole).
_NUMERIC_NATIVE = {
    "postgresql": {"numeric", "real", "double precision", "money", "smallint", "integer", "bigint"},
    "snowflake": {"number", "float", "float4", "float8", "real", "double", "decimal", "numeric", "fixed"},
}


# ---------------------------------------------------------------------------
# The decision: skip, read as text, or read as a number.
# ---------------------------------------------------------------------------
SKIP = "skip"
TEXT_SCAN = "text"
NUMBER_SCAN = "number"


@dataclass(frozen=True)
class ColumnPlan:
    declared: str  # as written
    family: str
    bits: int | None
    mode: str      # SKIP | TEXT_SCAN | NUMBER_SCAN
    reason: str


def plan_column(declared_raw, native_type, precision, scale, database_type) -> ColumnPlan | None:
    """
    How to decide whether every value in one column fits its declared type.
    None when the declared type is not recognised.

      declared text                       -> SKIP   any value is valid text
      native type cannot hold a bad value -> SKIP   the engine already guarantees it
      declared integer on a numeric column-> NUMBER the number itself is tested
      anything else                       -> TEXT   each value's text is tested

    NULL and blank values are never judged here: the null check owns them.
    """
    family = declared_family(declared_raw)

    if family is None:
        return None

    bits = declared_integer_bits(declared_raw) if family == INTEGER else None
    declared = str(declared_raw)
    native = native_family(native_type, database_type)

    def plan(mode, reason):
        return ColumnPlan(declared, family, bits, mode, reason)

    if family == TEXT:
        return plan(SKIP, "any value is valid text")

    if family == INTEGER:
        native_bits = native_integer_bits(native_type, precision, scale, database_type)

        if native_bits is not None and (bits is None or native_bits <= bits):
            return plan(SKIP, "the column only holds whole numbers that fit")

        if normalize_type_name(native_type) in _NUMERIC_NATIVE[dialect_of(database_type)]:
            return plan(NUMBER_SCAN, "numeric column: every number is tested for being whole and in range")

        return plan(TEXT_SCAN, "every value is read as text")

    satisfied = {
        FLOAT: {INTEGER, FLOAT},
        DATE: {DATE},
        DATETIME: {DATETIME, DATE},
        BOOLEAN: {BOOLEAN},
    }[family]

    if native in satisfied:
        return plan(SKIP, f"the column is {native}, which cannot hold a value that is not {family}")

    return plan(TEXT_SCAN, "every value is read as text")


# Kept for callers that only know families.
_SATISFIES = {
    INTEGER: {INTEGER},
    FLOAT: {INTEGER, FLOAT},
    DATE: {DATE},
    DATETIME: {DATETIME, DATE},
    BOOLEAN: {BOOLEAN},
}


def needs_value_scan(declared: str, native: str) -> bool:
    """False when the answer is already known from the column definition (family level)."""
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
#
# Surrounding whitespace (space, tab, CR, LF, no-break space) is ignored, so " 12 " and
# a CRLF file's last column are read as what they hold.
# ---------------------------------------------------------------------------
_DATE_PART = "[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"
_TIME_PART = "([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?"
_ZONE_PART = "(Z|[+-](0[0-9]|1[0-4])(:?[0-5][0-9])?)"

_PATTERNS = {
    # A fractional part of all zeros is still a whole number (numeric(10,2) renders 12.00).
    INTEGER: "^[+-]?[0-9]{1,%d}([.]0+)?$" % MAX_INTEGER_DIGITS,
    FLOAT: "^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]+)?$",
    # A date column holding midnight timestamps is still a date.
    DATE: f"^{_DATE_PART}([ T]00:00(:00([.]0+)?)?{_ZONE_PART}?)?$",
    DATETIME: f"^{_DATE_PART}([ T]{_TIME_PART}{_ZONE_PART}?)?$",
}

_BOOLEAN_WORDS = ("true", "false", "t", "f", "yes", "no", "y", "n", "1", "0")

# What a numeric column prints for a value that is not a number at all.
_NOT_A_NUMBER = ("nan", "inf", "-inf", "+inf", "infinity", "-infinity", "+infinity")


def quote_ident(name: str, database_type: str) -> str:
    """Quote an identifier, escaping embedded double quotes. Snowflake folds to upper case."""
    folded = name.upper() if dialect_of(database_type) == "snowflake" else name
    return '"' + folded.replace('"', '""') + '"'


def text_of(column_sql: str, database_type: str) -> str:
    if dialect_of(database_type) == "snowflake":
        return f"TO_VARCHAR({column_sql})"

    return f"CAST({column_sql} AS TEXT)"


_WHITESPACE = "CHR(32)||CHR(9)||CHR(10)||CHR(13)||CHR(160)"


def trimmed_text(column_sql: str, database_type: str) -> str:
    if dialect_of(database_type) == "snowflake":
        return f"TRIM({text_of(column_sql, database_type)}, {_WHITESPACE})"

    return f"BTRIM({text_of(column_sql, database_type)}, {_WHITESPACE})"


def _matches(text_sql: str, pattern: str, database_type: str) -> str:
    if dialect_of(database_type) == "snowflake":
        return f"REGEXP_LIKE({text_sql}, '{pattern}')"

    return f"({text_sql} ~ '{pattern}')"


def _calendar_ok(text_sql: str) -> str:
    """The date at the start of an already pattern-matched text exists on the calendar."""
    year = f"CAST(SUBSTR({text_sql}, 1, 4) AS INTEGER)"
    month = f"CAST(SUBSTR({text_sql}, 6, 2) AS INTEGER)"
    day = f"CAST(SUBSTR({text_sql}, 9, 2) AS INTEGER)"

    leap = f"(MOD({year}, 4) = 0 AND (MOD({year}, 100) <> 0 OR MOD({year}, 400) = 0))"
    longest = (
        f"CASE {month} WHEN 2 THEN CASE WHEN {leap} THEN 29 ELSE 28 END "
        f"WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END"
    )

    return f"({year} >= 1 AND {day} <= {longest})"


def _in_range(text_sql: str, bits: int, database_type: str) -> str:
    low, high = -(2 ** (bits - 1)), 2 ** (bits - 1) - 1
    cast = "TRY_CAST" if dialect_of(database_type) == "snowflake" else "CAST"

    return f"({cast}({text_sql} AS NUMERIC(38,0)) BETWEEN {low} AND {high})"


def bad_value_predicate(plan_or_family, column_sql: str, database_type: str, native_type: str | None = None) -> str:
    """
    SQL boolean: the value is present and does NOT fit.

    Accepts a ColumnPlan, or a bare family (read as text) for older callers.
    """
    plan = plan_or_family if isinstance(plan_or_family, ColumnPlan) else ColumnPlan(
        str(plan_or_family), plan_or_family, None, TEXT_SCAN, ""
    )
    family = plan.family

    if family not in _PATTERNS and family != BOOLEAN:
        raise ValueError(f"No value predicate for family {family!r}")

    dialect = dialect_of(database_type)

    if plan.mode == NUMBER_SCAN:
        if native_type and normalize_type_name(native_type) == "money" and dialect == "postgresql":
            number = f"CAST({column_sql} AS NUMERIC)"
        else:
            number = column_sql

        words = ", ".join(f"'{word}'" for word in _NOT_A_NUMBER)
        broken = f"LOWER({text_of(column_sql, database_type)}) IN ({words})"
        wrong = f"{number} <> TRUNC({number})"

        if plan.bits:
            low, high = -(2 ** (plan.bits - 1)), 2 ** (plan.bits - 1) - 1
            wrong = f"({wrong} OR {number} < {low} OR {number} > {high})"

        return f"({column_sql} IS NOT NULL AND CASE WHEN {broken} THEN TRUE ELSE {wrong} END)"

    text = trimmed_text(column_sql, database_type)
    present = f"({column_sql} IS NOT NULL AND {text} <> '')"

    if family == BOOLEAN:
        words = ", ".join(f"'{word}'" for word in _BOOLEAN_WORDS)
        ok = f"(LOWER({text}) IN ({words}))"
    elif family in (DATE, DATETIME):
        ok = f"CASE WHEN {_matches(text, _PATTERNS[family], database_type)} THEN {_calendar_ok(text)} ELSE FALSE END"
    elif family == INTEGER and plan.bits:
        ok = (
            f"CASE WHEN {_matches(text, _PATTERNS[family], database_type)} "
            f"THEN {_in_range(text, plan.bits, database_type)} ELSE FALSE END"
        )
    else:
        ok = _matches(text, _PATTERNS[family], database_type)

    return f"({present} AND NOT ({ok}))"


def build_scan_sql(schema: str, table: str, specs: list, database_type: str) -> str:
    """
    One table read for every column that needs scanning.

    `specs` is [(column_name, ColumnPlan | family), ...] or [(column_name, plan, native_type)].
    The per-column verdicts are computed once in an inner select, then counted, so a long
    predicate is not repeated for every aggregate. Result columns are positional -- any_bad,
    then c0/s0, c1/s1, ... -- so identifier quoting and Snowflake's upper-casing of aliases
    never matter:

        any_bad : rows with at least one bad value (a row is counted once)
        cN      : bad values in column N
        sN      : one example of a bad value in column N
    """
    if not specs:
        raise ValueError("build_scan_sql needs at least one column")

    inner = []
    outer = []
    flags = []

    for index, spec in enumerate(specs):
        column, plan = spec[0], spec[1]
        native_type = spec[2] if len(spec) > 2 else None
        column_sql = quote_ident(column, database_type)

        inner.append(f"{bad_value_predicate(plan, column_sql, database_type, native_type)} AS b{index}")
        inner.append(f"{text_of(column_sql, database_type)} AS v{index}")

        flags.append(f"b{index}")
        outer.append(f"SUM(CASE WHEN b{index} THEN 1 ELSE 0 END) AS c{index}")
        outer.append(f"MIN(CASE WHEN b{index} THEN v{index} END) AS s{index}")

    any_bad = " OR ".join(flags)

    return (
        f"SELECT SUM(CASE WHEN {any_bad} THEN 1 ELSE 0 END) AS any_bad, "
        + ", ".join(outer)
        + f" FROM (SELECT {', '.join(inner)}"
        + f" FROM {quote_ident(schema, database_type)}.{quote_ident(table, database_type)}) scanned"
    )
