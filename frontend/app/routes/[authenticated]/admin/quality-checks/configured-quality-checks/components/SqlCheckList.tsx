import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/lib/useApi";
import type { CustomSqlCheckItem } from "@/lib/useApi/types/qcConfigurationApis.types";
import { cn } from "@/lib/utils";
import { Database01Icon, PlayIcon, SourceCodeCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import React, { useMemo } from "react";
import { filterByWorkstream } from "../utils/filterByWorkstream";
import EditSqlDialog from "./EditSqlDialog";
import { EmptyState } from "./EmptyState";
import SectionBlock from "./SectionBlock";
import SqlViewDialog from "./SqlViewDialog";
import { SkeletonList } from "./ListSkeleton";
import { toast } from "sonner";
import { useRunIsLive } from "../useRunCheck";
import { RunCheckButton } from "./RunCheckButton";

type Props = {
  workstream: string;
};

export const SqlCheckList = ({ workstream }: Props) => {
  const {
    data: sqlResponse,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    isInfiniteError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useApi("GET /api/qc-configuration/custom-sql/list-checks");

  const sqlList = sqlResponse?.data?.items || [];
  const filteredSqlList = useMemo(() => filterByWorkstream(sqlList, workstream), [sqlList, workstream]);

  return (
    <SectionBlock
      title="Custom SQL Checks"
      description="Checks executed using custom SQL queries."
      icon={Database01Icon}>
      {isInitialLoading ? (
        <SkeletonList title="Custom SQL Checks" />
      ) : filteredSqlList.length === 0 ?  (
        <EmptyState title="No SQL Checks Yet" description="Create a custom SQL quality check." />
      ) : (
        <InfiniteListWrapper
          isLoading={isInfiniteLoading}
          isError={isInitialError}
          hasNextPage={hasNextPage}
          onLoadMore={fetchNextPage}
          onRetry={refetch}>
          <div className="space-y-3">
            {filteredSqlList.map(item => (
              <SqlCheckCard key={item.checkId} item={item} />
            ))}
          </div>
        </InfiniteListWrapper>
      )}
    </SectionBlock>
  );
};

const SqlCheckCard = ({ item }: { item: CustomSqlCheckItem }) => {
  const runIsLive = useRunIsLive(item.checkId);

  const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/custom-sql/update-check", {
    query: {
      checkId: item.checkId,
    },
  });

  const { mutateAsync: toggleSqlConfig, isPending: isTogglePending } = useApi(
    "PATCH /api/qc-configuration/custom-sql/toggle-check"
  );

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreams = libraries?.data?.workstream || [];
  const dataSources = libraries?.data?.dataSource || [];
  const activeDbconnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);
  const workstream = workstreams.find((ws: any) => String(ws.id) === String(item.workstream));
  const dataSource = dataSources.find((ds: any) => String(ds.id) === String(item.dataSource));
  const sourceConnection = activeDbconnections.find(
    (conn: any) => String(conn.connectionId) === String(item.sourceConnectionId)
  );
  const targetConnection = activeDbconnections.find(
    (conn: any) => String(conn.connectionId) === String(item.targetConnectionId)
  );

  const handleToggleConfig = async (checkId: string) => {
    try {
      await toggleSqlConfig(undefined, {
        query: { checkId: checkId },
      });
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (error as { message?: string })?.message ??
        "Unknown error";

      toast.error("Could not update check status", { description: message, duration: 8000 });
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl bg-background px-4 py-3.5 ring-1 ring-border/60 transition hover:bg-muted/25 hover:ring-primary/30",
        runIsLive && "dc-live"
      )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={SourceCodeCircleIcon} size={18} />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-[15px] font-semibold text-foreground" title={String(item.checkName)}>{item.checkName}</h3>

              <Badge>{item.checkId}</Badge>

              <Badge tone="warning">{workstream?.tagTitle || "Worksteam N/A"}</Badge>

              <Badge tone={item.criticality?.toLowerCase() === "high" ? "warning" : "default"}>
                {" "}
                {item.criticality}{" "}
              </Badge>
            </div>
          </div>
        </div>

        {/* Edit, then the on/off switch at the far right, in the top corner of every card. */}
        <div className="flex shrink-0 items-center gap-3">
          <EditSqlDialog item={item} disabled={!item.enabled} />
          <Switch
            requires="configure"
            checked={item.enabled}
            disabled={isTogglePending}
            onCheckedChange={() => handleToggleConfig(item.checkId)}
          />
        </div>
      </div>

      {/* The facts on the left; View details and Run on the same line, at the right,
          with Run right-most. */}
      <div className="mt-2.5 flex items-end justify-between gap-4 md:pl-12">
        <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          <Meta label="Data Source" value={dataSource?.tagTitle || "Data Source N/A"} />
          <Meta label="Source Connection" value={sourceConnection?.connectionName || "SourceConnection N/A"} />
          <Meta label="Target Connection" value={targetConnection?.connectionName || "Target Connection N/A"} />

          <Meta label="Table Prefix" value={item.targetTablePrefix} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SqlViewDialog item={item} disabled={!item.enabled} />
          <RunCheckButton configId={item.checkId} source="custom-sql" enabled={item.enabled} />
        </div>
      </div>
    </div>
  );
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const className =
    tone === "warning"
      ? "bg-warning/10 text-warning"
      : tone === "success"
        ? "bg-success/10 text-success"
        : "bg-muted text-muted-foreground";

  return <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{children}</span>;
}

/**
 * One fact, label above value, always on a single line. A long name is cut with an ellipsis
 * and shown in full on hover, so a card never grows or reflows because of its content.
 */
function Meta({ label, value }: { label: string; value: string | number }) {
  const text = String(value ?? "—");

  return (
    <div className="min-w-0 max-w-[15rem]">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</p>
      <p className="truncate text-[13px] font-medium text-foreground" title={text}>
        {text}
      </p>
    </div>
  );
}
