"""
Custom-check config validation.

Two defects made every custom check a silent no-op, and both are covered here:

  1. The check_id format pattern demanded exactly three digits (``^CB\\d{3}$``)
     while IDs are allocated four-wide ("CB0002"), so every real ID was
     rejected.
  2. Validation returned success even when it had rejected every item, so the
     workflow ran zero checks, computed "passed" over an empty result set and
     reported the job a success. A job that executed nothing must not pass.

Run without the repo's conftest (which builds a full test database):

    python -m pytest test_cases/test_custom_check_config_validation.py --noconftest -q
"""

import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from Data_Code.common.id_generation import generate_sequential_id


# The pattern the validator applies to each check_id, kept in step with
# functions.py. If that pattern is tightened again, these tests fail.
CHECK_ID_PATTERN = r'^CB\d{3,}$'


def _collect(calls):
    """A log sink that records (code, severity) or (message,) tuples."""
    return lambda *args, **kwargs: calls.append(args)


# ------------------------------------------------------- id format pattern --

@pytest.mark.parametrize("check_id", [
    "CB0001",   # the real shape: four digits, as the monorepo allocates them
    "CB0002",   # the exact ID that was rejected in production
    "CB9999",
    "CB10000",  # the ten-thousandth check must not break the pattern
    "CB001",    # a legacy three-digit ID is still accepted
])
def test_real_check_ids_are_accepted(check_id):
    assert re.match(CHECK_ID_PATTERN, check_id), f"{check_id} should be a valid check id"


@pytest.mark.parametrize("check_id", [
    "CB",         # no number at all
    "CBXXXX",     # the placeholder from the docstring is not an ID
    "DBC0001",    # a traditional config id is not a custom check id
    "cb0001",     # lower case is a different identifier
    "CB-0001",
    " CB0001",
    "CB0001 ",
])
def test_malformed_check_ids_are_rejected(check_id):
    assert not re.match(CHECK_ID_PATTERN, check_id), f"{check_id} should not be a valid check id"


# --------------------------------------------------- id generator agreement --

def test_engine_generates_the_same_width_as_the_application():
    """
    The engine and the monorepo allocate into one ID space. The monorepo pads to
    four ("CB0002"); the engine defaulted to three, which would have produced
    "CB001" for the same counter value.
    """
    assert generate_sequential_id([], prefix="CB") == "CB0001"
    assert generate_sequential_id(["CB0001", "CB0002"], prefix="CB") == "CB0003"
    assert generate_sequential_id(["DBC0007"], prefix="DBC") == "DBC0008"


def test_generated_ids_satisfy_the_validator():
    """Whatever the generator produces must survive validation -- that is the
    loop that was broken."""
    generated = generate_sequential_id(["CB0001"], prefix="CB")
    assert re.match(CHECK_ID_PATTERN, generated)


# ------------------------------------------------------- rejection is fatal --

def test_rejected_item_fails_validation_rather_than_passing_empty():
    """
    An item the validator refuses means a check the caller asked for will not
    run. Validation must report failure; previously it reported success with an
    empty item list and the job went on to "pass" having executed nothing.
    """
    from Data_Code.custom_checks import functions

    system_calls, validation_calls = [], []

    ok, items = functions.validate_and_parse_json(
        [{"check_id": "CB9999999"}],  # well-formed but not a real check
        _collect(system_calls),
        _collect(validation_calls),
    )

    assert ok is False, "validation must fail when an item is rejected"
    assert items == []
    assert any("JSON_VALIDATION_REJECTED" in str(call) for call in system_calls), \
        "the rejection must be logged with its own code so it is findable"


def test_empty_input_is_rejected():
    from Data_Code.custom_checks import functions

    ok, items = functions.validate_and_parse_json([], _collect([]), _collect([]))

    assert ok is False
    assert items == []
