import { ChevronDownIcon, ChevronRightIcon, DatabaseIcon, RefreshCwIcon, SearchIcon, TableIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SqlEditorSchema } from "./SqlEditor";

type SqlSchemaExplorerProps = {
  schemas: SqlEditorSchema[];
  isLoading?: boolean;
  onRefresh?: () => void;
  height?: string;
};

export const SqlSchemaExplorer = ({ schemas, isLoading, onRefresh, height = "360px" }: SqlSchemaExplorerProps) => {
  const [search, setSearch] = useState("");
  const [openSchemas, setOpenSchemas] = useState<Record<string, boolean>>({});
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});

  const filteredSchemas = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return schemas;

    return schemas
      .map(schema => ({
        ...schema,
        tables: schema.tables
          .map(table => ({
            ...table,
            columns: table.columns.filter(column => {
              return (
                column.columnName.toLowerCase().includes(query) ||
                column.dataType.toLowerCase().includes(query) ||
                table.tableName.toLowerCase().includes(query) ||
                schema.schemaName.toLowerCase().includes(query)
              );
            }),
          }))
          .filter(table => table.tableName.toLowerCase().includes(query) || table.columns.length > 0),
      }))
      .filter(schema => schema.schemaName.toLowerCase().includes(query) || schema.tables.length > 0);
  }, [schemas, search]);

  const toggleSchema = (schemaName: string) => {
    setOpenSchemas(prev => ({
      ...prev,
      [schemaName]: !(prev[schemaName] ?? true),
    }));
  };

  const toggleTable = (key: string) => {
    setOpenTables(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card"
      style={{ height }}>
      <div className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-sm font-semibold text-card-foreground">Schema Explorer</p>
            <p className="truncate text-xs text-muted-foreground">{getSchemaSummary(schemas)}</p>
          </div>

          <Button type="button" variant="ghost" size="icon" disabled={isLoading} onClick={onRefresh}>
            <RefreshCwIcon className={isLoading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>

        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search tables or columns..."
            className="h-9 rounded-[calc(var(--radius)-2px)] bg-background pl-9 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <SchemaExplorerSkeleton />
        ) : schemas.length === 0 ? (
          <div className="rounded-[calc(var(--radius)-2px)] border border-border bg-background p-3 text-xs text-muted-foreground">
            Select source DB connection to load schema metadata.
          </div>
        ) : filteredSchemas.length === 0 ? (
          <div className="rounded-[calc(var(--radius)-2px)] border border-border bg-background p-3 text-xs text-muted-foreground">
            No tables or columns found.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSchemas.map(schema => {
              const schemaOpen = openSchemas[schema.schemaName] ?? true;

              return (
                <div key={schema.schemaName} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleSchema(schema.schemaName)}
                    className="flex w-full min-w-0 items-center gap-2 rounded-[calc(var(--radius)-4px)] px-2 py-1.5 text-left text-sm transition hover:bg-muted">
                    {schemaOpen ? (
                      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}

                    <DatabaseIcon className="size-4 shrink-0 text-primary" />
                    <span className="truncate font-medium text-foreground">{schema.schemaName}</span>
                    <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {schema.tables.length}
                    </span>
                  </button>

                  {schemaOpen && (
                    <div className="ml-5 mt-1 space-y-1 border-l border-border pl-2">
                      {schema.tables.map(table => {
                        const tableKey = `${schema.schemaName}.${table.tableName}`;
                        const tableOpen = openTables[tableKey] ?? false;

                        return (
                          <div key={tableKey} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleTable(tableKey)}
                              className="flex w-full min-w-0 items-center gap-2 rounded-[calc(var(--radius)-4px)] px-2 py-1.5 text-left text-sm transition hover:bg-muted">
                              {tableOpen ? (
                                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                              )}

                              <TableIcon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium text-foreground">{table.tableName}</span>
                              <span className="ml-auto shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {table.columns.length}
                              </span>
                            </button>

                            {tableOpen && (
                              <div className="ml-7 space-y-0.5 py-1">
                                {table.columns.map(column => (
                                  <div
                                    key={`${tableKey}.${column.columnName}`}
                                    className="flex min-w-0 items-center justify-between gap-3 rounded-[calc(var(--radius)-6px)] px-2 py-1 text-xs transition hover:bg-muted">
                                    <span className="min-w-0 truncate text-muted-foreground">{column.columnName}</span>
                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      {column.dataType}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const SchemaExplorerSkeleton = () => {
  return (
    <div className="space-y-2">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-4 w-52 animate-pulse rounded bg-muted" />
      <div className="h-4 w-36 animate-pulse rounded bg-muted" />
    </div>
  );
};

const getSchemaSummary = (schemas: SqlEditorSchema[]) => {
  const tableCount = schemas.reduce((total, schema) => total + schema.tables.length, 0);
  const columnCount = schemas.reduce(
    (total, schema) => total + schema.tables.reduce((innerTotal, table) => innerTotal + table.columns.length, 0),
    0
  );

  if (!schemas.length) return "No schema loaded";

  return `${tableCount} tables · ${columnCount} columns`;
};
