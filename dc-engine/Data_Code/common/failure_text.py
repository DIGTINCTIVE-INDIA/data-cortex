"""
Failure text, in three layers, and a kind.

Rows in `results` and the Jobs page are read by business users, not by whoever wrote the check.
A raw exception -- a psycopg2 message, a stack trace, an internal staging table name -- tells that
reader nothing they can act on. So a failure is described three ways:

  title   a short, plain name for what went wrong ("Storage bucket not found")
  reason  one or two sentences in the language of the data, saying what to look at
  detail  the raw exception (and traceback), for the developer

and classified, so it is clear whose problem it is:

  client   something the person can fix: their configuration, their data, their connection
           (table not found, wrong password, file missing, no checks ticked)
  service  a service the engine depends on is unavailable or overloaded; trying again later helps
  server   the engine itself is wrong or misconfigured; a developer has to look

The aim is that nearly every failure is a CLIENT error with a specific name. "server" is what is left
over when the cause is genuinely not the person's, and "Unexpected error" -- no known cause at all --
is also "server": when nothing matches, the reason is the raw error's first line, never a stand-in
sentence, because an unrecognised error is exactly when the real text is the most useful thing to show.

Nothing is discarded; it is routed.
"""

import re

CLIENT = "client"
SERVICE = "service"
SERVER = "server"

# First match wins, so the specific patterns are listed before the general ones.
# Matched against the exception text, which is why they are deliberately loose --
# the same condition is worded differently by Postgres, Snowflake, boto, pandas and the drivers.
# Each entry: (pattern, title, reason) or (pattern, title, reason, kind). Kind defaults to client.
# A pattern may capture names ((?P<name>...)) that the reason quotes back.
_CAUSES = [
    # ======================================================================================
    # The run request and who sent it
    # ======================================================================================
    (
        r"authentication element must be a dictionary|json data must be a list|payload must have at least|"
        r"first element must be a dictionary|each check element must be a dictionary|"
        r"'check_type' key not found|'check_type' must be a string|no config_id was supplied",
        "Run request is malformed",
        "The run request did not have the shape the engine expects. This is a bug in whatever sent "
        "it, not a problem with your data. Send the technical details to a developer.",
        SERVER,
    ),
    (
        r"user_id .* does not exist|user_id is required",
        "User not found",
        "The user who started this run does not exist, or was removed. Sign in again with an "
        "existing user.",
    ),

    # ======================================================================================
    # The check's configuration
    # ======================================================================================
    (
        r"no field rules",
        "No field rules configured",
        "This check has no field rules yet, so there is nothing to check. Open it and finish the "
        "field configuration step.",
    ),
    (
        r"validation produced no executable checks|no checks are enabled",
        "No checks are enabled",
        "None of this configuration's field rules has a check ticked (null, duplicate, length, "
        "format, list of values, primary key or referential integrity), so there is nothing to run. "
        "Open its field rules and tick at least one check.",
    ),
    (
        r"job payload failed validation against the configured field rules",
        "Field rules are invalid",
        "The field rules saved for this check did not pass the engine's validation. A rule may be "
        "incomplete or contradict another (for example a length range with its maximum below its "
        "minimum). Open the check and save its field rules again.",
    ),
    (
        r"no qc_tags row of type",
        "Library label missing",
        "A category, workstream, data source or downstream label this check uses was not found. "
        "Labels are managed under Configure Libraries.",
    ),
    (
        r"connection id .* not found|connection .* (was )?not found|no such connection",
        "Connection not found",
        "A connection this check uses no longer exists. Open the check and choose an existing "
        "connection for its source and target.",
    ),
    (
        r"could not resolve connection metadata",
        "Connection details could not be read",
        "The details of a connection this check uses could not be read. The connection may be "
        "missing or switched off. Open the check and confirm its source and target connections.",
    ),
    (
        r"(configuration|config|check) .*(not found|does not exist)|no (enabled )?configuration",
        "Check not found",
        "The check to run was not found, or it has been switched off.",
    ),
    (
        r"unsupported declared data type",
        "Declared data type not supported",
        "A field rule declares a data type the engine cannot check. Use one of: string, integer, "
        "float, date, datetime, boolean.",
    ),
    (
        r"missing schema mapping for",
        "Schema mapping missing",
        "A schema or table named by this check could not be matched to its connection. Open the "
        "check and confirm the source and target schema.",
    ),

    # ======================================================================================
    # Custom SQL
    # ======================================================================================
    (
        r"sql_query is required",
        "Custom SQL is empty",
        "This custom check has no query. Open it and write the SELECT that finds the failing rows.",
    ),
    (
        r"sql_query must be a single statement",
        "Custom SQL has more than one statement",
        "A custom check runs exactly one SELECT. Remove the extra statements after the semicolon.",
    ),
    (
        r"sql_query must be a plain select",
        "Only a SELECT is allowed",
        "A custom check may only read data. Statements that change data or structure (INSERT, "
        "UPDATE, DELETE, DROP and so on) are never run.",
    ),
    (
        r"sql_query uses sql a custom check does not support",
        "This SQL is not supported by custom checks",
        "A custom check must be a plain SELECT over one table, optionally filtered with WHERE. "
        "Joins, subqueries, grouping and similar are not supported.",
    ),
    (
        r"could not determine (the )?source table",
        "Custom SQL must read one named table",
        "The query must select from a single named table (not a subquery) so the engine knows "
        "which rows to report.",
    ),
    (
        r"validation query failed on connection [^:]*: (?P<why>.+)",
        "Custom SQL failed on the source",
        "The query could not be run on the source: {why}",
    ),
    (
        r"failed to persist invalid/valid rows for [^:]*: (?P<why>.+)",
        "Failing rows could not be written to the target",
        "The check found its results but could not write them to the target connection. Check the "
        "target's schema and permissions: {why}",
    ),

    # ======================================================================================
    # Storage (S3, Azure) and files
    # ======================================================================================
    (
        r"nosuchbucket|specified bucket does not exist|bucket .* does not exist|bucket .* not found",
        "Storage bucket not found",
        "The storage bucket named in the connection does not exist, or its name is misspelled. "
        "Open the file connection and check the bucket name and region.",
    ),
    (
        r"invalidbucketname|specified bucket is not valid|bucket name .*(invalid|not valid)",
        "Storage bucket name is invalid",
        "The bucket name in the connection is not a valid bucket name. Check it for spaces, "
        "capitals or slashes.",
    ),
    (
        r"invalidaccesskeyid|signaturedoesnotmatch|access key id you provided does not exist|"
        r"the request signature we calculated does not match",
        "Storage credentials rejected",
        "The storage access key or secret was rejected. They may be wrong or have been rotated. "
        "Open the file connection and re-enter them.",
    ),
    (
        r"expiredtoken|tokenrefreshrequired|security token .*expired|token has expired",
        "Storage credentials expired",
        "The temporary storage credentials have expired. Refresh them on the file connection.",
    ),
    (
        r"nocredentialserror|unable to locate credentials",
        "Storage credentials are missing",
        "The file connection has no access key or secret. Open it and enter them.",
    ),
    (
        r"permanentredirect|authorizationheadermalformed|must be addressed using the specified endpoint|"
        r"region .* (is )?wrong|incorrect region",
        "Storage region is wrong",
        "The bucket lives in a different region from the one in the connection. Open the file "
        "connection and set the bucket's actual region.",
    ),
    (
        r"no objects found with prefix|no objects match pattern|nosuchkey|no such key|key does not exist|"
        r"file not found|\(404\) when calling the headobject|\(404\) when calling the getobject|filenotfounderror",
        "File not found",
        "The file for this check was not found in its storage location. It may not have been "
        "uploaded yet, or it may have been moved or renamed.",
    ),
    (
        r"accessdenied|\bforbidden\b|\(403\)|http 403",
        "Storage access denied",
        "The connection's credentials are valid but are not allowed to read this bucket or "
        "folder. Ask whoever manages the storage to grant read access.",
    ),
    (
        r"endpointconnectionerror|could not connect to the endpoint url|connecttimeouterror|readtimeouterror",
        "Storage could not be reached",
        "The storage service could not be reached. Its endpoint may be wrong, or the service or "
        "network may be down.",
        SERVICE,
    ),
    (
        r"slowdown|serviceunavailable|requesttimeout|internalerror.*s3|please reduce your request rate",
        "Storage is temporarily unavailable",
        "The storage service is busy or briefly unavailable. Run the check again in a moment.",
        SERVICE,
    ),
    (
        r"no usable connection ids",
        "Nothing could be read",
        "None of the files or tables this run needed could be read, so nothing was checked. The "
        "source or target connection may be missing or switched off, or the file may not exist. "
        "Open the check's source and target and confirm they are reachable.",
    ),
    (
        r"azure connection requires",
        "Azure connection is incomplete",
        "The Azure connection is missing its account name, tenant, client id or client secret.",
    ),
    (
        r"pattern cannot be empty",
        "File name is empty",
        "The check has no file name or pattern to look for. Open it and enter the file name.",
    ),
    (
        r"invalid regex pattern",
        "File name pattern is invalid",
        "The file name pattern is not a valid regular expression. Check it for an unclosed bracket "
        "or a stray symbol.",
    ),
    (
        r"unsupported file format|unsupported connector type",
        "File type not supported",
        "The engine cannot read this kind of file. Supported types are csv, tsv, json and Excel "
        "(.xlsx).",
    ),
    (
        r"excel file must contain exactly one sheet",
        "Excel workbook has more than one sheet",
        "The workbook has several sheets. Keep the data on a single sheet and upload it again.",
    ),
    (
        r"json must contain an object or an array of objects",
        "JSON has the wrong shape",
        "The JSON file must be one list of records (an array of objects). A single value or a list "
        "of plain values cannot be read as rows.",
    ),
    (
        r"schema file .*(must be a json object|must be an object|missing column_order|missing dtype|non-integer column_order)",
        "Expected schema file is invalid",
        "The expected-schema file is incomplete. Every column needs a data type and an order number.",
    ),
    (
        r"unable to parse (parquet|excel) file",
        "File could not be read",
        "The file is damaged, or is not in the format its name says. Open it, save it again and "
        "upload the new copy.",
    ),

    # ======================================================================================
    # Snowflake specifics
    # ======================================================================================
    (
        r"role '[^']+' specified in the connect string|role .* does not exist or not authorized",
        "Snowflake role not found",
        "The Snowflake role named in the connection does not exist or this user may not use it. "
        "Open the connection and fix or clear the role.",
    ),
    (
        r"database '[^']+' does not exist|database .* does not exist or not authorized",
        "Database not found",
        "The database named in the connection does not exist, or this user is not allowed to use it. "
        "Open the connection and check the database name.",
    ),
    (
        r"\bschema '(?P<name>[^']+)' does not exist",
        "Schema not found",
        "A schema named in the connection (\"{name}\") does not exist, or this user may not use it. "
        "Open the connection and set a schema that exists.",
    ),
    (
        r"object does not exist, or operation cannot be performed",
        "Table not found",
        "The table or view was not found, or this user may not read it. It may have been renamed or "
        "dropped, or the connection may be pointing at a different schema.",
    ),
    (
        r"snowflake.*(private key|requires username|requires account|stored password|key value)|"
        r"snowflakeconfigerror|snowflakeprivatekeyerror",
        "Snowflake connection is incomplete",
        "The Snowflake connection is missing something it needs to sign in (account, user, or a "
        "valid private key or password). Open the connection and re-enter its details.",
    ),
    (
        r"no active warehouse|does not have a current database|no current database|"
        r"warehouse .*(does not exist|cannot be resumed|is suspended)",
        "Snowflake connection is missing its warehouse or database",
        "Snowflake could not run the query because the connection has no active warehouse or no "
        "database selected. Open the connection and set both, or give the user a default "
        "warehouse.",
    ),
    (
        r"account .*(is locked|has been locked)|user access disabled|user .* is locked|free trial has ended",
        "Snowflake account is not usable",
        "Snowflake refused the sign-in because the account or user is locked, disabled or expired. "
        "Ask the Snowflake administrator.",
    ),
    (
        r"snowflake rejected the key|private key could not be read",
        "Snowflake key was rejected",
        "Snowflake did not accept the private key. Check that it is complete and that its public "
        "key is registered on the user.",
    ),

    # ======================================================================================
    # What is inside the data
    # ======================================================================================
    (
        r"no columns to parse|emptydataerror|file is empty|zero bytes|0 bytes|no records found|"
        r"table .* is empty|source (is )?empty",
        "Source is empty",
        "The file or table has no rows (or no header), so there is nothing to check. Load data "
        "into it and run the check again.",
    ),
    (
        r"unable to decode .* as utf-8|codec can't decode|utf-8.*(invalid|decode)",
        "File is not UTF-8 text",
        "The file could not be read as text. It may be saved in another encoding (such as "
        "UTF-16 or Latin-1) or may not be a csv at all. Save it as UTF-8 and upload it again.",
    ),
    (
        r"unable to decode json|invalid json in|jsondecodeerror|expecting value|json.*(invalid|malformed)|"
        r"extra data: line",
        "File is not valid JSON",
        "The file is not valid JSON, or is not a list of records. Check it for a missing bracket "
        "or a comma, and that it is one array of objects.",
    ),
    (
        r"badzipfile|not a zip file|openpyxl|xlrd|excel file format|corrupt.*xlsx|xlsx.*corrupt",
        "Excel file could not be opened",
        "The Excel file is damaged or is not really an .xlsx workbook. Open it in Excel, save it "
        "again, and upload the new copy.",
    ),
    (
        r"error tokenizing data|expected \d+ fields|csv.*(error|malformed)|delimiter",
        "File could not be split into columns",
        "The file's rows do not line up with its header. The delimiter may be wrong or some rows "
        "have the wrong number of values.",
    ),
    (
        r"\[.*\] not in index|columns? .* (not found|missing) in (the )?(file|data)",
        "Column not found in the file",
        "A column this check needs is not in the file. It may have been renamed or removed since "
        "the check was configured.",
    ),
    (
        r"column .* does not exist|undefined[_ ]column|invalid identifier",
        "Column not found",
        "A column this check needs was not found in the source table. It may have been renamed "
        "or removed since the check was configured.",
    ),
    (
        r"database \"[^\"]+\" does not exist|database .* does not exist or this user cannot use it",
        "Database not found",
        "The database named in the connection does not exist, or this user is not allowed to use it. "
        "Open the connection and check the database name.",
    ),
    (
        r"(?P<which>source|target) schema '(?P<name>[^']+)' does not exist",
        "Schema not found",
        "The {which} schema \"{name}\" does not exist in the database. Open the connection and set "
        "a schema that exists.",
    ),
    (
        r"schema \"(?P<name>[^\"]+)\" does not exist|invalidschemaname",
        "Schema not found",
        "A schema named in the connection (\"{name}\") does not exist. Open the connection and set a "
        "schema that exists.",
    ),
    (
        r"invalid (postgresql|postgres|snowflake|mysql)? ?schema name",
        "Schema name is not allowed",
        "The schema name on the connection contains characters that are not allowed. Use only "
        "letters, digits and underscores, and do not start with a digit.",
    ),
    (
        r"role \"[^\"]+\" does not exist|role '[^']+' does not exist",
        "Database user not found",
        "The user or role named in the connection does not exist on the database. Open the "
        "connection and check the user name.",
    ),
    (
        r"(relation|table) .* does not exist|undefined[_ ]table|no such table|does not exist or not authorized",
        "Table not found",
        "The source table was not found. It may have been renamed or dropped, or the connection "
        "may be pointing at a different schema.",
    ),
    (
        r"(relation|table) .* already exists|duplicate key value violates unique constraint",
        "Result table already in use",
        "A table with the name this check wants to create already exists, or two checks are writing "
        "the same result tables. Give each check its own target table prefix.",
    ),
    (
        r"invalid input syntax for type json|json data, line \d+",
        "JSON value could not be saved",
        "A column holds nested JSON that the engine could not write to the result table. This is "
        "a limitation of the engine, not of the data: send the technical details to the developer.",
        SERVER,
    ),
    (
        r"unterminated quoted identifier|unterminated quoted string",
        "Column name has an unsupported character",
        "A column name contains a quote character, which cannot be used to create the result "
        "tables. Rename the column in the source.",
    ),
    (
        r"value too long for type|numeric field overflow|out of range for type",
        "Value does not fit its column",
        "A value in the data is larger than the column in the result table can hold. The source "
        "column may be wider than expected.",
    ),
    (
        r"invalid input syntax|could not convert|cannot be cast",
        "Value does not match its type",
        "A value in the source could not be read as the type this check expects.",
    ),
    (
        r"reference table has more than .* distinct values",
        "Reference table is too large to compare",
        "The referential-integrity reference table has too many distinct values to compare "
        "across two connections. Put the reference table on the same connection as the data, or "
        "check against a smaller reference.",
    ),

    # ======================================================================================
    # Access and network
    # ======================================================================================
    (
        r"permission denied|not authorized|insufficient privilege|access denied",
        "Permission denied",
        "The connection does not have permission to read this data.",
    ),
    (
        r"authentication failed|password authentication|invalid username or password|jwt token is invalid|"
        r"incorrect username or password",
        "Sign-in was rejected",
        "The connection's credentials were rejected. The password or key may have expired.",
    ),
    (
        r"no pg_hba\.conf entry|server does not support ssl|ssl (is )?required|sslmode",
        "Database refused the connection",
        "The database does not accept connections from this address, or it requires (or does not "
        "support) SSL. Check the connection's SSL setting and the server's access rules.",
    ),
    (
        r"redis|kombu.*operationalerror|broker.*(refused|unreachable)",
        "Job queue is unavailable",
        "The queue that carries runs between the services is not reachable. Nothing is lost; try "
        "again once it is back.",
        SERVICE,
    ),
    (
        r"could not connect|connection refused|could not translate host|name or service not known|"
        r"network is unreachable|nodename nor servname|failed to resolve|failed to connect",
        "Source could not be reached",
        "The database or storage could not be reached. Its address may be wrong, or the service "
        "or network may be down.",
    ),
    (
        r"ssl syscall|server closed the connection|connection (was )?reset|eof detected|lost connection to|"
        r"terminating connection due to administrator command|connection already closed",
        "Connection was interrupted",
        "The connection to the database was interrupted. Run the check again; if it keeps "
        "happening, the database may be unavailable.",
        SERVICE,
    ),
    (
        r"the database system is (starting up|shutting down)|database system is in recovery",
        "Database is restarting",
        "The database is starting up or shutting down. Run the check again in a few minutes.",
        SERVICE,
    ),
    (
        r"too many connections|remaining connection slots|too many clients",
        "Database is out of connections",
        "The database has no free connections right now. Run the check again shortly, or lower how "
        "many checks run at once.",
        SERVICE,
    ),
    (
        r"deadlock detected|could not serialize access",
        "Database conflict",
        "Two operations collided in the database. Run the check again.",
        SERVICE,
    ),
    (
        r"timelimitexceeded\((?P<seconds>\d+)",
        "Run stopped at its time limit",
        "The run was stopped after {seconds} seconds, the longest a single run is allowed. The "
        "source may be very large, the system overloaded, or a query stuck.",
        SERVICE,
    ),
    (
        r"timeout|timed out|canceling statement due to statement timeout|softtimelimitexceeded",
        "Check took too long",
        "The check took too long and was stopped before it finished.",
        SERVICE,
    ),

    # ======================================================================================
    # The check itself
    # ======================================================================================
    (
        r"syntax error|sql compilation error|syntaxerror",
        "SQL could not be run",
        "The SQL for this check could not be run. The query in the check's configuration needs "
        "to be corrected.",
    ),
    (
        r"division by zero",
        "Calculation divided by zero",
        "The check's calculation divided by zero.",
    ),
    (
        r"current transaction is aborted|infailedsqltransaction",
        "An earlier step failed",
        "A previous statement in this job failed and the database refused the rest. The first "
        "error is what to look at: open the technical details or the job log and read the "
        "earliest error.",
    ),
    (
        r"unsupported (database|rds|target database|lov) type|unsupported rds[_ ]engine|database_type is missing",
        "Database type not supported",
        "The engine cannot use this kind of database for this step. Supported types are PostgreSQL "
        "and Snowflake.",
    ),
    (
        r"(postgresql|mysql|snowflake) database(/database_name)?( and schema)? (is|are) required|database_name is required",
        "Connection is incomplete",
        "The connection has no database or schema set. Open it and fill them in.",
    ),
    (
        r"error fetching (postgresql|mysql|snowflake) tables|error fetching table",
        "Tables could not be listed",
        "The list of tables could not be read from this connection. Check the connection's database, "
        "schema and permissions.",
    ),
    (
        r"file check failed: (?P<why>.+)",
        "File check failed",
        "The file could not be checked: {why}",
    ),
    (
        r"workflow stopped: (?P<why>.+)",
        "Run stopped",
        "The run stopped part-way: {why}",
    ),
    (
        r"failed to create execution df: (?P<why>.+)",
        "Run could not be prepared",
        "The run could not be set up: {why}",
    ),
    (
        r"table name must be provided",
        "Table name is empty",
        "The check has no table name. Open it and choose the table to check.",
    ),
    (
        r"failed to (set connection|get connection details|get file connection details)[^:]*: (?P<why>.+)",
        "Connection could not be opened",
        "The connection this check uses could not be opened: {why}",
    ),
    # A driver's own wrapper around a connection failure whose cause was not recognised above:
    # say it was the connection, and quote what the database said.
    (
        r"(?P<db>postgresql|mysql|snowflake) connection error: (?P<why>.+)",
        "Database connection failed",
        "The {db} connection failed: {why}",
    ),

    # ======================================================================================
    # The engine itself
    # ======================================================================================
    (
        r"traditional_checks_library_rev returned 0 rows",
        "Check catalogue is empty",
        "The engine's list of check types (TC001-TC011) is empty. The database setup has not been "
        "run on this environment (the backend's db:init).",
        SERVER,
    ),
    (
        r"schema validation failed after init|orm expects the following",
        "Database schema is out of date",
        "The tables or columns the engine expects are missing from the database, so it refused to "
        "run. Apply the database push for this environment, then restart the engine.",
        SERVER,
    ),
    (
        r"result row\(s\) could not be stored|result_row_unwritable",
        "Results could not be saved",
        "The checks ran, but some results could not be written to the database. The rows and "
        "reasons are in the technical details.",
        SERVER,
    ),
    (
        r"rds_\w+ .*(missing|not set|must be)|database credentials \(rds_\*\)|is not a valid integer.*\.env|"
        r"could not import data_code orm|not set -- refusing to start|invalid sequence name|"
        r"unknown label lookup table",
        "Engine is not configured correctly",
        "The engine's own settings are incomplete or invalid (database credentials, encryption key). "
        "A developer must fix the engine's environment.",
        SERVER,
    ),
    (
        r"snowflake-connector-python is required|boto3 is required|azure-storage-blob .* required|"
        r"no module named|modulenotfounderror|importerror",
        "A required library is missing in the engine",
        "The engine is missing a library it needs for this kind of connection. A developer must "
        "install it and rebuild the engine.",
        SERVER,
    ),
    (
        r"failed to (generate|save|update|delete|list) (db-based|file-based|custom|database connection)|"
        r"error fetching (db-based|file-based|custom) ",
        "Configuration could not be saved or read",
        "The engine could not read or write this configuration in its database. See the technical "
        "details for the database's own message.",
        SERVER,
    ),
    (
        r"column_order is missing|actual columns not fetched|datatype findings were not produced|"
        r"no template found|no entry found for check|invalid check name|column name required|"
        r"column_order and column_datatype are both required|no value predicate|"
        r"build_scan_sql needs|cannot determine same-host",
        "Check could not be built",
        "The engine was asked for a check it cannot build because a rule is missing a value it "
        "needs. The technical details name the rule.",
        SERVER,
    ),
    (
        r"no check results found|unknown criticality",
        "Run produced no results",
        "The run finished without producing any check results, so no overall outcome could be "
        "worked out. The technical details show where it stopped.",
        SERVER,
    ),
    (
        r"workerlosterror|worker exited prematurely|signal 9|sigkill|out of memory|memoryerror|disk full|"
        r"no space left|quota exceeded",
        "Ran out of resources",
        "The check ran out of memory or disk and was stopped. A smaller source, or more "
        "resources for the engine, is needed.",
        SERVICE,
    ),
]

UNRECOGNISED_TITLE = "Unexpected error"


def _first_line(text: str, limit: int = 400) -> str:
    for line in text.splitlines():
        if line.strip():
            line = line.strip()
            return line if len(line) <= limit else line[: limit - 1] + "…"
    return ""


def _clean(value: str) -> str:
    """A captured piece of an error, trimmed to something that fits in a sentence."""
    value = value.strip().strip("'\")").splitlines()[0] if value.strip() else ""
    return value if len(value) <= 240 else value[:239] + "…"


def explain_failure(error, traceback_text: str = "") -> dict:
    """
    Describe a failure three ways and say whose problem it is.

    Returns {"title", "reason", "detail", "business", "kind"}:
      title     short plain name of the problem
      reason    what it means for the person reading, or -- when the error is not one we know --
                the raw error's first line (never a stand-in sentence)
      detail    the raw exception, plus the traceback when there is one, for the developer
      business  True when a known cause matched, False when the raw text is all there is
      kind      "client" (the person can fix it), "service" (a dependency is unavailable; try
                again), or "server" (the engine is at fault, or the cause is unknown)
    """
    text = str(error or "")
    detail = text
    if traceback_text and traceback_text.strip():
        detail = (detail + "\n\n" + traceback_text.strip()).strip()

    # Name the place that was searched: it is the person's own configured location, and the
    # fastest way to see a wrong folder or file name.
    missing = re.search(r"no objects (?:found with prefix|match pattern): (\S+)", text, re.IGNORECASE)
    if missing:
        return dict(
            title="File not found",
            reason=(
                f"The file for this check was not found in its storage location (looked for "
                f"\"{missing.group(1)}\"). It may not have been uploaded yet, or the folder or "
                "file name in the configuration may be wrong."
            ),
            detail=detail,
            business=True,
            kind=CLIENT,
        )

    for entry in _CAUSES:
        pattern, title, reason = entry[0], entry[1], entry[2]
        kind = entry[3] if len(entry) > 3 else CLIENT
        found = re.search(pattern, text, re.IGNORECASE)

        if found:
            captured = {key: value for key, value in found.groupdict().items() if value is not None}

            if captured:
                reason = reason.format(
                    **{key: (value.lower() if key in ("which", "db") else _clean(value)) for key, value in captured.items()}
                )

            return dict(title=title, reason=reason, detail=detail, business=True, kind=kind)

    return dict(
        title=UNRECOGNISED_TITLE,
        reason=_first_line(text) or "The job failed and the engine gave no message.",
        detail=detail,
        business=False,
        kind=SERVER,
    )


def readable_failure(error) -> str:
    """
    The reason text for a failure, for rows that carry one sentence (results.failure_reason).

    A known cause gives its business sentence; anything else gives the raw error's first line.
    It is never a stand-in sentence that hides what actually happened.
    """
    return explain_failure(error)["reason"]
