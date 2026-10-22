"""
Business-facing failure text.

Rows in `results` are read by business users in QC Alerts and the QC report, not by
whoever wrote the check. A raw exception -- a psycopg2 message, a stack trace, an
internal staging table name -- tells that reader nothing they can act on, and puts
implementation detail into something that gets exported and circulated.

So the rule is: `failure_reason` says what happened in the language of the data, and
the technical detail goes to `system_logs`, which is where an engineer looks. Nothing
is discarded; it is routed.
"""

import re

# First match wins, so the specific patterns are listed before the general ones.
# Matched against the exception text, which is why they are deliberately loose --
# the same condition is worded differently by Postgres, Snowflake and the drivers.
_CAUSES = [
    (
        r"no field rules",
        "This check has no field rules yet, so there is nothing to check. Open it and "
        "finish the field configuration step.",
    ),
    (
        r"no objects found with prefix|nosuchkey|no such key|key does not exist|file not found",
        "The file for this check was not found in its storage location. It may not have been "
        "uploaded yet, or it may have been moved or renamed.",
    ),
    (
        r"no usable connection ids",
        "None of the files or tables this run needed could be read, so nothing was checked. "
        "Open the check's source and target and confirm they are reachable and the file exists.",
    ),
    (
        r"ssl syscall|server closed the connection|connection (was )?reset|eof detected",
        "The connection to the database was interrupted. Run the check again; if it keeps "
        "happening, the database may be unavailable.",
    ),
    (
        r"column .* does not exist|undefined[_ ]column|invalid identifier",
        "A column this check needs was not found in the source table. It may have been "
        "renamed or removed since the check was configured.",
    ),
    (
        r"(relation|table) .* does not exist|undefined[_ ]table|no such table|does not exist or not authorized",
        "The source table was not found. It may have been renamed or dropped, or the "
        "connection may be pointing at a different schema.",
    ),
    (
        r"permission denied|not authorized|insufficient privilege|access denied",
        "The connection does not have permission to read this data.",
    ),
    (
        r"authentication failed|password authentication|invalid username or password|jwt token is invalid",
        "The connection's credentials were rejected. The password or key may have expired.",
    ),
    (
        r"could not connect|connection refused|could not translate host|name or service not known|network is unreachable",
        "The source could not be reached. The database or the network may be unavailable.",
    ),
    (
        r"timeout|timed out|canceling statement due to statement timeout",
        "The check took too long and was stopped before it finished.",
    ),
    (
        r"syntax error|sql compilation error",
        "The SQL for this check could not be run. The query in the check's configuration "
        "needs to be corrected.",
    ),
    (
        r"division by zero",
        "The check's calculation divided by zero.",
    ),
    (
        r"out of memory|disk full|no space left|quota exceeded",
        "The check ran out of resources before it could finish.",
    ),
    (
        r"invalid input syntax|could not convert|cannot be cast",
        "A value in the source could not be read as the type this check expects.",
    ),
]

GENERIC_FAILURE = (
    "This check could not be completed. The technical detail has been recorded in the job log."
)


def readable_failure(error) -> str:
    """
    Turn an exception into something worth showing a business user.

    Falls back to a generic sentence rather than the exception text: an unrecognised
    error is exactly the case where the raw message is least likely to mean anything
    to the reader, and most likely to leak internals.
    """
    text = str(error or "")

    # Name the place that was searched: it is the person's own configured location, and
    # the fastest way to see a wrong folder or file name.
    missing = re.search(r"no objects (?:found with prefix|match pattern): (\S+)", text, re.IGNORECASE)
    if missing:
        return (
            f"The file for this check was not found in its storage location (looked for "
            f"\"{missing.group(1)}\"). It may not have been uploaded yet, or the folder or "
            "file name in the configuration may be wrong."
        )

    for pattern, explanation in _CAUSES:
        if re.search(pattern, text, re.IGNORECASE):
            return explanation

    return GENERIC_FAILURE
