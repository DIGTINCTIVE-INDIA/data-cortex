# Data-type check (TC004): rules, mappings and how files differ

This is the contract for how Data Cortex decides whether a column's data is the type the
configuration says it should be. Every rule below is enforced by the same SQL on every engine,
and is covered by `dc-engine/test_cases/test_dtype_accuracy.py`, which runs one table of
hand-derived cases on Postgres and Snowflake.

## 1. The principle

> The data decides. The column's own type is only a shortcut.

A configuration says "this column is an integer". TC004 asks: **does every value in the column
read as an integer?** It does not ask whether the column was *defined* as an integer.

| What the user declared | What the column is | What is in it | Result |
|---|---|---|---|
| integer | `varchar` | `"123"`, `"45"`, `"007"` | **Pass** - text holding whole numbers is usable as integers |
| integer | `varchar` | `"123"`, `"12a"` | **Fail** - 1 row cannot be read as an integer |
| integer | `integer` | anything | **Pass, not read** - an integer column cannot hold a non-integer |
| integer | `numeric(10,0)` / Snowflake `NUMBER(10,0)` | anything | **Pass, not read** - only whole numbers fit |
| integer | `numeric(10,2)` | `12.00`, `12.50` | **Fail** on `12.50` - the number itself is tested |
| string | any | anything | **Pass** - every value, digits included, is valid text |

Nulls and blank values are never judged here. They belong to the null check, so a half-empty
column is not also reported as full of wrong types.

## 2. Where TC004 sits among the checks

There are three kinds of check, and they behave differently on purpose.

| Kind | Checks | Result is | If it fails |
|---|---|---|---|
| **Gate** | TC001 file/table available, TC002 column names, TC003 column order | one pass/fail for the whole table or file (`NA` rows) | **stops the rest of that configuration.** Without the table, or with the wrong columns, nothing after it means anything |
| **Value conformance** | TC004 data type | a **count**: rows that fit, rows that do not | reports and **lets the rest run** |
| **Row rules** | TC005 primary key, TC006 referential integrity, TC007 null, TC008 duplicate, TC009 list of values, TC010 format, TC011 length | a **count** of rows that fail | reports and lets the rest run |

TC004 reports, for the table: *N rows have at least one value that does not fit, M rows do.* A row
with two bad columns counts once. The message names each failing column, how many of its values
failed, and one real example. It never stops other checks: every other check reads values as text, so
a wrong type in one column cannot break them.

(`abort` in the checks library means "mandatory - always added to a configuration". It is not the
blocking rule. Blocking is a fixed list, `BLOCKING_CHECK_IDS = TC001, TC002, TC003`, in
`trad_ct_id/config.py`.)

## 3. The decision for each column

For each column that has a declared type, in this order:

1. **Declared as text** -> pass, not read.
2. **The column cannot hold a bad value** -> pass, not read (table in section 5).
3. **Declared integer, column is a numeric type** -> every *number* is tested: is it whole, and
   does it fit the declared width.
4. **Anything else** -> every non-null, non-blank value's *text* is tested against the rules in
   section 4.

All columns that need reading are read in **one pass over the table**.

## 4. What each declared type accepts (text rules)

Surrounding whitespace (space, tab, CR, LF, no-break space) is ignored in every rule.

| Declared | Accepted | Rejected (examples) |
|---|---|---|
| **integer** | optional `+`/`-`, 1-38 digits, optionally a fraction of only zeros: `12`, `+12`, `-12`, `007`, `12.0`, `12.00` | `12.5`, `1e3`, `1,000`, `12a`, `1_000`, `0x1F`, full-width digits, more than 38 digits |
| **float** (also `number`, `decimal`, `numeric`, `double`, `real`) | optional sign, digits with an optional point, or `.5`, optional exponent: `12`, `12.5`, `.5`, `5.`, `1e3`, `1.5e+3` | `NaN`, `Infinity`, `1,000`, `$5`, `(5)`, `1e` |
| **date** | `YYYY-MM-DD` that **exists on the calendar**, optionally followed by a midnight time (`00:00`, `00:00:00`, fractions of zero) and zone | `2021-02-29`, `2020-04-31`, `0000-01-01`, `31/01/2020`, `2020-1-5`, `20200131` is *not* a date (it is a number) |
| **datetime** (also `timestamp*`) | a date as above, optionally `T` or space, then `HH:MM[:SS[.fraction]]`, then optionally `Z` or a zone offset `+HH`, `+HH:MM`, `+HHMM` up to `+14:00` | `24:00:00`, `23:59:60`, `+15:00`, `+05:60`, a date with an hour but no minutes |
| **boolean** | `true`, `false`, `t`, `f`, `yes`, `no`, `y`, `n`, `1`, `0` (any case) | `maybe`, `2`, `truee` |

Calendar rules: months have their real lengths, February has 29 days only in leap years
(divisible by 4, except centuries not divisible by 400: 2000 is leap, 1900 is not), the year is
0001 or later.

Only ISO 8601 shapes are accepted for dates. A value such as `31/01/2020` is not read, because
`01/02/2020` cannot be told apart from 1 February or 2 January without a declared format. (A
per-column date format would be a separate feature; see section 9.)

### Named integer widths

A declared integer that names a width is held to it. A plain `integer` / `int` is not, because
files report every whole number as "integer" and a 32-bit limit would fail good values.

| Declared | Range |
|---|---|
| `tinyint` | -128 to 127 |
| `smallint`, `int2`, `short` | -32,768 to 32,767 |
| `mediumint` | -8,388,608 to 8,388,607 |
| `int4` | -2,147,483,648 to 2,147,483,647 |
| `bigint`, `int8`, `long` | -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807 |
| `integer`, `int` | any whole number up to 38 digits |

## 5. When the column can vouch for its values (skipped, not read)

A column is skipped only when its definition **guarantees** every value fits.

### Postgres (`information_schema.columns.data_type`)

| Declared -> | Skipped when the column is |
|---|---|
| integer | `smallint`, `integer`, `bigint`; `numeric(p,0)` (and the declared width, if named, is at least as wide) |
| float | any integer type, `numeric`, `real`, `double precision`, `money` |
| date | `date` |
| datetime | `date`, `timestamp without time zone`, `timestamp with time zone` |
| boolean | `boolean` |
| string | anything |

Read as text: `text`, `character varying`, `character`, `citext`, `uuid`, `json`, `jsonb`, `bytea`,
`interval`, `time`, arrays, user-defined types (their text form is judged). Read as a number:
`numeric(p,s>0)`, unconstrained `numeric`, `real`, `double precision`, `money` when the declared type is an
integer.

### Snowflake (`INFORMATION_SCHEMA.COLUMNS.DATA_TYPE`)

Snowflake reports every numeric as `NUMBER`, so the **scale** decides:

| Declared -> | Skipped when the column is |
|---|---|
| integer | `NUMBER(p,0)` - which is every Snowflake integer, `INT`, `BIGINT`, `SMALLINT` included (and the declared width fits `p`) |
| float | `NUMBER(p,s)` of any scale, `FLOAT` |
| date | `DATE` |
| datetime | `DATE`, `TIMESTAMP_NTZ`, `TIMESTAMP_LTZ`, `TIMESTAMP_TZ` |
| boolean | `BOOLEAN` |
| string | anything |

`NUMBER(p,s>0)` and `FLOAT` under a declared integer are read as numbers. `TEXT`/`VARCHAR` are read as
text. `VARIANT`, `OBJECT`, `ARRAY`, `TIME`, `BINARY` are judged by their text form (a `VARIANT`
holding the string `"12"` renders with its quotes, so it is not an integer).

Width from precision: `p` up to 2 fits `tinyint`, 4 fits `smallint`, 6 fits `mediumint`, 9 fits
`int4`, 18 fits `bigint`; anything wider fits only a plain integer.

### What a numeric column is tested for

Declared integer on a numeric column: the value must equal its own truncation (`12.00` passes,
`12.50` fails), must not be `NaN` or infinite, and must be inside the declared width. `1e20` in a
double column is a whole number, so it passes a plain integer.

## 6. Declared type names the engine understands

| Family | Names (case and `(p,s)` ignored) |
|---|---|
| text | `string`, `str`, `text`, `varchar`, `char`, `character`, `character varying`, `nvarchar`, `nchar`, `clob`, `bpchar` |
| integer | `integer`, `int`, `int2`, `int4`, `int8`, `smallint`, `bigint`, `tinyint`, `mediumint`, `long`, `short` |
| float | `float`, `float4`, `float8`, `real`, `double`, `double precision`, `decimal`, `numeric`, `number`, `dec`, `fixed` |
| date | `date` |
| datetime | `datetime`, `timestamp`, `timestamptz`, `timestamp_ntz`, `timestamp_ltz`, `timestamp_tz`, `timestamp without time zone`, `timestamp with time zone` |
| boolean | `boolean`, `bool` |

An unrecognised name stops the check with a clear error. It never passes silently.
`number`/`decimal`/`numeric` are read as float, so they accept whole numbers too; their precision and
scale are not enforced here.

## 7. Files

A file has no types: every cell is text. So for files the rule is simply "every value is read".

- Before this change the staging table was created with the *declared* types. The database then
  refused a bad value (`abc` into an integer column failed the whole load, so the run died instead
  of TC004 reporting it) or silently rewrote one (another date format became a different date).
  **Every column is now staged as text, exactly as the file wrote it**, so `007` stays `007` and
  `12.50` stays `12.50`.
- Empty cells and the word `null` (any case) are loaded as NULL and are not judged.
- Spreadsheet and JSON cells arrive as typed values and are written the way a reader would see
  them: ISO dates and timestamps, `true`/`false`, plain numbers, nested values as JSON.
- Each column the schema declares as non-text is therefore read (there is no native type to
  vouch for it), in one pass.

## 8. How the schema for a file configuration is fetched

Databases can be asked for their columns. A file in blob storage cannot, so "Fetch from source" reads
the file:

1. The backend opens the object in S3 with the connection's own credentials, using the exact key
   `path/file-name` (with the extension, as saved).
2. It reads **at most the first 1,000 rows** (CSV, the first sheet of an Excel file, or a JSON array
   of objects) and stops.
3. The **first row is the header**. Column order is the order of the header.
4. Each column's type is voted by every sampled value: all whole numbers -> integer; whole numbers
   and decimals -> decimal; ISO dates -> date; dates and timestamps -> datetime; `true`/`false` ->
   boolean; anything mixed -> string. Empty values are skipped and mark the column nullable.
5. The result is a **snapshot of the file as it is now**. Later runs are compared against it, so a
   wrong value already in the file today becomes part of the "expected" schema. Uploading a schema
   file states what *should* be there instead.

Known limits of this read (the engine, which runs the checks, is more capable):

- It does not apply the configured delimiter; CSV is read as comma-separated.
- It needs the exact object key. The engine also accepts a pattern and picks the newest match.
- Only 1,000 rows are sampled, so a bad value later in the file is not seen; TC004 will report it.
- `.zip` files are not read.

## 9. Not covered (and what would cover it)

| Not enforced | Why / what would be needed |
|---|---|
| Declared precision and scale (`numeric(10,2)`), string length | Length is TC011. Precision/scale would be a new rule |
| Date formats other than ISO | Needs a declared format per column |
| `time`, `interval`, `uuid`, `json` as declared types | No family for them; a declared type of those names is refused, not guessed |
| Integer range for a plain `integer` | By design (section 4) |
| Time zone of `timestamp with time zone` read as a date | Its text form depends on the session time zone |
