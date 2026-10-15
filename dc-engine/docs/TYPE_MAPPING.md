# Data type mapping

How a data type written in a schema file becomes a check on real data, across the
declared vocabulary, Postgres and Snowflake.

Code: `trad_ct_id/type_mapping.py` (mapping, pure) and `trad_ct_id/datatype_scan.py`
(the TC004 scan). Upload-side aliases: `frontend/app/lib/schemaFile/parseSchemaFile.ts`.
`test_cases/test_datatype_scan.py` fails if the two alias tables ever disagree.

## The rule TC004 follows

**TC004 judges the values, never the column's type name.**

| Declared | Column is | Result |
|---|---|---|
| `string` / `varchar` | anything | Always passes. Any value is valid text, digits included. |
| `integer` | integer column | Passes without reading the table — it cannot hold a bad value. |
| `integer` | **text** column holding `"42"`, `"007"`, `" 5 "`, `"12.00"` | **Passes.** The data is usable as an integer; the column's definition does not matter. |
| `integer` | text column holding `"abc"` or `"1.5"` | Fails. Counts the rows that cannot be read as an integer. |

Only non-null, non-blank values are judged. Missing values belong to the null check,
so a half-empty column is not also reported as full of bad types.

`issue_rows` is the number of **rows** with at least one bad value, each counted once
however many columns are bad in it. Columns the table does not have are skipped —
TC002 reports those.

## Families

Everything reduces to six families.

| Family | Declared names (case-insensitive, `(precision)` ignored) |
|---|---|
| `text` | string, str, text, varchar, char, character, character varying, nvarchar, nchar, clob, bpchar |
| `integer` | integer, int, int2, int4, int8, smallint, bigint, tinyint, mediumint, long, short |
| `float` | float, float4, float8, real, double, double precision, decimal, numeric, number, dec, fixed |
| `date` | date |
| `datetime` | datetime, timestamp, timestamptz, timestamp_ntz, timestamp_ltz, timestamp_tz, timestamp [with/without time zone] |
| `boolean` | boolean, bool |

`number` and `decimal` are deliberately `float`: `NUMBER(38,0)` is an integer in
Snowflake, but the name alone cannot say, and a float declaration accepts whole numbers.

The upload additionally accepts `uuid`/`guid` (→ varchar), `json`/`jsonb`/`time`/`clob`
(→ string), `bit` (→ boolean), `year` (→ integer), `money` (→ float), `serial` (→ integer),
`datetime2` (→ datetime). A type outside the table is **rejected with a message**, not guessed.

## Native types

| Family | Postgres `data_type` | Snowflake `DATA_TYPE` |
|---|---|---|
| text | character varying, character, text, citext, name, bpchar | TEXT, VARCHAR, CHAR, STRING |
| integer | integer, bigint, smallint | *(none — see below)* |
| float | numeric, real, double precision, money | NUMBER, FLOAT, REAL, DECIMAL, NUMERIC |
| date | date | DATE |
| datetime | timestamp without/with time zone | TIMESTAMP_NTZ / _LTZ / _TZ |
| boolean | boolean | BOOLEAN |
| other | uuid, json, jsonb, bytea, arrays, time, interval… | VARIANT, OBJECT, ARRAY, BINARY… |

Snowflake reports every numeric as `NUMBER`, so there is no native integer. A declared
`integer` on a `NUMBER` column is therefore **scanned**, not assumed.
`other` types are scanned through their text rendering.

## When no scan is needed

A native type satisfies a declared one without reading data when it is the same family
or strictly narrower:

| Declared | Satisfied natively by |
|---|---|
| text | everything (never scanned) |
| integer | integer |
| float | integer, float |
| date | date |
| datetime | datetime, date |
| boolean | boolean |

## What counts as a valid value

One regular expression per family, used on both engines so "valid integer" means the same
thing everywhere. Values are trimmed first.

| Family | Accepted |
|---|---|
| integer | `+`/`-` optional, digits, optional all-zero fraction: `42`, `-7`, `007`, `12.00` |
| float | `12.50`, `-.5`, `13`, `1e3`, `2.5E-4` |
| boolean | `true false t f yes no y n 1 0` (any case) |
| date | ISO `YYYY-MM-DD`; a midnight time is allowed (`2020-01-31 00:00:00`) |
| datetime | ISO date plus optional `HH:MM[:SS[.fff]]`, optional `Z` or `±HH[:MM]` |

## Known limits

* **Calendar validity.** A date is checked for shape and month/day range, not the
  calendar: `2020-02-30` passes. The scan is one SQL pass on both engines, and the
  portable alternative to a regex is a per-engine try-cast.
* **ISO only.** `31/01/2020` and `01-Jan-2020` fail a date declaration. A schema file
  declares a type, not a format.
* **Snowflake is untested live.** The Postgres scan runs against a real database in
  the tests. The Snowflake SQL is covered structurally (dialect functions, no
  backslashes) because there is no working Snowflake connection to execute it on.
* **Cost.** A column that needs a scan costs one table read; all such columns share
  that single read.

## Messages

Column names are quoted:

```
Values do not match the expected data types in table hcp_sales: "age" (expected integer): 2 value(s) cannot be read as integer, e.g. "abc"
Column order mismatch in table hcp_sales: position 5 expected "territory" but found "sale_date"
Missing columns "zeta", "alpha" from expected schema
```

Missing columns are listed in declared order. They used to come out of a set
difference in a different order on every run.
