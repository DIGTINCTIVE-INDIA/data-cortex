"""
What a business user is allowed to read in `failure_reason`.

Results rows are exported and circulated. A raw exception, a stack trace or an
internal variable name in that column is a defect, not cosmetics -- so this guards
the boundary rather than the exact wording.

    python -m pytest test_cases/test_failure_text.py --noconftest -q
"""

import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from Data_Code.common.failure_text import explain_failure, readable_failure
from trad_ct_id.failure_messege_builder import build_failure_message


# Anything that reads as the engine talking about itself.
FORBIDDEN = [
    r"check_mapping_name",      # an internal variable name
    r"Traceback",
    r"psycopg2|snowflake\.connector|sqlalchemy",
    r"__err\b|__valid\b",       # internal staging table suffixes
    r"\bNone\b",
    r"Exception|Error:",
    r"->",                      # "6 row(s) -> custom_check__err"
]


def assert_business_readable(message: str):
    assert message, "a failure reason must not be empty"

    for pattern in FORBIDDEN:
        assert not re.search(pattern, message), f"leaks implementation detail ({pattern}): {message!r}"


# ------------------------------------------------------------------ exceptions --

@pytest.mark.parametrize("raw,expected_fragment", [
    ('relation "hcp_sales" does not exist', "source table was not found"),
    ('column "sale_dt" does not exist', "column this check needs was not found"),
    ("permission denied for table hcp_sales", "does not have permission"),
    ("could not connect to server: Connection refused", "could not be reached"),
    ("canceling statement due to statement timeout", "took too long"),
    ("syntax error at or near SELEC", "could not be run"),
    ("password authentication failed for user svc", "credentials were rejected"),
    ("SQL compilation error: invalid identifier 'FOO'", "column this check needs was not found"),
])
def test_known_causes_are_explained(raw, expected_fragment):
    message = readable_failure(Exception(raw))

    assert expected_fragment in message
    assert_business_readable(message)


def test_an_unrecognised_error_shows_its_own_text_not_a_stand_in():
    """When no business cause matches, the raw error is shown (first line), never a generic
    sentence that hides what happened."""
    raw = "KeyError: 'weird_internal_thing'\nTraceback (most recent call last):\n  File x.py"
    info = explain_failure(Exception(raw))

    assert info["business"] is False
    assert info["title"] == "Unexpected error"
    assert info["reason"] == "KeyError: 'weird_internal_thing'"
    assert "Traceback" in info["detail"]
    assert "could not be completed" not in readable_failure(Exception(raw))


def test_a_known_cause_gives_title_reason_and_raw_detail():
    raw = "An error occurred (NoSuchBucket) when calling the ListObjectsV2 operation: The specified bucket does not exist"
    info = explain_failure(Exception(raw), "Traceback: ...")

    assert info["business"] is True
    assert info["title"] == "Storage bucket not found"
    assert "bucket" in info["reason"]
    assert raw in info["detail"] and "Traceback" in info["detail"]


# What the drivers and libraries actually say, mapped to a plain title and to whose problem it is.
# The aim: nearly every failure is a CLIENT error with a specific name ("table not found"), not a
# server error.
REAL_WORLD = [
    # --- Postgres
    ('FATAL:  database "nodb" does not exist', "Database not found", "client"),
    ('FATAL:  password authentication failed for user "x"', "Sign-in was rejected", "client"),
    ('FATAL:  role "bob" does not exist', "Database user not found", "client"),
    ('connection to server at "h" (1.2.3.4), port 5432 failed: FATAL:  no pg_hba.conf entry for host "1.2.3.4", user "u", database "d", SSL off', "Database refused the connection", "client"),
    ('connection to server at "h", port 5432 failed: Connection refused', "Source could not be reached", "client"),
    ('could not translate host name "x.invalid" to address: Name or service not known', "Source could not be reached", "client"),
    ('schema "nope" does not exist', "Schema not found", "client"),
    ('relation "dq_small" does not exist', "Table not found", "client"),
    ('column "sale_dt" does not exist', "Column not found", "client"),
    ('relation "r_err" already exists', "Result table already in use", "client"),
    ('duplicate key value violates unique constraint "results_pkey"', "Result table already in use", "client"),
    ("permission denied for schema public", "Permission denied", "client"),
    ("deadlock detected", "Database conflict", "service"),
    ("FATAL:  remaining connection slots are reserved for non-replication superuser connections", "Database is out of connections", "service"),
    ("value too long for type character varying(10)", "Value does not fit its column", "client"),
    ('invalid input syntax for type integer: "x"', "Value does not match its type", "client"),
    ("canceling statement due to statement timeout", "Check took too long", "service"),
    ("SSL SYSCALL error: EOF detected", "Connection was interrupted", "service"),
    ("current transaction is aborted, commands ignored until end of transaction block", "An earlier step failed", "client"),
    # --- Snowflake
    ("250001 (08001): Failed to connect to DB: abc.snowflakecomputing.com:443. Incorrect username or password was specified.", "Sign-in was rejected", "client"),
    ("002003 (02000): SQL compilation error:\nObject 'DB.S.T' does not exist or not authorized.", "Table not found", "client"),
    ("002043 (02000): SQL compilation error: Object does not exist, or operation cannot be performed.", "Table not found", "client"),
    ("Role 'NOPE' specified in the connect string does not exist or not authorized.", "Snowflake role not found", "client"),
    ("Database 'NOPE' does not exist or not authorized.", "Database not found", "client"),
    ("Schema 'DB.NOPE' does not exist or not authorized.", "Schema not found", "client"),
    ("Warehouse 'WH' does not exist or not authorized.", "Snowflake connection is missing its warehouse or database", "client"),
    ("000606 (57P03): No active warehouse selected in the current session.", "Snowflake connection is missing its warehouse or database", "client"),
    ("090105 (22000): Cannot perform SELECT. This session does not have a current database.", "Snowflake connection is missing its warehouse or database", "client"),
    ("250001 (08001): Failed to connect to DB. JWT token is invalid.", "Sign-in was rejected", "client"),
    # --- S3 / boto
    ("An error occurred (NoSuchBucket) when calling the ListObjectsV2 operation: The specified bucket does not exist", "Storage bucket not found", "client"),
    ("An error occurred (403) when calling the HeadObject operation: Forbidden", "Storage access denied", "client"),
    ("An error occurred (404) when calling the HeadObject operation: Not Found", "File not found", "client"),
    ("An error occurred (InvalidAccessKeyId) when calling the ListObjectsV2 operation: The AWS Access Key Id you provided does not exist in our records.", "Storage credentials rejected", "client"),
    ("An error occurred (ExpiredToken) when calling the GetObject operation: The provided token has expired.", "Storage credentials expired", "client"),
    ("An error occurred (InvalidBucketName) when calling the ListObjectsV2 operation: The specified bucket is not valid.", "Storage bucket name is invalid", "client"),
    ("botocore.exceptions.NoCredentialsError: Unable to locate credentials", "Storage credentials are missing", "client"),
    ("An error occurred (SlowDown) when calling the PutObject operation: Please reduce your request rate.", "Storage is temporarily unavailable", "service"),
    ('Could not connect to the endpoint URL: "https://s3.ap-south-1.amazonaws.com/b/k"', "Storage could not be reached", "service"),
    # --- files / pandas
    ("pandas.errors.ParserError: Error tokenizing data. C error: Expected 5 fields in line 3, saw 6", "File could not be split into columns", "client"),
    ("pandas.errors.EmptyDataError: No columns to parse from file", "Source is empty", "client"),
    ("UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff in position 0: invalid start byte", "File is not UTF-8 text", "client"),
    ("KeyError: \"['qty'] not in index\"", "Column not found in the file", "client"),
    ("ValueError: Excel file format cannot be determined, you must specify an engine manually.", "Excel file could not be opened", "client"),
    ("zipfile.BadZipFile: File is not a zip file", "Excel file could not be opened", "client"),
    ("json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)", "File is not valid JSON", "client"),
    ("DataCodeFileParseError: Excel file must contain exactly one sheet for ingestion", "Excel workbook has more than one sheet", "client"),
    ("DataCodeFileParseError: JSON must contain an object or an array of objects", "JSON has the wrong shape", "client"),
    ("DataCodeFileParseError: Unsupported file format for x.parquet: .parquet", "File type not supported", "client"),
    # --- configuration / engine raises
    ("ValueError: No field rules in traditional_config_details for: ['DBC0125']. A config with no field rules has nothing to check", "No field rules configured", "client"),
    ("ValueError: No checks are enabled for: ['DBC0001']. Its field rules list the columns but none of them has a check ticked", "No checks are enabled", "client"),
    ("ValueError: Target schema 'x' does not exist", "Schema not found", "client"),
    ("DataCodeValidationError: Connection ID DC0047 not found.", "Connection not found", "client"),
    ("DataCodeValidationError: sql_query must be a single statement (found more than one ';'-separated statement)", "Custom SQL has more than one statement", "client"),
    ("DataCodeValidationError: sql_query must be a plain SELECT statement", "Only a SELECT is allowed", "client"),
    ("DataCodeConnectionError: Failed to set connection: Snowflake connection error: Snowflake key_pair authentication requires account.", "Snowflake connection is incomplete", "client"),
    ("DataCodeConnectionError: PostgreSQL connection error: something the driver said", "Database connection failed", "client"),
    ("DataCodeValidationError: user_id 'abc' does not exist -- job blocked", "User not found", "client"),
    ("ValueError: The reference table has more than 100000 distinct values, which is too many to compare across two connections.", "Reference table is too large to compare", "client"),
    ("UnsupportedDeclaredType: Unsupported declared data type for x. Use one of: string, integer, float", "Declared data type not supported", "client"),
    ("TimeLimitExceeded(3600)", "Run stopped at its time limit", "service"),
    ("redis.exceptions.ConnectionError: Error 111 connecting to redis:6379. Connection refused.", "Job queue is unavailable", "service"),
    ("WorkerLostError('Worker exited prematurely: signal 9 (SIGKILL) Job: 3.')", "Ran out of resources", "service"),
    # --- the engine's own faults are named too, but are not the person's to fix
    ("RuntimeError: Schema validation failed after init/migration -- the ORM expects the following", "Database schema is out of date", "server"),
    ("ValueError: traditional_checks_library_rev returned 0 rows. The check-type catalogue is missing", "Check catalogue is empty", "server"),
    ("ModuleNotFoundError: No module named 'snowflake'", "A required library is missing in the engine", "server"),
]


@pytest.mark.parametrize("raw,title,kind", REAL_WORLD)
def test_real_world_failures_get_a_specific_name_and_owner(raw, title, kind):
    info = explain_failure(raw)

    assert info["business"] is True, f"not recognised: {raw!r}"
    assert info["title"] == title, f"{raw!r} -> {info['title']!r}"
    assert info["kind"] == kind


def test_only_truly_unknown_errors_are_a_server_error_with_the_raw_text():
    info = explain_failure("KeyError: 'weird_internal_thing'")

    assert (info["business"], info["kind"], info["title"]) == (False, "server", "Unexpected error")
    assert info["reason"] == "KeyError: 'weird_internal_thing'"


def test_none_and_empty_are_handled():
    for value in (None, "", Exception("")):
        assert_business_readable(readable_failure(value))


# ------------------------------------------------------- traditional check text --

def test_primary_key_message_describes_the_data_not_a_constraint():
    message = build_failure_message("primary_key_check", "hcp_sales", "sale_id", "public", 6, None)

    # It is a value scan; saying "constraint" told the reader the wrong thing.
    assert "constraint" not in message.lower()
    assert "sale_id" in message
    assert "6" in message
    assert_business_readable(message)


def test_primary_key_message_handles_a_composite_key():
    message = build_failure_message("primary_key_check", "hcp_sales", ["hcp_id", "sale_dt"], "public", 2, None)

    assert "hcp_id" in message and "sale_dt" in message
    assert_business_readable(message)


def test_unknown_check_does_not_print_its_internal_name():
    message = build_failure_message("some_new_check", "hcp_sales", "col", "public", 3, None)

    assert "some_new_check" not in message
    assert_business_readable(message)


@pytest.mark.parametrize("check,args", [
    ("null_check", {}),
    ("duplicate_check", {}),
    ("length_check", {"detail1": 10}),
    ("format_check", {"detail1": r"^ABC-\d{4}$"}),
    ("lov_check", {"detail1": "A, B, C"}),
    ("ri_check", {}),
    ("file_availability_check", {}),
])
def test_every_standard_message_is_business_readable(check, args):
    message = build_failure_message(
        check, "hcp_sales", "sale_id", "public", 4, args.get("detail1"),
    )

    assert_business_readable(message)


@pytest.mark.parametrize("raw,fragment", [
    ("No field rules in traditional_config_details for: ['DBC0004']. A config with no field rules has nothing to check", "no field rules yet"),
    ("(psycopg2.OperationalError) SSL SYSCALL error: EOF detected", "connection to the database was interrupted"),
])
def test_run_level_errors_are_explained(raw, fragment):
    message = readable_failure(Exception(raw))

    assert fragment in message
    assert_business_readable(message)
