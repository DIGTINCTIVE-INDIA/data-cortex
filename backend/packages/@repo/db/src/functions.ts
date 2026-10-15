import { type AnyColumn, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export const increment = (column: AnyColumn, value = 1) => {
  return sql`${column} + ${value}`;
};

export const decrement = (column: AnyColumn, value = 1) => {
  return sql`${column} - ${value}`;
};

export const push = (column: AnyColumn, value: unknown) => {
  return sql`array_append(${column}, ${value})`;
};

export const concatArray = (column: AnyColumn, values: unknown[]) => {
  const columnType = column.getSQLType().replaceAll("[]", "");

  return sql`
    array_cat(
      ${column},
      ${sql`ARRAY[${sql.join(
        values.map((value) => sql`CAST(${value} AS ${sql.raw(columnType)})`),
        sql`', '`
      )}]`}
    )
  `;
};

export const sqlConcat = (
  columns: Array<AnyColumn | null | undefined>,
  separator = " "
) => {
  const filteredColumns = columns
    .filter((col): col is AnyColumn => col !== null)
    .map((col) => sql`TRIM(COALESCE(${col}, ''))`);

  if (filteredColumns.length === 0) {
    const separator = sql<string>`' '`;
		return separator
  }

  return sql<string>`
    TRIM(
      CONCAT_WS(
        ${separator},
        ${sql.join(filteredColumns, sql`', '`)}
      )
    )
  `;
};

export const removeFromArray = (column: AnyColumn, values: unknown[]) => {
  const columnType = column.getSQLType().replaceAll("[]", "");

  return values.reduce<AnyColumn | SQL>(
    (acc, value) =>
      sql`array_remove(${acc}, ${sql`CAST(${value} AS ${sql.raw(columnType)})`})`,
    column
  );
};

export function castToText(column: AnyColumn) {
  return sql`CAST(${column} AS TEXT)`;
}

export function objectBuilder<T extends Record<string, PgColumn | SQL>>(
  shape: T,
  aggregate: true
): SQL<Array<UnwrapColumns<T>>>;

export function objectBuilder<T extends Record<string, PgColumn | SQL>>(
  shape: T,
  aggregate?: false
): SQL<UnwrapColumns<T>>;

export function objectBuilder<T extends Record<string, PgColumn | SQL>>(
  shape: T,
  aggregate = false
): SQL<UnwrapColumns<T> | Array<UnwrapColumns<T>>> {
  const chunks: SQL[] = [];
  const filter: SQL[] = [];

  for (const [key, value] of Object.entries(shape)) {
    if (chunks.length > 0) {
      chunks.push(sql.raw(","));
    }

    chunks.push(sql.raw(`'${key}',`));
    chunks.push(sql`${value}`);
    filter.push(sql`${value} IS NOT NULL`);
  }

	// const or = sql<string>`" OR "`;

  const query = aggregate
    ? sql`
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(${sql.join(chunks)})
          ) FILTER (WHERE ${sql.join(filter, sql`' OR '`)}),
          '[]'
        )
      `
    : sql`jsonb_build_object(${sql.join(chunks)})`;

  return query as SQL<UnwrapColumns<T>>;
}

type UnwrapColumns<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T]: T[K] extends PgColumn<infer C>
        ? C["notNull"] extends true
          ? C["data"]
          : C["data"] | null
        : T[K] extends SQL<infer S>
        ? S
        : never;
    }
  : never;

export type Condition = boolean | SQL<unknown>;
