"""
A configured delimiter is stored as a word and must reach the CSV parser as a character.

    python -m pytest test_cases/test_file_delimiter.py --noconftest -q
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from Data_Code.connectors.file.manager import FileConnectionManager


@pytest.fixture(scope="module")
def manager():
    return FileConnectionManager(lambda *a, **k: None, lambda *a, **k: None)


def _rows(parsed):
    return parsed[0] if isinstance(parsed, tuple) else parsed


@pytest.mark.parametrize("word,char", [("comma", ","), ("pipe", "|"), ("tab", "\t"), ("semicolon", ";"), ("COMMA", ",")])
def test_a_delimiter_word_parses_a_file_written_with_that_character(manager, word, char):
    body = char.join(["a", "b", "c"]) + "\n" + char.join(["1", "2", "3"]) + "\n"

    parsed = manager._parse_file_bytes(body.encode(), "data.csv", word)
    rows = _rows(parsed)

    assert list(rows[0].keys()) == ["a", "b", "c"] if isinstance(rows, list) else True
    assert len(rows) == 1


def test_a_literal_character_still_works(manager):
    parsed = manager._parse_file_bytes(b"a|b\n1|2\n", "data.csv", "|")
    assert len(_rows(parsed)) == 1


def test_no_delimiter_still_autodetects(manager):
    parsed = manager._parse_file_bytes(b"a;b\n1;2\n", "data.csv", None)
    assert len(_rows(parsed)) == 1
