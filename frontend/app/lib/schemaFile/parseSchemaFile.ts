/**
 * Parses an uploaded schema file into the rows the field-configuration grid needs.
 *
 * The schema file is the *declared* shape of the source -- what the data is supposed to
 * look like. It is deliberately never read from the live database or the real file: a
 * quality product has to be able to detect that the source has drifted from what was
 * agreed, which is impossible if the expectation is derived from the source itself.
 *
 * Accepts CSV, Excel (.xlsx/.xls) and JSON. Three pieces of information per column:
 * name, order and data type.
 */

export type TraditionalDataType = "string" | "integer" | "float" | "date" | "datetime" | "boolean" | "varchar";

export type ParsedSchemaRow = {
  field: string;
  dataType: TraditionalDataType;
  columnOrder: number;
};

export type ParseSchemaResult = {
  rows: ParsedSchemaRow[];
  /** Non-fatal notes -- e.g. a datatype that was mapped from a synonym. */
  warnings: string[];
};

export class SchemaFileError extends Error {}

const VALID_DATA_TYPES: readonly TraditionalDataType[] = [
  "string",
  "integer",
  "float",
  "date",
  "datetime",
  "boolean",
  "varchar",
];

/**
 * Spellings people actually use in hand-written schema files, mapped onto the seven
 * types the backend accepts. Anything outside this list is reported rather than guessed.
 */
const DATA_TYPE_SYNONYMS: Record<string, TraditionalDataType> = {
  str: "string",
  text: "string",
  char: "varchar",
  character: "varchar",
  "character varying": "varchar",
  nvarchar: "varchar",
  int: "integer",
  int4: "integer",
  int8: "integer",
  bigint: "integer",
  smallint: "integer",
  serial: "integer",
  number: "float",
  numeric: "float",
  decimal: "float",
  double: "float",
  "double precision": "float",
  real: "float",
  bool: "boolean",
  bit: "boolean",
  // Stored as text by the engine; the check configures it like any other string column.
  uuid: "varchar",
  guid: "varchar",
  json: "string",
  jsonb: "string",
  money: "float",
  float4: "float",
  float8: "float",
  tinyint: "integer",
  mediumint: "integer",
  year: "integer",
  time: "string",
  timestamp: "datetime",
  "timestamp without time zone": "datetime",
  "timestamp with time zone": "datetime",
  datetime2: "datetime",
  // Snowflake and the remaining Postgres/MySQL spellings. These were accepted by the
  // engine but rejected here, so a Snowflake schema file failed at upload.
  // dc-engine/test_cases/test_datatype_scan.py fails if this table and the engine's
  // (trad_ct_id/type_mapping.py) ever disagree.
  timestamptz: "datetime",
  timestamp_ntz: "datetime",
  timestamp_ltz: "datetime",
  timestamp_tz: "datetime",
  int2: "integer",
  long: "integer",
  short: "integer",
  dec: "float",
  fixed: "float",
  nchar: "varchar",
  bpchar: "varchar",
  clob: "string",
};

const FIELD_HEADERS = ["column name", "column_name", "columnname", "column", "field", "name", "field name"];
const ORDER_HEADERS = ["column order", "column_order", "columnorder", "order", "position", "seq", "sequence", "index"];
const TYPE_HEADERS = ["data type", "data_type", "datatype", "dtype", "type", "column type", "column_type"];

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseDataType(raw: unknown, rowLabel: string, warnings: string[]): TraditionalDataType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    // "varchar(255)" / "decimal(10,2)" -> drop the precision, it is not configured here
    .replace(/\(.*\)$/, "")
    .trim();

  if (!value) {
    throw new SchemaFileError(`${rowLabel}: data type is missing.`);
  }

  if (VALID_DATA_TYPES.includes(value as TraditionalDataType)) {
    return value as TraditionalDataType;
  }

  const mapped = DATA_TYPE_SYNONYMS[value];

  if (mapped) {
    warnings.push(`${rowLabel}: read "${value}" as "${mapped}".`);
    return mapped;
  }

  throw new SchemaFileError(
    `${rowLabel}: "${value}" is not a supported data type. Use one of: ${VALID_DATA_TYPES.join(", ")}.`
  );
}

/**
 * Minimal RFC-4180 reader: handles quoted fields, embedded commas/newlines and escaped
 * quotes. Written here rather than pulled in as a dependency -- a three-column schema
 * file does not justify one, and this keeps the parse behaviour ours to fix.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter(cells => cells.some(value => value.trim() !== ""));
}

function detectDelimiter(headerLine: string) {
  const candidates = [",", ";", "\t", "|"];
  return candidates.reduce((best, candidate) => {
    const count = headerLine.split(candidate).length;
    return count > headerLine.split(best).length ? candidate : best;
  }, ",");
}

function indexOfHeader(headers: string[], accepted: string[]) {
  return headers.findIndex(header => accepted.includes(header));
}

/** Shared by the CSV and Excel paths once each has produced a grid of cells. */
function rowsFromTable(table: string[][], warnings: string[]): ParsedSchemaRow[] {
  if (!table.length) {
    throw new SchemaFileError("The file is empty.");
  }

  const headers = table[0].map(normaliseHeader);

  const fieldIndex = indexOfHeader(headers, FIELD_HEADERS);
  const typeIndex = indexOfHeader(headers, TYPE_HEADERS);
  const orderIndex = indexOfHeader(headers, ORDER_HEADERS);

  if (fieldIndex === -1 || typeIndex === -1) {
    throw new SchemaFileError(
      `Could not find the required columns. Expected a header row with a column name and a data type ` +
        `(for example: "column name, column order, data type"). Found: ${table[0].join(", ") || "nothing"}.`
    );
  }

  const rows: ParsedSchemaRow[] = [];

  table.slice(1).forEach((cells, position) => {
    const rowLabel = `Row ${position + 2}`;
    const field = String(cells[fieldIndex] ?? "").trim();

    if (!field) {
      throw new SchemaFileError(`${rowLabel}: column name is missing.`);
    }

    const dataType = normaliseDataType(cells[typeIndex], rowLabel, warnings);

    let columnOrder = position + 1;

    if (orderIndex !== -1) {
      const rawOrder = String(cells[orderIndex] ?? "").trim();

      if (rawOrder) {
        const parsed = Number(rawOrder);

        if (!Number.isFinite(parsed) || parsed < 1) {
          throw new SchemaFileError(`${rowLabel}: column order "${rawOrder}" is not a positive number.`);
        }

        columnOrder = Math.trunc(parsed);
      }
    }

    rows.push({ field, dataType, columnOrder });
  });

  return rows;
}

function parseJsonSchema(text: string, warnings: string[]): ParsedSchemaRow[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SchemaFileError("The file is not valid JSON.");
  }

  // Accept either a bare array or { columns: [...] } / { fields: [...] }.
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>)?.columns ?? (parsed as Record<string, unknown>)?.fields);

  if (!Array.isArray(list)) {
    throw new SchemaFileError('Expected a JSON array of columns, or an object with a "columns" array.');
  }

  if (!list.length) {
    throw new SchemaFileError("The file contains no columns.");
  }

  return list.map((entry, position) => {
    const rowLabel = `Entry ${position + 1}`;
    const record = (entry ?? {}) as Record<string, unknown>;

    const pick = (keys: string[]) => {
      const key = Object.keys(record).find(candidate => keys.includes(normaliseHeader(candidate)));
      return key ? record[key] : undefined;
    };

    const field = String(pick(FIELD_HEADERS) ?? "").trim();

    if (!field) {
      throw new SchemaFileError(`${rowLabel}: column name is missing.`);
    }

    const dataType = normaliseDataType(pick(TYPE_HEADERS), rowLabel, warnings);

    const rawOrder = pick(ORDER_HEADERS);
    let columnOrder = position + 1;

    if (rawOrder !== undefined && String(rawOrder).trim() !== "") {
      const value = Number(rawOrder);

      if (!Number.isFinite(value) || value < 1) {
        throw new SchemaFileError(`${rowLabel}: column order "${String(rawOrder)}" is not a positive number.`);
      }

      columnOrder = Math.trunc(value);
    }

    return { field, dataType, columnOrder };
  });
}

async function parseExcelSchema(file: File, warnings: string[]): Promise<ParsedSchemaRow[]> {
  // Loaded on demand so the ~1MB workbook reader never reaches anyone who only ever
  // uploads CSV or JSON.
  // exceljs is CommonJS, so the namespace object puts the real export on .default under
  // some bundler/interop combinations and directly on the namespace under others.
  const mod = (await import("exceljs")) as unknown as Record<string, unknown>;
  const ExcelJS = ((mod.default ?? mod) as { Workbook: new () => import("exceljs").Workbook });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new SchemaFileError("The workbook has no sheets.");
  }

  const table: string[][] = [];

  sheet.eachRow(excelRow => {
    const cells: string[] = [];

    // 1-based, and includeEmpty keeps blank cells aligned with their header.
    excelRow.eachCell({ includeEmpty: true }, cell => {
      const value = cell.value;
      cells.push(value === null || value === undefined ? "" : String(typeof value === "object" && "text" in value ? value.text : value));
    });

    table.push(cells);
  });

  const populated = table.filter(cells => cells.some(value => value.trim() !== ""));

  if (workbook.worksheets.length > 1) {
    warnings.push(`The workbook has ${workbook.worksheets.length} sheets; only "${sheet.name}" was read.`);
  }

  return rowsFromTable(populated, warnings);
}

/** Rejects anything the backend would reject anyway, with a message that names the row. */
function assertUsable(rows: ParsedSchemaRow[]) {
  if (!rows.length) {
    throw new SchemaFileError("The file contains no columns.");
  }

  const seen = new Map<string, number>();

  for (const row of rows) {
    const key = row.field.toLowerCase();
    const previous = seen.get(key);

    if (previous !== undefined) {
      throw new SchemaFileError(
        `Column "${row.field}" appears more than once (positions ${previous} and ${row.columnOrder}). ` +
          `Each column must be listed once.`
      );
    }

    seen.set(key, row.columnOrder);
  }
}

/**
 * Reads a picked file as text, keeping whatever the browser actually complained about.
 *
 * Two readers are tried because they fail independently: Blob.text() goes through the
 * modern streams path, FileReader through the older one. A file one refuses is often
 * readable by the other, and when both refuse, the real DOMException name is worth far
 * more than a guess at the cause.
 */
async function readText(file: File): Promise<string> {
  let firstError: unknown;

  try {
    return await file.text();
  } catch (error) {
    firstError = error;
  }

  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsText(file);
    });
  } catch (secondError) {
    const describe = (error: unknown) => {
      const asDom = error as { name?: string; message?: string };
      return `${asDom?.name ?? "Error"}: ${asDom?.message ?? String(error)}`;
    };

    throw new SchemaFileError(
      `"${file.name}" could not be read by the browser. ` +
        `Blob.text failed with ${describe(firstError)}; FileReader failed with ${describe(secondError)}. ` +
        `If it was edited after you chose it, select it again; otherwise try copying it elsewhere.`
    );
  }
}

export async function parseSchemaFile(file: File): Promise<ParseSchemaResult> {
  const warnings: string[] = [];
  const name = file.name.toLowerCase();

  if (file.size === 0) {
    throw new SchemaFileError(`"${file.name}" is empty (0 bytes).`);
  }

  let rows: ParsedSchemaRow[];

  if (name.endsWith(".json")) {
    rows = parseJsonSchema(await readText(file), warnings);
  } else if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls")) {
    rows = await parseExcelSchema(file, warnings);
  } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    const text = await readText(file);
    const delimiter = name.endsWith(".tsv") ? "\t" : detectDelimiter(text.split("\n")[0] ?? "");
    rows = rowsFromTable(parseDelimited(text, delimiter), warnings);
  } else {
    throw new SchemaFileError(`"${file.name}" is not a supported file. Upload a .csv, .xlsx or .json file.`);
  }

  assertUsable(rows);

  // The grid is ordered by the declared column order, and the backend stores it, so make
  // the two agree rather than trusting the file to be sorted.
  rows.sort((a, b) => a.columnOrder - b.columnOrder);

  return { rows, warnings };
}
