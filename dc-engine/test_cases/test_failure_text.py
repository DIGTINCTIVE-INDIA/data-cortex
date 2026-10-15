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

from Data_Code.common.failure_text import GENERIC_FAILURE, readable_failure
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


def test_an_unrecognised_error_never_leaks_its_text():
    """The case where the raw message is least likely to mean anything, and most
    likely to contain internals."""
    secret = "Traceback (most recent call last): psycopg2.OperationalError at 10.0.0.4:5432"
    message = readable_failure(Exception(secret))

    assert message == GENERIC_FAILURE
    assert "10.0.0.4" not in message
    assert_business_readable(message)


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
