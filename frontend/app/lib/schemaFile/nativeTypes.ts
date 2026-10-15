import type { TraditionalDataType } from "./parseSchemaFile";

/**
 * A database's own type name -> the declared type a schema file would use.
 *
 * Used when a schema is fetched from the source instead of uploaded. It is the same
 * grouping dc-engine uses (trad_ct_id/type_mapping.py, documented in
 * dc-engine/docs/TYPE_MAPPING.md): the engine judges VALUES against the declared type,
 * so the declared type only has to be the right family, not the exact native name.
 *
 * Anything unrecognised becomes "string" -- which accepts every value -- and is
 * reported, so a column is never silently given a stricter type than the source has.
 */
const NATIVE_TO_DECLARED: Record<string, TraditionalDataType> = {
  // text
  "character varying": "varchar",
  varchar: "varchar",
  character: "varchar",
  char: "varchar",
  bpchar: "varchar",
  text: "string",
  citext: "string",
  name: "string",
  string: "string",
  uuid: "varchar",
  json: "string",
  jsonb: "string",
  // integer
  integer: "integer",
  int: "integer",
  smallint: "integer",
  bigint: "integer",
  // float / decimal. Snowflake NUMBER is deliberately here: it cannot say whether it holds
  // decimals, and a float declaration accepts whole numbers too.
  numeric: "float",
  decimal: "float",
  number: "float",
  real: "float",
  "double precision": "float",
  float: "float",
  money: "float",
  // date / time
  date: "date",
  "timestamp without time zone": "datetime",
  "timestamp with time zone": "datetime",
  timestamp: "datetime",
  timestamp_ntz: "datetime",
  timestamp_ltz: "datetime",
  timestamp_tz: "datetime",
  // boolean
  boolean: "boolean",
};

export type NativeColumn = { columnName: string; dataType: string };

export function declaredTypeFor(nativeType: string): TraditionalDataType | null {
  const key = nativeType.trim().toLowerCase().replace(/\(.*\)$/, "").trim();
  return NATIVE_TO_DECLARED[key] ?? null;
}

/** Columns in source order, ready for the same rules table an uploaded schema fills. */
export function schemaFromNativeColumns(columns: NativeColumn[]) {
  const warnings: string[] = [];

  const rows = columns.map((column, index) => {
    const mapped = declaredTypeFor(column.dataType);

    if (!mapped) warnings.push(`"${column.columnName}" is ${column.dataType}; read as string.`);

    return { field: column.columnName, dataType: mapped ?? ("string" as TraditionalDataType), columnOrder: index + 1 };
  });

  return { rows, warnings };
}

/**
 * The backend's file-type guess (core-server infers it from up to 1000 rows) ->
 * a declared type. "decimal" is our "float"; a column that was empty in every sampled
 * row has no evidence either way, so it is "string", which accepts anything.
 */
export function declaredTypeForInferred(inferred: string): TraditionalDataType {
  switch (inferred) {
    case "integer":
      return "integer";
    case "decimal":
      return "float";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}
