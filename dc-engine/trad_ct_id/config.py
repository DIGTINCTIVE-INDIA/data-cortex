import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

DATA_CHECKS = {
    "length_check",
    "format_check",
    "lov_check",
    "ri_check"
}

SCHEMA_CHECKS = {
    "column_name_check",
    "column_order_check",
    "datatype_check"
}

TEMPLATE_DATA_CHECKS = {
    "null_check",
    "duplicate_check",
    "primary_key_check"
}

FILE_CHECKS = {
    "file_availability_check"
}

# Only these go into invalid table
ROW_LEVEL_CHECKS = DATA_CHECKS | TEMPLATE_DATA_CHECKS

ALL_CHECKS = SCHEMA_CHECKS | DATA_CHECKS | FILE_CHECKS | TEMPLATE_DATA_CHECKS

# The only checks allowed to stop the rest of a config: the table or file has to exist
# (TC001), and its columns have to be named (TC002) and ordered (TC003) as expected for
# anything after them to mean anything. Every other check -- including the data-type
# check -- reports its own finding and lets the rest run. A failing column used to
# silence every check after it, which hid real problems behind the first one.
#
# The library's `abort` column is NOT this rule. There it means "mandatory": the check is
# always added to a config (tc_json_validator). TC004 stays mandatory and does not block.
BLOCKING_CHECK_IDS = frozenset({"TC001", "TC002", "TC003"})

CRITICALITY_WEIGHT = {
    "low": 1,
    "medium": 2,
    "high": 3
}