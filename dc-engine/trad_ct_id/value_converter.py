import json
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import orjson

def parse_json_field(value):
    """
    Parse column_order / column_datatype from the checks execution df.

    On a schema-check row these are JSON maps ('{"id": 1, ...}'). On every other row they
    can hold something unrelated -- the field's OWN type name ("varchar", "integer"),
    since traditional_config_details stores a datatype per field -- or be blank. Handing
    "varchar" to json.loads raised "Expecting value", which errored every primary-key and
    null check in the job.

    Only a string that is shaped like a JSON object or array is parsed, and one that is
    shaped like it but malformed STILL raises: a corrupt schema map must fail loudly, not
    quietly turn into "no schema". Anything else is not a map, so it is None.
    """
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if text[:1] in ("{", "["):
            return json.loads(text)
        return None
    return value


def quote_identifier(name, database_type):

    database_type = database_type.lower()

    if database_type == "postgresql" or database_type == "postgres":
        return f'"{name}"'
    elif database_type == "snowflake":
        return f'"{name.upper()}"'
    raise ValueError(f"Unsupported database type: {database_type}")


def normalize_rows(cursor_rows):
    # Converts cursor rows into plain dicts with lowercase keys
    # Fixes Snowflake returning UPPERCASE column names
    normalised = []
    for row in cursor_rows:
        plain_row = dict(row)
        clean_row = {}
        for key, value in plain_row.items():
            clean_row[key.lower()] = value
        normalised.append(clean_row)
    return normalised


def serialize_value_for_file(value, col, target_database_type):
    # Converts ONE value for writing into a CSV file - JSON
    if value is None:
        return None

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, (bytes, memoryview)):
        return bytes(value).decode("utf-8", errors="replace")

    if col.startswith("_") and col not in ("_job_id", "_job_timestamp"):
        return orjson.dumps(value).decode("utf-8")

    if isinstance(value, datetime):
        return value.isoformat()

    return value

# Picks the data type from source database and converts to equivalent datatype for target db
def map_to_target_type(source_data_type, target_database_type):

    normalized = source_data_type.lower()

    type_map = {
        "postgresql": {
            "integer": "INTEGER", "bigint": "BIGINT", "smallint": "SMALLINT",
            "numeric": "NUMERIC", "decimal": "NUMERIC",
            "real": "REAL", "double precision": "DOUBLE PRECISION",
            "character varying": "CHARACTER VARYING", "varchar": "TEXT", "text": "TEXT",
            "char": "TEXT", "character": "TEXT",
            "boolean": "BOOLEAN", "date": "DATE",
            "timestamp without time zone": "TIMESTAMP",
            "timestamp with time zone": "TIMESTAMPTZ",
            "uuid": "UUID", "json": "JSONB", "jsonb": "JSONB",
        },
        "snowflake": {
            "integer": "NUMBER", "bigint": "NUMBER", "smallint": "NUMBER",
            "numeric": "NUMBER", "decimal": "NUMBER",
            "real": "FLOAT", "double precision": "FLOAT",
            "character varying": "TEXT", "varchar": "TEXT", "text": "TEXT",
            "char": "TEXT", "character": "TEXT",
            "boolean": "BOOLEAN", "date": "DATE",
            "timestamp without time zone": "TIMESTAMP_NTZ",
            "timestamp with time zone": "TIMESTAMP_TZ",
            "uuid": "TEXT", "json": "VARIANT", "jsonb": "VARIANT",
            "number": "NUMBER", "float": "FLOAT", "variant": "VARIANT",
            "timestamp_ntz": "TIMESTAMP_NTZ", "timestamp_tz": "TIMESTAMP_TZ",
        }
    }

    target_types = type_map.get(target_database_type, {})
    return target_types.get(normalized, "TEXT")