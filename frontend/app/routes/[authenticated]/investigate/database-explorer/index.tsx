import PageHeader from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SqlEditor } from "@/components/ui/custom/SqlEditor";
import { SqlSchemaExplorer } from "@/components/ui/custom/SqlSchemaExplorer";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/useApi";
import type { DBConnectionItem } from "@/lib/useApi/types/connectionApis.types";
import type {
  DBExplorerColumn,
  DBExplorerQueryResult,
  DBExplorerRow,
  ExecuteQueryMutationResponse,
} from "@/lib/useApi/types/dbExplorer.types";
import { cn } from "@/lib/utils";
import { DatabaseIcon, LinkSquare02Icon, PlayIcon, TableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cx } from "class-variance-authority";
import type { ComponentProps } from "react";
import { memo, useCallback, useMemo, useRef, useState } from "react";

type HugeIcon = ComponentProps<typeof HugeiconsIcon>["icon"];

type ExecuteQueryResponse = {
  type: "mutation";
  success?: boolean;
  data?: ExecuteQueryMutationResponse;
};

type ColumnMapping = {
  sourceColumn: string;
  targetColumn: string;
  enabled: boolean;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 10_000;

const pageSizeOptions = [100, 500, 1_000, 5_000, 10_000];

const getResultPayload = (response: ExecuteQueryResponse): DBExplorerQueryResult | null => {
  return response.data?.result ?? null;
};

const normalizeColumns = (payload: DBExplorerQueryResult | null): DBExplorerColumn[] => {
  if (payload?.columns?.length) {
    return payload.columns;
  }

  const firstRow = payload?.rows?.[0];

  if (!firstRow) return [];

  return Object.keys(firstRow).map(key => ({
    key,
    label: key,
  }));
};

const clampPageSize = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
};

const ENGINE_LABELS: Record<string, string> = { postgres: "PostgreSQL", snowflake: "Snowflake" };

const engineLabel = (databaseType?: string) =>
  databaseType ? (ENGINE_LABELS[databaseType] ?? databaseType) : "";

/**
 * The engine is never asked for -- it is a property of the connection. But the SQL
 * you write has to be that engine's dialect, so it is named wherever a choice is
 * being made: in the connection list, on the selected connection, and on the
 * editor itself.
 */
const EngineBadge = ({ databaseType, className }: { databaseType?: string; className?: string }) => {
  if (!databaseType) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary",
        className
      )}>
      {engineLabel(databaseType)}
    </span>
  );
};

const DatabaseExplorer = () => {
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [sqlQuery, setSqlQuery] = useState("");

  const [queryResult, setQueryResult] = useState<DBExplorerQueryResult | null>(null);
  const [columns, setColumns] = useState<DBExplorerColumn[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [hasExecuted, setHasExecuted] = useState(false);

  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { mutateAsync: executeQuery, isPending: isExecuting } = useApi("POST /api/db-explorer/execute-query", {
    query: {
      connectionId: selectedConnectionId,
    },
  });

  const sqlEditorSchema = useApi("GET /api/qc-configuration/custom-sql/schema", {
    query: {
      connectionId: selectedConnectionId,
    },
    enabled: !!selectedConnectionId,
  });

  const dbConnections = useApi("GET /api/db/connections/list?page=1&limit=500");

  const schemas = useMemo(() => {
    return sqlEditorSchema.data?.data.result.schemas ?? [];
  }, [sqlEditorSchema.data]);

  const activeConnections = dbConnections.data?.data?.items?.filter(connection => connection.enabled) ?? [];

  const selectedDB = useMemo<DBConnectionItem | undefined>(() => {
    return activeConnections.find(item => String(item.connectionId) === String(selectedConnectionId));
  }, [activeConnections, selectedConnectionId]);

  const rows = queryResult?.rows ?? [];
  const pagination = queryResult?.pagination;

  const totalRows = rows.length;
  const totalColumns = columns.length;
  const canExecute = Boolean(selectedConnectionId && sqlQuery.trim().length >= 3);

  const clearResults = useCallback(() => {
    setQueryResult(null);
    setColumns([]);
    setColumnMappings([]);
    setHasExecuted(false);
    setPage(DEFAULT_PAGE);
  }, []);

  const executeSqlQuery = useCallback(
    async (nextPage = DEFAULT_PAGE, nextPageSize = pageSize) => {
      if (!canExecute) return;

      const safePageSize = clampPageSize(nextPageSize);

      const response = await executeQuery({
        sqlQuery,
        page: nextPage,
        pageSize: safePageSize,
      });

      // All are coming in typpe
      // response.data?.result.columns;
      // response.data?.result.executedAt;
      // response.data?.result.pagination.hasMore;
      // response.data?.result.pagination.maxPageSize;
      // response.data?.result.pagination.offset;
      // response.data?.result.pagination.page;
      // response.data?.result.pagination.pageSize;
      // response.data?.result.pagination.returnedRows;
      // response.data?.result.rows;
      const payload = getResultPayload(response);
      const nextColumns = normalizeColumns(payload);

      setQueryResult(payload);
      setColumns(nextColumns);
      setPage(nextPage);
      setPageSize(safePageSize);
      setHasExecuted(true);

      setColumnMappings(
        nextColumns.map(column => ({
          sourceColumn: column.key,
          targetColumn: column.key,
          enabled: true,
        }))
      );
    },
    [canExecute, executeQuery, pageSize, sqlQuery]
  );

  const handleExecuteFirstPage = useCallback(() => {
    void executeSqlQuery(DEFAULT_PAGE, pageSize);
  }, [executeSqlQuery, pageSize]);

  const handlePageSizeChange = useCallback(
    (value: string) => {
      const nextPageSize = clampPageSize(Number(value));
      setPageSize(nextPageSize);

      if (hasExecuted) {
        void executeSqlQuery(DEFAULT_PAGE, nextPageSize);
      }
    },
    [executeSqlQuery, hasExecuted]
  );

  const handlePreviousPage = useCallback(() => {
    if (page <= 1) return;
    void executeSqlQuery(page - 1, pageSize);
  }, [executeSqlQuery, page, pageSize]);

  const handleNextPage = useCallback(() => {
    if (!pagination?.hasMore) return;
    void executeSqlQuery(page + 1, pageSize);
  }, [executeSqlQuery, page, pageSize, pagination?.hasMore]);

  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <PageHeader
          title="Database Explorer"
          description="Explore connected databases, run SQL queries, preview paginated results, and map returned columns."
        />

        <div className="hidden size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary md:flex">
          <HugeiconsIcon icon={DatabaseIcon} size={22} />
        </div>
      </div>

      <section className="rounded-3xl bg-muted p-2">
        <div className="space-y-6 rounded-[22px] bg-background p-6 md:p-7">
          <SectionHeader
            icon={DatabaseIcon}
            title="Select DB"
            description="Choose the source database connection before writing or executing SQL."
          />

          <ControllerLessSelect
            label="Database"
            value={selectedConnectionId}
            placeholder="Select database connection"
            isLoading={dbConnections.isPending}
            items={activeConnections}
            getValue={item => item.connectionId}
            // The engine is named in the list too, so you know what you are picking
            // before you pick it rather than after.
            getLabel={item =>
              `${item.connectionName || item.databaseName || item.connectionId} · ${engineLabel(item.databaseType)}`
            }
            onValueChange={value => {
              setSelectedConnectionId(value);
              clearResults();
            }}
          />

          {selectedDB && (
            <div className="rounded-2xl bg-muted/40 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <HugeiconsIcon icon={LinkSquare02Icon} size={18} className="text-primary" />
                <p className="text-sm font-medium text-foreground">Selected Connection</p>
                <EngineBadge databaseType={selectedDB.databaseType} />
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {/* The engine comes from the connection; nothing to choose. Queries run in that
                    engine's own SQL, so it is shown rather than asked. */}
                <Meta label="Engine" value={ENGINE_LABELS[selectedDB.databaseType] ?? selectedDB.databaseType} />
                {selectedDB.databaseType === "snowflake" ? (
                  // A Snowflake connection has an account, not a host and port.
                  <Meta label="Account" value={selectedDB.host} />
                ) : (
                  <>
                    <Meta label="Host" value={selectedDB.host} />
                    <Meta label="Port" value={selectedDB.port} />
                  </>
                )}
                <Meta label="Database" value={selectedDB.databaseName} />
                <Meta label="Username" value={selectedDB.username} />
                <Meta label="Schema" value={selectedDB.dbSchema} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl bg-muted p-2">
        <div className="space-y-6 rounded-[22px] bg-background p-6 md:p-7">
          <SectionHeader
            icon={PlayIcon}
            title="Execute Query"
            description="Write SQL with autocomplete support. Results are safely paginated by the backend."
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm font-medium text-foreground">
                SQL Query <span className="text-destructive">*</span>
              </Label>
              {/* Which dialect to write in, taken from the connection. */}
              <EngineBadge databaseType={selectedDB?.databaseType} />
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedDB
                ? `Write ${engineLabel(selectedDB.databaseType)} SQL. Only SELECT queries are allowed, and the backend always paginates, with a max page size of 10,000 rows.`
                : "Only SELECT queries are allowed. Backend always applies pagination with a max page size of 10,000 rows."}
            </p>
          </div>

          <div className="rounded-[calc(var(--radius)+4px)] border border-border bg-card p-3">
            <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="relative z-50 min-w-0 overflow-visible">
                <SqlEditor
                  value={sqlQuery}
                  onChange={value => {
                    setSqlQuery(value);
                    clearResults();
                  }}
                  schemas={schemas}
                  height="380px"
                  disabled={!selectedConnectionId}
                />
              </div>

              <SqlSchemaExplorer
                schemas={schemas}
                // A disabled query reports isPending forever, so this drew a loading
                // skeleton before a connection had even been chosen.
                isLoading={Boolean(selectedConnectionId) && sqlEditorSchema.isPending}
                onRefresh={() => {
                  void sqlEditorSchema.refetch?.();
                }}
                height="380px"
              />
            </div>
          </div>

          {!selectedConnectionId && (
            <p className="text-xs font-medium text-warning">
              Select a database connection first to enable schema autocomplete.
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-xl border-0 bg-muted text-muted-foreground">{totalRows} rows in page</Badge>
              <Badge className="rounded-xl border-0 bg-muted text-muted-foreground">{totalColumns} columns</Badge>
              <Badge className="rounded-xl border-0 bg-muted text-muted-foreground">Page {page}</Badge>
              <Badge className="rounded-xl border-0 bg-muted text-muted-foreground">Max 10,000/page</Badge>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:w-[160px]">
                <ControllerLessSelect
                  label="Page Size"
                  value={String(pageSize)}
                  placeholder="Page size"
                  isLoading={false}
                  items={pageSizeOptions}
                  getValue={item => String(item)}
                  getLabel={item => `${item.toLocaleString()} rows`}
                  onValueChange={handlePageSizeChange}
                />
              </div>

              <Button type="button" variant="secondary" onClick={clearResults}>
                Reset
              </Button>

              <Button type="button" disabled={!canExecute} isLoading={isExecuting} onClick={handleExecuteFirstPage}>
                <HugeiconsIcon icon={PlayIcon} size={18} />
                Execute Query
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-muted p-2">
        <div className="space-y-6 rounded-[22px] bg-background p-6 md:p-7">
          <SectionHeader
            icon={TableIcon}
            title={`Query Results${hasExecuted ? ` (${totalRows.toLocaleString()} rows loaded)` : ""}`}
          />

          <QueryResultsTable
            rows={rows}
            columns={columns}
            hasExecuted={hasExecuted}
            isExecuting={isExecuting}
            page={page}
            pageSize={pageSize}
            hasMore={Boolean(pagination?.hasMore)}
            returnedRows={pagination?.returnedRows ?? rows.length}
            offset={pagination?.offset ?? 0}
            onPreviousPage={handlePreviousPage}
            onNextPage={handleNextPage}
          />
        </div>
      </section>
    </>
  );
};

export default DatabaseExplorer;

const SectionHeader = ({ icon, title, description }: { icon: HugeIcon; title: string; description?: string }) => {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HugeiconsIcon icon={icon} size={22} />
      </div>

      <div className={cx("space-y-1", !description && "my-auto")}>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
};

const ControllerLessSelect = <TItem,>({
  label,
  value,
  placeholder,
  items,
  isLoading,
  getValue,
  getLabel,
  onValueChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  items: TItem[];
  isLoading?: boolean;
  getValue: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  onValueChange: (value: string) => void;
}) => {
  const selectedItem = items.find(item => getValue(item) === value);

  return (
    <Select
      value={value || undefined}
      onValueChange={nextValue => {
        if (!nextValue) return;
        onValueChange(nextValue);
      }}>
      <SelectTrigger label={label} isLoading={isLoading}>
        <SelectValue placeholder={placeholder}>{selectedItem ? getLabel(selectedItem) : null}</SelectValue>
      </SelectTrigger>

      <SelectContent>
        {items.map(item => (
          <SelectItem key={getValue(item)} value={getValue(item)}>
            {getLabel(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const QueryResultsTable = memo(
  ({
    rows,
    columns,
    hasExecuted,
    isExecuting,
    page,
    pageSize,
    hasMore,
    returnedRows,
    offset,
    onPreviousPage,
    onNextPage,
  }: {
    rows: DBExplorerRow[];
    columns: DBExplorerColumn[];
    hasExecuted: boolean;
    isExecuting: boolean;
    page: number;
    pageSize: number;
    hasMore: boolean;
    returnedRows: number;
    offset: number;
    onPreviousPage: () => void;
    onNextPage: () => void;
  }) => {
    const parentRef = useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 72,
      overscan: 12,
      getItemKey: index => `${page}-${index}`,
      measureElement:
        typeof window !== "undefined" && !navigator.userAgent.includes("Firefox")
          ? element => element?.getBoundingClientRect().height
          : undefined,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();

    if (!hasExecuted) {
      return (
        <EmptyState
          title="No query executed"
          description="Select a database, write your SQL query, and click execute."
        />
      );
    }

    if (!rows.length || !columns.length) {
      return (
        <EmptyState
          title="No rows returned"
          description="The query executed successfully but did not return any rows."
        />
      );
    }

    const CELL_WIDTH = 260;
    const TABLE_WIDTH = columns.length * CELL_WIDTH;

    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-xl border-0 bg-background text-muted-foreground">Page {page}</Badge>

              <Badge className="rounded-xl border-0 bg-background text-muted-foreground">
                Page size {pageSize.toLocaleString()}
              </Badge>

              <Badge className="rounded-xl border-0 bg-background text-muted-foreground">
                Showing rows {(offset + 1).toLocaleString()} - {(offset + returnedRows).toLocaleString()}
              </Badge>

              {hasMore && <Badge className="rounded-xl border-0 bg-primary/10 text-primary">More rows available</Badge>}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" disabled={page <= 1 || isExecuting} onClick={onPreviousPage}>
                Previous
              </Button>

              <Button type="button" variant="secondary" disabled={!hasMore || isExecuting} onClick={onNextPage}>
                Next
              </Button>
            </div>
          </div>
        </div>

        <div ref={parentRef} className="h-[620px] overflow-auto">
          <div
            className="relative"
            style={{
              width: TABLE_WIDTH,
              minWidth: "100%",
            }}>
            {/* Header */}
            <div
              className="sticky top-0 z-30 flex bg-neutral-700 border-b border-neutral-500 shadow-sm"
              style={{ width: TABLE_WIDTH }}>
              {columns.map(column => (
                <div
                  key={column.key}
                  className="flex h-11 shrink-0 items-center gap-2 border-r border-neutral-500 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
                  style={{ width: CELL_WIDTH }}>
                  <span className="min-w-0 truncate text-white">{column.label}</span>

                  {column.type && (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted-foreground">
                      {column.type}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Virtual Rows */}
            <div
              className="relative"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: TABLE_WIDTH,
              }}>
              {virtualRows.map(virtualRow => {
                const row = rows[virtualRow.index];

                if (!row) return null;

                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={cn(
                      "absolute left-0 top-0 flex min-h-[46px] border-b border-border transition hover:bg-muted/40",
                      virtualRow.index % 2 === 0 ? "bg-card" : "bg-muted/20"
                    )}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      width: TABLE_WIDTH,
                    }}>
                    {columns.map(column => (
                      <div
                        key={`${virtualRow.index}-${column.key}`}
                        className="flex shrink-0 items-start border-r border-border px-4 py-3 text-sm text-foreground last:border-r-0"
                        style={{ width: CELL_WIDTH }}>
                        <div className="min-w-0 whitespace-normal break-words leading-6">
                          <CellValue value={row[column.key]} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Rendering {virtualRows.length} visible rows from {rows.length.toLocaleString()} loaded rows.
            </p>

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" disabled={page <= 1 || isExecuting} onClick={onPreviousPage}>
                Previous
              </Button>

              <Button type="button" disabled={!hasMore || isExecuting} isLoading={isExecuting} onClick={onNextPage}>
                Next Page
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

QueryResultsTable.displayName = "QueryResultsTable";

QueryResultsTable.displayName = "QueryResultsTable";

const CellValue = memo(({ value }: { value: unknown }) => {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">NULL</span>;
  }

  if (typeof value === "boolean") {
    return <Badge className="rounded-lg border-0 bg-primary/10 text-primary">{value ? "true" : "false"}</Badge>;
  }

  if (typeof value === "object") {
    return (
      <code className="block max-w-[200px] truncate rounded-lg bg-muted px-2 py-1 text-xs text-foreground">
        {safeStringify(value)}
      </code>
    );
  }

  return <span className="block max-w-[200px] truncate">{String(value)}</span>;
});

CellValue.displayName = "CellValue";

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable Object]";
  }
};

const EmptyState = ({ title, description }: { title: string; description: string }) => {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
};

const Meta = ({ label, value }: { label: string; value?: string | number | null }) => {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
};
