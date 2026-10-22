"""
TC004 value-scan tests.

The mapping tests are pure. The scan tests run the real generated SQL against
Postgres through the engine's own connection, using a TEMP table -- nothing
persists, and it exercises exactly what a job would execute.

Run without the repo's conftest (which builds a full test database):

    python -m pytest test_cases/test_datatype_scan.py --noconftest -q
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trad_ct_id.datatype_scan import UnsupportedDeclaredType, run_datatype_scan
from trad_ct_id.type_mapping import (
    BOOLEAN, DATE, DATETIME, FLOAT, INTEGER, TEXT,
    declared_family, native_family, needs_value_scan, normalize_type_name, quote_ident,
)


# ------------------------------------------------------------------ mapping --

@pytest.mark.parametrize("raw,family", [
    ("string", TEXT), ("VARCHAR", TEXT), ("varchar(255)", TEXT), ("Character Varying", TEXT),
    ("int", INTEGER), ("BIGINT", INTEGER), ("integer", INTEGER),
    ("float", FLOAT), ("Number(10, 2)", FLOAT), ("decimal(18,4)", FLOAT), ("double precision", FLOAT),
    ("date", DATE),
    ("datetime", DATETIME), ("TIMESTAMP_NTZ", DATETIME), ("timestamp with time zone", DATETIME),
    ("bool", BOOLEAN), ("boolean", BOOLEAN),
])
def test_declared_types_resolve(raw, family):
    assert declared_family(raw) == family


def test_unknown_declared_type_is_none_not_guessed():
    assert declared_family("geometry") is None
    assert declared_family(None) is None


def test_normalize_collapses_params_and_case():
    assert normalize_type_name("  NUMBER( 38 , 0 ) ") == "number"
    assert normalize_type_name("Double   Precision") == "double precision"


def test_the_bug_that_started_this_varchar_is_character_varying():
    # The old check compared these as raw strings and failed a healthy table.
    assert declared_family("varchar") == native_family("character varying", "postgres")


@pytest.mark.parametrize("native,db,family", [
    ("character varying", "postgres", TEXT), ("integer", "postgres", INTEGER),
    ("numeric", "postgres", FLOAT), ("timestamp without time zone", "postgres", DATETIME),
    ("TEXT", "snowflake", TEXT), ("NUMBER", "snowflake", FLOAT), ("TIMESTAMP_NTZ", "snowflake", DATETIME),
])
def test_native_families(native, db, family):
    assert native_family(native, db) == family


def test_text_is_never_scanned():
    for native in (TEXT, INTEGER, FLOAT, DATE, "other"):
        assert needs_value_scan(TEXT, native) is False


def test_compatible_native_skips_the_scan():
    assert needs_value_scan(INTEGER, INTEGER) is False
    assert needs_value_scan(FLOAT, INTEGER) is False       # int fits a float
    assert needs_value_scan(DATETIME, DATE) is False       # date fits a datetime


def test_text_column_declared_integer_must_be_scanned():
    assert needs_value_scan(INTEGER, TEXT) is True


def test_snowflake_number_declared_integer_is_scanned_not_assumed():
    # NUMBER cannot say whether it holds decimals, so the values decide.
    assert needs_value_scan(INTEGER, native_family("NUMBER", "snowflake")) is True


def test_quote_ident_escapes_and_folds():
    assert quote_ident('we"ird', "postgres") == '"we""ird"'
    assert quote_ident("hcp_sales", "snowflake") == '"HCP_SALES"'


# --------------------------------------------------------------- live scan --

@pytest.fixture(scope="module")
def cur():
    from psycopg2.extras import RealDictCursor
    from Data_Code.common.database import get_engine

    connection = get_engine().raw_connection()
    cursor = connection.cursor(cursor_factory=RealDictCursor)

    cursor.execute("""
        CREATE TEMP TABLE scan_t (
            n int,
            age text, price text, flag text, born text, seen text, label text, real_int integer
        )
    """)

    cursor.execute("""
        INSERT INTO scan_t VALUES
          (1, '10',   '12.50', 'true',  '2020-01-31', '2020-01-31 10:00:00',  'Alice',   1),
          (2, '007',  '13',    'Yes',   '2020-02-29 00:00:00', '2020-01-31T10:00:00Z', '12345', 2),
          (3, ' 5 ',  '-.5',   '0',     '2021-12-01', '2020-01-31',           'Bob',     3),
          (4, '12.00','1e3',   'n',     '2021-12-31', '2020-01-31 10:00',     NULL,      4),
          (5, 'abc',  'x1',    'maybe', '31/01/2020', '2020-01-31 25:00:00',  '99',      5),
          (6, '1.5',  '9.9.9', '2',     '2020-13-01', 'yesterday',            'x',       6),
          (7, '',     '',      '',      '',           '',                     '',        7),
          (8, NULL,   NULL,    NULL,    NULL,         NULL,                   NULL,      8)
    """)

    yield cursor

    connection.rollback()
    connection.close()


ACTUAL = {
    "age": "text", "price": "text", "flag": "text", "born": "text", "seen": "text",
    "label": "text", "real_int": "integer",
}


def scan(cur, declared):
    return run_datatype_scan(cur, "postgres", "pg_temp", "scan_t", declared, ACTUAL)


def test_text_column_of_integers_declared_integer_is_fine_unless_a_value_is_not(cur):
    issue, found = scan(cur, {"age": "integer"})
    # 'abc' and '1.5' are not integers. '007', ' 5 ' and '12.00' are. blank/NULL ignored.
    assert found["age"]["bad"] == 2
    assert issue == 2


def test_declared_text_passes_even_when_every_value_is_digits(cur):
    issue, found = scan(cur, {"label": "string"})
    assert (issue, found) == (0, {})


def test_float(cur):
    _, found = scan(cur, {"price": "float"})
    assert found["price"]["bad"] == 2          # 'x1', '9.9.9'  ('-.5' and '1e3' are fine)


def test_boolean(cur):
    _, found = scan(cur, {"flag": "boolean"})
    assert found["flag"]["bad"] == 2           # 'maybe', '2'


def test_date_accepts_midnight_timestamps_and_rejects_the_rest(cur):
    _, found = scan(cur, {"born": "date"})
    assert found["born"]["bad"] == 2           # '31/01/2020', '2020-13-01'


def test_datetime(cur):
    _, found = scan(cur, {"seen": "datetime"})
    assert found["seen"]["bad"] == 2           # '25:00:00', 'yesterday'


def test_natively_compatible_column_is_not_scanned(cur):
    assert scan(cur, {"real_int": "integer"}) == (0, {})
    assert scan(cur, {"real_int": "float"}) == (0, {})


def test_a_row_with_two_bad_columns_is_counted_once(cur):
    issue, found = scan(cur, {"age": "integer", "price": "float"})
    # row 5 is bad in both columns; rows 6 too. Distinct rows: 5 and 6 -> 2.
    assert found["age"]["bad"] == 2 and found["price"]["bad"] == 2
    assert issue == 2


def test_sample_is_a_real_offending_value(cur):
    _, found = scan(cur, {"age": "integer"})
    assert found["age"]["sample"] in ("abc", "1.5")


def test_missing_column_is_skipped_not_reported_here(cur):
    assert scan(cur, {"no_such_column": "integer"}) == (0, {})


def test_unsupported_declared_type_is_an_error_not_a_pass(cur):
    with pytest.raises(UnsupportedDeclaredType):
        scan(cur, {"age": "geometry"})


def test_declared_name_matches_actual_regardless_of_case(cur):
    # Snowflake reports upper-case names while schema files are usually lower-case;
    # comparing them as-is made every column look wrong there.
    issue, found = scan(cur, {"AGE": "integer"})
    assert found["age"]["bad"] == 2


# ------------------------------------------------- end to end: run_tc_checks --
# The glue is where the earlier bug lived (a healthy table failing TC004), so the
# result a job would actually write is asserted, not just the scan.

from trad_ct_id.sql_executor import run_tc_checks


class _Log:
    def log_system(self, *args, **kwargs):
        pass


def _run(cur, check, order, datatype, total_rows=8):
    cur.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()")
    temp_schema = cur.fetchone()["nspname"]

    return run_tc_checks(
        cur, "scan_t", None, "postgres", "n", check, _Log(),
        "CFG1", "cfg", "TCX", check, "d", 1, 1, 1, "high", [1], True, "JOB1", total_rows,
        column_order=order, column_datatype=datatype, db_schema=temp_schema,
    )


ORDER = {"n": 1, "age": 2, "price": 3, "flag": 4, "born": 5, "seen": 6, "label": 7, "real_int": 8}


def test_tc004_healthy_table_with_usable_values_passes(cur):
    # 'label' holds digits but is declared text; 'real_int' is natively an integer
    # declared as the DDL name "int". Neither is a problem.
    result, *_ = _run(cur, "datatype_check", ORDER, {"label": "varchar", "real_int": "int", "n": "integer"})
    assert result["check_status"] == "passed"
    assert result["issue_rows"] == 0
    assert result["passed_rows"] == 8
    assert result["field"] is None


def test_tc004_failure_reports_rows_not_na_and_quotes_columns(cur):
    result, *_ = _run(cur, "datatype_check", ORDER, {"age": "integer", "price": "float"})
    assert result["check_status"] == "failed"
    assert result["issue_rows"] == 2               # a real row count, not "NA"
    assert result["passed_rows"] == 6
    assert result["field"] is None
    assert '"age" (expected integer)' in result["failure_reason"]
    assert '"price" (expected float)' in result["failure_reason"]


def test_tc003_message_quotes_column_names(cur):
    swapped = dict(ORDER, label=5, born=7)
    result, *_ = _run(cur, "column_order_check", swapped, {"n": "integer"})
    assert result["check_status"] == "failed"
    assert 'expected "' in result["failure_reason"] and '" but found "' in result["failure_reason"]
    # still not a row count: the order check never reads a row
    assert result["issue_rows"] == "NA" and result["field"] is None


def test_tc002_lists_missing_columns_in_declared_order_and_quoted(cur):
    order = dict(ORDER, zeta=9, alpha=10, mid=11)
    result, *_ = _run(cur, "column_name_check", order, {"n": "integer"})
    assert result["failure_reason"] == 'Missing columns "zeta", "alpha", "mid" from expected schema'


# ------------------------------------------------------- snowflake structure --
# There is no live Snowflake to run against here, so this only guards the SQL's
# shape: the dialect functions, and no backslashes (Snowflake reads them as
# string escapes, which would silently change a regex).

from trad_ct_id.type_mapping import build_scan_sql


def test_snowflake_scan_sql_uses_snowflake_functions_and_no_backslashes():
    sql = build_scan_sql(
        "public", "hcp", [("age", INTEGER), ("seen", DATETIME), ("flag", BOOLEAN)], "snowflake"
    )
    assert "REGEXP_LIKE(" in sql and "TO_VARCHAR(" in sql
    assert " ~ " not in sql and "::" not in sql and "BTRIM(" not in sql   # the Postgres spellings
    assert "\\" not in sql
    assert '"PUBLIC"."HCP"' in sql and '"AGE"' in sql


def test_postgres_scan_sql_uses_postgres_functions():
    sql = build_scan_sql("public", "hcp", [("age", INTEGER)], "postgres")
    assert " ~ " in sql and "CAST(" in sql and "BTRIM(" in sql and "REGEXP_LIKE" not in sql and "TRY_CAST" not in sql


# --------------------------------------------- frontend / engine vocabulary --
# Two languages, two alias tables, one idea of what "int" means. Nothing but this
# test stops them drifting, and the failure mode is quiet: a type the engine
# understands is rejected at upload, or one the frontend accepts means something
# else by the time it is judged.

import re
from pathlib import Path

from trad_ct_id.type_mapping import _DECLARED_LOOKUP

_FRONTEND = Path(__file__).resolve().parents[2] / "frontend/app/lib/schemaFile/parseSchemaFile.ts"
_ENUM = ["string", "integer", "float", "date", "datetime", "boolean", "varchar"]


def _frontend_synonyms():
    source = _FRONTEND.read_text(encoding="utf-8")
    block = source[source.index("DATA_TYPE_SYNONYMS"):]
    block = block[:block.index("};")]
    pairs = re.findall(r'(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:\s*"([a-z]+)"', block)
    return {(quoted or bare): target for quoted, bare, target in pairs}


@pytest.mark.skipif(not _FRONTEND.exists(), reason="frontend repo not alongside the engine")
def test_every_type_the_engine_understands_is_accepted_by_the_frontend():
    synonyms = _frontend_synonyms()
    missing = [alias for alias in _DECLARED_LOOKUP if alias not in _ENUM and alias not in synonyms]
    assert not missing, f"engine knows these types but the schema-file upload rejects them: {missing}"


@pytest.mark.skipif(not _FRONTEND.exists(), reason="frontend repo not alongside the engine")
def test_frontend_and_engine_agree_on_what_each_type_means():
    disagree = [
        (alias, target)
        for alias, target in _frontend_synonyms().items()
        if alias in _DECLARED_LOOKUP and _DECLARED_LOOKUP[alias] != declared_family(target)
    ]
    assert not disagree, f"frontend maps these to a different type family than the engine: {disagree}"


# ------------------------------------------------------------ parse_json_field --
# Row-level rows carry the field's OWN type name in column_datatype. json.loads("varchar")
# raised "Expecting value", which errored every primary-key and null check in a real job --
# and stayed hidden because TC004's false failure aborted those checks before they ran.

from trad_ct_id.value_converter import parse_json_field


@pytest.mark.parametrize("value", ["varchar", "integer", "", "   ", "NA", "nan"])
def test_a_plain_type_name_or_blank_is_not_a_schema_map(value):
    assert parse_json_field(value) is None


def test_schema_maps_still_parse():
    assert parse_json_field('{"id": 1, "name": 2}') == {"id": 1, "name": 2}
    assert parse_json_field('  [1, 2]  ') == [1, 2]
    assert parse_json_field({"a": 1}) == {"a": 1}
    assert parse_json_field(None) is None


def test_a_corrupt_schema_map_still_fails_loudly():
    # Shaped like a map but broken: must not silently become "no schema".
    with pytest.raises(Exception):
        parse_json_field('{"id": 1,')


# ------------------------------------------- fetched-from-source type mapping --
# "Fetch from source" turns a database's own type names into declared types in the
# frontend (lib/schemaFile/nativeTypes.ts). It must put each one in the same family the
# engine does, or a fetched schema would be judged differently than the same column would
# be if it were uploaded.

_NATIVE_TS = Path(__file__).resolve().parents[2] / "frontend/app/lib/schemaFile/nativeTypes.ts"


def _frontend_native_map():
    source = _NATIVE_TS.read_text(encoding="utf-8")
    block = source[source.index("NATIVE_TO_DECLARED"):]
    block = block[:block.index("};")]
    pairs = re.findall(r'(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:\s*"([a-z]+)"', block)
    return {(quoted or bare): target for quoted, bare, target in pairs}


@pytest.mark.skipif(not _NATIVE_TS.exists(), reason="frontend repo not alongside the engine")
def test_fetched_native_types_land_in_the_engines_family():
    wrong = []

    for native, declared in _frontend_native_map().items():
        for dialect in ("postgres", "snowflake"):
            engine_family = native_family(native, dialect)

            # Types the engine does not classify (uuid, json...) are scanned as text there.
            if engine_family == "other":
                continue

            if engine_family != declared_family(declared):
                wrong.append((native, dialect, engine_family, declared_family(declared)))

    assert not wrong, f"native type -> declared type disagrees with the engine: {wrong}"
