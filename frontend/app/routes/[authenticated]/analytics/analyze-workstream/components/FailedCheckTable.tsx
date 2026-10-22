import { Button } from "@/components/ui/button";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary, getErrorMessage } from "react-error-boundary";
import { defaultAnalyseWorkstreamUrlParams, type ApiPeriod, type Period } from "../constants";
import CheckDetailsDialog from "./CheckDetailsDialog";
import Panel from "./Panel";
import { TableSkeletonRow } from "./WorkstreamSkeleton";

const FailedCheckTable = () => {
  const [period, setPeriod] = useState<Period>("monthly");
  const { params, setParam } = useUrlParams(defaultAnalyseWorkstreamUrlParams);

  const query = useMemo(
    () => ({
      period: params.time_period as ApiPeriod,
      bucket: period,

      workstream: params.workstream === "all" ? undefined : Number(params.workstream),
      dataSource: params.data_source === "all" ? undefined : Number(params.data_source),
      impactedDownstream: params.downstream === "all" ? undefined : Number(params.downstream),
      category: params.category === "all" ? undefined : Number(params.category),

      configType: params.file_table_type as "all" | "file" | "db",
      fileOrTableName: params.file_table_name === "all" ? undefined : params.file_table_name,
      checkType: params.check_type === "all" ? undefined : params.check_type,
    }),
    [params, period]
  );

  const tableRes = useApi("GET /api/analyse-workstreams/failed-checks-table", {
    query,
  });


  useEffect(() => {
    tableRes.setPage(1);
  }, [
    params.workstream,
    params.data_source,
    params.category,
    params.downstream,
    params.check_type,
    params.file_table_name,
    params.file_table_type,
    period,
  ]);

  const rows = tableRes.data?.data?.items ?? [];
  const pagination = tableRes.data?.data?.pagination;
  const total = pagination?.total ?? 0;

  const handleView = () => {};

  return (
    <Panel className="p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Failed Check Details</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {tableRes.isLoading ? "Loading records..." : `${total.toLocaleString()} records matching current filters`}
          </p>
        </div>

        <Button variant="outlinePrimary">
          Export
          <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl ring-1 ring-border/60">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {[
                  // Was "QC ID" showing QC-{check_execution_id} -- the auto-increment
                  // primary key of the results table. "QC-63" only ever meant "the 63rd
                  // result row ever written", which is a database detail wearing the
                  // costume of a business identifier. check_id (TC005, CB0002) is the
                  // thing people actually configure and talk about.
                  "Check",
                  "Check Type",
                  "Source",
                  "File or Table",
                  "Description",
                  "Criticality",
                  "Last 10 Runs",
                  "Latest Status",
                  "Run Date",
                  "Details",
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {tableRes.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <TableSkeletonRow key={i} />)
              ) : rows.length ? (
                rows.map((row: any) => (
                  <tr key={row.qcId} className="h-[76px] border-t border-border/60 transition hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-foreground">{row.checkId ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-foreground">{row.checkType}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-foreground">{row.source}</td>
                    <td className="max-w-[220px] px-4 py-4 font-mono text-xs text-foreground">
                      <p className="truncate" title={row.fileOrTableName ?? undefined}>
                        {row.fileOrTableName}
                      </p>
                    </td>
                    {/* Two lines at most, so every row is the same height whatever the
                        message length; the full text is in the tooltip and in Details. */}
                    <td className="w-[380px] max-w-[380px] px-4 py-4 text-foreground">
                      <p className="line-clamp-2 break-words" title={row.failureReason ?? row.description ?? undefined}>
                        {row.failureReason ?? row.description ?? "-"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <CriticalityBadge value={row.criticality} />
                    </td>
                    <td className="px-4 py-4">
                      <RunDots statuses={row.last10RunStatus ?? []} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={row.latestStatus} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-foreground">{formatDate(row.runDate)}</td>
                    <td className="px-4 py-4">
                      {/* <Button onClick={handleView} variant="ghost" size="sm" className="text-primary">
                        View
                      </Button> */}
                      <CheckDetailsDialog qcId={row.qcId} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No failed checks found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.currentPage - 1) * pagination.pageSize + 1}
            {" - "}
            {Math.min(pagination.currentPage * pagination.pageSize, pagination.total)}
            {" of "}
            {pagination.total.toLocaleString()}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.currentPage === 1}
              onClick={() => tableRes.setPage(pagination.currentPage - 1)}>
              Previous
            </Button>

            <span className="text-sm">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={pagination.currentPage === pagination.totalPages}
              onClick={() => tableRes.setPage(pagination.currentPage + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
};

export default FailedCheckTable;

function StatusBadge({ value }: { value: "open" | "resolved" | "discarded" }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold capitalize",
        value === "resolved" && "bg-success/10 text-success",
        value === "open" && "bg-warning/10 text-warning",
        value === "discarded" && "bg-destructive/10 text-destructive"
      )}>
      {value}
    </span>
  );
}

function CriticalityBadge({ value }: { value: "low" | "medium" | "high" }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold capitalize",
        value === "high" && "bg-destructive/10 text-destructive",
        value === "medium" && "bg-warning/10 text-warning",
        value === "low" && "bg-success/10 text-success"
      )}>
      {value}
    </span>
  );
}

/** Mirrors the backend check_status enum; the last two should be filtered server-side. */
type RunStatus = "passed" | "failed" | "error" | "upstream_failed" | null;

function RunDots({ statuses }: { statuses: RunStatus[] }) {

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div role="alert">
          <p>Something went wrong:</p>
          <pre>{getErrorMessage(error)}</pre>
          <button onClick={resetErrorBoundary}>Try again</button>
        </div>
      )}
      onError={(error, info) => {
        // Log the error to your error reporting service
      }}
      onReset={() => {
        // Reset any state that may have caused the error
      }}>
      <div className="flex items-center gap-1">
        {statuses?.slice(0, 10)?.map((status, i) => (
          <span
            key={i}
            className="size-2.5 rounded-full"
            /*
              Colour by exact value. The previous "failed ? red : green" painted every
              other value -- including null and statuses that never ran -- as a pass.
            */
            style={{
              backgroundColor:
                status === "passed"
                  ? "var(--success)"
                  : status === "failed"
                    ? "var(--error)"
                    : "var(--muted-foreground)",
            }}
          />
        ))}
      </div>
    </ErrorBoundary>
  );
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
