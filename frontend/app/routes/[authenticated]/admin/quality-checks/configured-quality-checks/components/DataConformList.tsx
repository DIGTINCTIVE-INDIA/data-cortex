import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/lib/useApi";
import type { ConfiguredDbCheckItem, ConfiguredFileCheckItem } from "@/lib/useApi/types/qcConfigurationApis.types";
import { cn } from "@/lib/utils";
import { Database01Icon, DocumentValidationIcon, PlayIcon, SourceCodeCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import React, { useMemo } from "react";
import { filterByWorkstream } from "../utils/filterByWorkstream";
import DbViewDialog from "./DbViewDialog";
import EditDbDialog from "./EditDbDialog";
import EditFileDialog from "./EditFileDialog";
import { EmptyState } from "./EmptyState";
import FileViewDialog from "./FileViewDialog";
import SectionBlock from "./SectionBlock";
import { SkeletonList } from "./ListSkeleton";
import { toast } from "sonner";
import { useRunIsLive } from "../useRunCheck";
import { RunCheckButton } from "./RunCheckButton";
type Props = {
  workstream: string;
};

export const DataConformList = ({ workstream }: Props) => {
  const {
    data: dbResponse,
    isInitialLoading: dbInitialLoading,
    isInitialError: dbInitialError,
    isInfiniteLoading: dbInfiniteLoading,
    isInfiniteError: dbInfiniteError,
    hasNextPage: dbHasNextPage,
    fetchNextPage: dbFetchNextPage,
    refetch: dbRefetch,
  } = useApi("GET /api/qc-configuration/db/list-checks");

  const {
    data: fileResponse,
    isInitialLoading: fileInitialLoading,
    isInitialError: fileInitialError,
    isInfiniteLoading: fileInfiniteLoading,
    isInfiniteError: fileInfiniteError,
    hasNextPage: fileHasNextPage,
    fetchNextPage: fileFetchNextPage,
    refetch: fileRefetch,
  } = useApi("GET /api/qc-configuration/file-storage/list-checks");

  const dbList = dbResponse?.data?.items || [];
  const fileList = fileResponse?.data?.items || [];

  const filteredDbList = useMemo(() => filterByWorkstream(dbList, workstream), [dbList, workstream]);
  const filteredFileList = useMemo(() => filterByWorkstream(fileList, workstream), [fileList, workstream]);

  return (
    <>
      <SectionBlock
        title="Database-Based Checks"
        description="Checks executed through API-scoped database calls."
        icon={Database01Icon}>
        {dbInitialLoading ? (
          <SkeletonList title="Database-Based Checks" />
        ) : filteredDbList.length === 0 ? (
          <EmptyState
            title="No Database Checks Yet"
            description="Create a Database check for the selected workstream."
          />
        ) : (
          <InfiniteListWrapper
            isLoading={dbInfiniteLoading}
            isError={dbInfiniteError}
            hasNextPage={dbHasNextPage}
            onLoadMore={dbFetchNextPage}
            onRetry={dbRefetch}>
            <div className="space-y-3">
              {filteredDbList.map(item => (
                <DbCheckCard key={item.configId} item={item} />
              ))}
            </div>
          </InfiniteListWrapper>
        )}
      </SectionBlock>

      <SectionBlock
        title="File-Based Checks"
        description="Configurations that validate incoming files, schema, LOVs, and mandatory fields."
        icon={DocumentValidationIcon}>
        {fileInitialLoading ? (
          <SkeletonList title="File-Based Checks" />
        ) : filteredFileList.length === 0 ? (
          <EmptyState
            title="No File Storage Checks Yet"
            description="Create a File Storage check for the selected workstream."
          />
        ) : (
          <InfiniteListWrapper
            isLoading={fileInfiniteLoading}
            isError={fileInfiniteError}
            hasNextPage={fileHasNextPage}
            onLoadMore={fileFetchNextPage}
            onRetry={fileRefetch}>
            <div className="space-y-3">
              {filteredFileList.map(item => (
                <FileCheckCard key={item.configId} item={item} />
              ))}
            </div>
          </InfiniteListWrapper>
        )}
      </SectionBlock>
    </>
  );
};

const DbCheckCard = ({ item }: { item: ConfiguredDbCheckItem }) => {
  const runIsLive = useRunIsLive(item.configId);

  const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/db/update-check", {
    query: {
      configId: item.configId,
    },
  });

  const { mutateAsync: toggleDBConfig, isPending: isTogglePending } = useApi(
    "PATCH /api/qc-configuration/db/toggle-check"
  );

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreams = libraries?.data?.workstream ?? [];
  const dataSources = libraries?.data?.dataSource ?? [];
  const activeDbconnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);

  const workstream = workstreams.find((ws: any) => String(ws.id) === String(item.workstream));
  const dataSource = dataSources.find((ds: any) => String(ds.id) === String(item.dataSource));
  const sourceConnection = activeDbconnections.find(
    (conn: any) => String(conn.connectionId) === String(item.sourceConnectionId)
  );
  const targetConnection = activeDbconnections.find(
    (conn: any) => String(conn.connectionId) === String(item.targetConnectionId)
  );

  const handleToggleConfig = async (configId: string) => {
    try {
      await toggleDBConfig(undefined, {
        query: { configId: configId },
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
        item.enabled ? "bg-background/80 hover:bg-background" : "bg-background/50 opacity-60",
        // A run this card just started is the card's own state for the next few
        // seconds, so the whole card breathes rather than only the button.
        runIsLive && "dc-live"
      )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={SourceCodeCircleIcon} size={18} />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-[15px] font-semibold text-foreground" title={String(item.configName)}>{item.configName}</h3>
              <Badge>{item.configId}</Badge>
              <Badge tone="warning">{workstream?.tagTitle || "Workstream N/A"}</Badge>
            </div>
          </div>
        </div>

        {/* Edit, then the on/off switch at the far right, in the top corner of every card. */}
        <div className="flex shrink-0 items-center gap-3">
          <EditDbDialog item={item} disabled={!item.enabled} />
          <Switch
            requires="configure"
            checked={item.enabled}
            disabled={isTogglePending}
            onCheckedChange={() => handleToggleConfig(item.configId)}
          />
        </div>
      </div>

      {/* The facts on the left; View details and Run on the same line, at the right,
          with Run right-most. */}
      <div className="mt-2.5 flex items-end justify-between gap-4 md:pl-12">
        <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          <Meta label="Data Source" value={dataSource?.tagTitle || "Data Source N/A"} />
          <Meta label="Source Connection" value={sourceConnection?.connectionName || "Source Connection N/A"} />
          <Meta label="Target Connection" value={targetConnection?.connectionName || "Target connection N/A"} />
          <Meta label="Table Prefix" value={item.targetTablePrefix} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DbViewDialog item={item} disabled={!item.enabled} />
          <RunCheckButton configId={item.configId} source="db" enabled={item.enabled} />
        </div>
      </div>
    </div>
  );
};

const FileCheckCard = ({ item }: { item: ConfiguredFileCheckItem }) => {
  const runIsLive = useRunIsLive(item.configId);

  const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/file-storage/update-check", {
    query: {
      configId: item.configId,
    },
  });

  const { mutateAsync: toggleFileConfig, isPending: isTogglePending } = useApi(
    "PATCH /api/qc-configuration/file-storage/toggle-check"
  );

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: fileConnections } = useApi("GET /api/file-storage/connections/list");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreams = libraries?.data?.workstream || [];
  const dataSources = libraries?.data?.dataSource || [];
  const activeFileconnections = (fileConnections?.data?.items ?? []).filter(connection => connection.enabled);
  const activeDbconnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);

  const workstream = workstreams.find((ws: any) => String(ws.id) === String(item.workstream));
  const dataSource = dataSources.find((ds: any) => String(ds.id) === String(item.dataSource));

  const sourceConnection = activeFileconnections.find(
    (conn: any) => String(conn.connectionId) === String(item.sourceConnectionId)
  );
  const targetConnection = activeDbconnections.find(
    (conn: any) => String(conn.connectionId) === String(item.targetConnectionId)
  );

  const handleToggleConfig = async (configId: string) => {
    try {
      await toggleFileConfig(undefined, {
        query: { configId: configId },
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
        item.enabled ? "bg-background/80 hover:bg-background" : "bg-background/50 opacity-60",
        // A run this card just started is the card's own state for the next few
        // seconds, so the whole card breathes rather than only the button.
        runIsLive && "dc-live"
      )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={DocumentValidationIcon} size={18} />
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-[15px] font-semibold text-foreground" title={String(item.configName)}>{item.configName}</h3>

              <Badge>{item.configId}</Badge>
              <Badge tone="warning">{workstream?.tagTitle || "Workstream N/A"}</Badge>
            </div>
          </div>
        </div>

        {/* Edit, then the on/off switch at the far right, in the top corner of every card. */}
        <div className="flex shrink-0 items-center gap-3">
          <EditFileDialog item={item} disabled={!item.enabled} />
          <Switch
            requires="configure"
            checked={item.enabled}
            disabled={isTogglePending}
            onCheckedChange={() => handleToggleConfig(item.configId)}
          />
        </div>
      </div>

      {/* The facts on the left; View details and Run on the same line, at the right,
          with Run right-most. */}
      <div className="mt-2.5 flex items-end justify-between gap-4 md:pl-12">
        <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
          <Meta label="Data Source" value={dataSource?.tagTitle || "DataSource N/A"} />
          <Meta label="Source Connection" value={sourceConnection?.connectionName || "Source Connection N/A"} />
          <Meta label="Target Connection" value={targetConnection?.connectionName || "Target connection N/A"} />
          <Meta label="Table Prefix" value={item.targetTablePrefix} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <FileViewDialog item={item} disabled={!item.enabled} />
          <RunCheckButton configId={item.configId} source="file" enabled={item.enabled} />
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
