"""
Referential integrity (TC006), run for real against Postgres with TEMP tables.

    python -m pytest test_cases/test_ri_check.py --noconftest -q

A child value passes when the parent has it. What counts as a VIOLATION is the point of
these tests: an orphan (a value with no parent) is one; a missing value is not -- in SQL a
null foreign key references nothing, and "this field must be filled" is the null check's
job. Counting nulls here as well reported the same rows twice, under two checks.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from trad_ct_id.sql_executor import run_tc_checks


class _Log:
    def log_system(self, *args, **kwargs):
        pass


@pytest.fixture(scope="module")
def cur():
    from psycopg2.extras import RealDictCursor
    from Data_Code.common.database import get_engine

    connection = get_engine().raw_connection()
    cursor = connection.cursor(cursor_factory=RealDictCursor)

    cursor.execute("CREATE TEMP TABLE ri_parent (id text, label text)")
    cursor.execute("INSERT INTO ri_parent VALUES ('A','a'), ('B','b'), ('C','c'), ('007','seven'), ('42','n')")

    cursor.execute("CREATE TEMP TABLE ri_child (n int, ref text)")
    cursor.execute("""
        INSERT INTO ri_child VALUES
          (1, 'A'),        -- ok
          (2, 'B'),        -- ok
          (3, ' C '),      -- ok: surrounding whitespace is ignored
          (4, 'Z'),        -- ORPHAN
          (5, 'ZZ'),       -- ORPHAN
          (6, NULL),       -- not a violation
          (7, ''),         -- not a violation: blank is a missing value
          (8, '   '),      -- not a violation
          (9, 'a'),        -- ORPHAN: values are compared exactly, case included
          (10, '007'),     -- ok: leading zeros are part of the value
          (11, '7')        -- ORPHAN: '7' is not '007'
    """)

    yield cursor

    connection.rollback()
    connection.close()


def _ri(cur, field="ref", parent_table="ri_parent", parent_column="id"):
    cur.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()")
    schema = cur.fetchone()["nspname"]

    return run_tc_checks(
        cur, "ri_child", field, "postgresql", "ctid", "ri_check", _Log(),
        "CFG1", "cfg", "TC006", "Referential Integrity", "d", 1, 1, 1, "high", [1], False,
        "JOB1", 11,
        detail1="CONN1", detail2=parent_table, detail3=parent_column,
        db_schema=schema, metadata_map={"CONN1": {"db_schema": schema}},
    )


def test_only_values_with_no_parent_are_violations(cur):
    result, failed_ids, details, *_ = _ri(cur)

    assert result["check_status"] == "failed"
    # Z, ZZ, a, 7 -- and NOT the null, the empty string or the whitespace-only value.
    assert result["issue_rows"] == 4, result
    assert result["passed_rows"] == 7


def test_the_failing_rows_are_the_orphans(cur):
    _, failed_ids, *_ = _ri(cur)

    cur.execute("SELECT n FROM ri_child WHERE ctid::text = ANY(%s) ORDER BY n", (list(failed_ids),))
    assert [row["n"] for row in cur.fetchall()] == [4, 5, 9, 11]


def test_a_clean_child_passes(cur):
    cur.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()")
    cur.execute("CREATE TEMP TABLE ri_clean (ref text)")
    cur.execute("INSERT INTO ri_clean VALUES ('A'), (NULL), ('42'), ('')")
    schema = (cur.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()") or cur.fetchone())["nspname"]

    result, *_ = run_tc_checks(
        cur, "ri_clean", "ref", "postgresql", "ctid", "ri_check", _Log(),
        "CFG1", "cfg", "TC006", "Referential Integrity", "d", 1, 1, 1, "high", [1], False,
        "JOB1", 4,
        detail1="CONN1", detail2="ri_parent", detail3="id",
        db_schema=schema, metadata_map={"CONN1": {"db_schema": schema}},
    )

    assert result["check_status"] == "passed"
    assert result["issue_rows"] == 0


def test_failure_message_is_business_readable(cur):
    result, *_ = _ri(cur)

    reason = result["failure_reason"]
    assert "ri_check" not in reason and "check_mapping_name" not in reason
    assert "4" in reason and "ri_parent" in reason


# ------------------------------------------------ parent on a different connection

@pytest.fixture(scope="module")
def parent_cur():
    """A SECOND connection holding the parent: its temp table is invisible to `cur`, which
    is what two separate databases look like to the engine."""
    from psycopg2.extras import RealDictCursor
    from Data_Code.common.database import get_engine

    connection = get_engine().raw_connection()
    cursor = connection.cursor(cursor_factory=RealDictCursor)
    cursor.execute("CREATE TEMP TABLE ri_parent_remote (id text)")
    cursor.execute("INSERT INTO ri_parent_remote VALUES ('A'), ('B'), ('C'), ('007'), ('42'), (NULL), ('A')")

    yield cursor

    connection.rollback()
    connection.close()


def _ri_across(cur, parent_cur):
    cur.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()")
    child_schema = cur.fetchone()["nspname"]
    parent_cur.execute("SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema()")
    parent_schema = parent_cur.fetchone()["nspname"]

    return run_tc_checks(
        cur, "ri_child", "ref", "postgresql", "ctid", "ri_check", _Log(),
        "CFG1", "cfg", "TC006", "Referential Integrity", "d", 1, 1, 1, "high", [1], False,
        "JOB1", 11,
        detail1="REMOTE", detail2="ri_parent_remote", detail3="id",
        db_schema=child_schema, metadata_map={"REMOTE": {"db_schema": parent_schema}},
        ri_parent={"cursor": parent_cur, "database_type": "postgresql"},
    )


def test_the_parent_is_really_out_of_reach_of_the_child_connection(cur):
    with pytest.raises(Exception):
        cur.execute("SELECT 1 FROM ri_parent_remote")
    cur.connection.rollback()
    # the fixture's temp child table was created in the transaction we just rolled back
    cur.execute("CREATE TEMP TABLE IF NOT EXISTS ri_child (n int, ref text)")


def test_the_same_orphans_are_found_across_connections(cur, parent_cur):
    cur.execute("DELETE FROM ri_child")
    cur.execute("""
        INSERT INTO ri_child VALUES
          (1,'A'),(2,'B'),(3,' C '),(4,'Z'),(5,'ZZ'),(6,NULL),(7,''),(8,'   '),(9,'a'),(10,'007'),(11,'7')
    """)

    result, failed_ids, *_ = _ri_across(cur, parent_cur)

    assert result["check_status"] == "failed"
    assert result["issue_rows"] == 4
    cur.execute("SELECT n FROM ri_child WHERE ctid::text = ANY(%s) ORDER BY n", (list(failed_ids),))
    assert [row["n"] for row in cur.fetchall()] == [4, 5, 9, 11]


def test_a_clean_child_passes_across_connections(cur, parent_cur):
    cur.execute("DELETE FROM ri_child")
    cur.execute("INSERT INTO ri_child VALUES (1,'A'),(2,NULL),(3,'42'),(4,'')")

    result, *_ = _ri_across(cur, parent_cur)

    assert result["check_status"] == "passed"
    assert result["issue_rows"] == 0
