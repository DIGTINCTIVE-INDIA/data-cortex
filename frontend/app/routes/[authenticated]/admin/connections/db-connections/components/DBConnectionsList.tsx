import { useApi } from "@/lib/useApi";
import type { DBConnectionItem } from "@/lib/useApi/types/connectionApis.types";
import { cn } from "@/lib/utils";
import { DatabaseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import ItemCard from "@/components/ui/custom/ItemCard";
import { Switch } from "@/components/ui/switch";
import { DbConnectionViewDialog } from "./ConnectionViewDialogs";
import EditDBDialog from "./EditDBDialog";
import { SkeletonList } from "./ListSkeleton";

const DBConnectionsList = () => {
  const {
    data: DBResponse,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useApi("GET /api/db/connections/list");

  const items = DBResponse?.data?.items || [];

  const { mutateAsync: toggleDBConnection, isPending: isTogglePending } = useApi("PATCH /api/db/connections/toggle");

  const handleToggleConnection = async (connectionId: string) => {
    await toggleDBConnection(undefined, {
      query: { connectionId },
    });
  };

  if (isInitialLoading) return <SkeletonList title="Database Connections" />;

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <HugeiconsIcon icon={DatabaseIcon} size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Database Connections</h3>
          <p className="text-xs text-muted-foreground">All configured database sources</p>
        </div>
      </div>

      {/* LIST CONTAINER: a fixed height, so the page keeps its length and the list scrolls inside it */}
      <ItemCard className="h-[calc(100vh-20rem)] min-h-[24rem] overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center">No database connections yet</div>
        ) : (
          <InfiniteListWrapper
            isLoading={isInfiniteLoading}
            isError={isInitialError}
            hasNextPage={hasNextPage}
            onLoadMore={fetchNextPage}
            onRetry={refetch}>
            {items.map(item => (
              <DbConnectionCard
                key={item.connectionId}
                item={item}
                isTogglePending={isTogglePending}
                onToggle={handleToggleConnection}
              />
            ))}
          </InfiniteListWrapper>
        )}
      </ItemCard>
    </div>
  );
};

const DbConnectionCard = ({
  item,
  isTogglePending,
  onToggle,
}: {
  item: DBConnectionItem;
  isTogglePending: boolean;
  onToggle: (connectionId: string) => void;
}) => {
  const [viewOpen, setViewOpen] = useState(false);

  return (
    <>
      {/* Clicking the card is how a connection is viewed. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => item.enabled && setViewOpen(true)}
        onKeyDown={event => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            if (item.enabled) setViewOpen(true);
          }
        }}
        className={cn(
          "flex items-center justify-between rounded-xl px-4 py-3 backdrop-blur transition-all duration-200",
          item.enabled
            ? "cursor-pointer bg-background/80 hover:-translate-y-0.5 hover:bg-background hover:shadow-md hover:shadow-primary/5 active:translate-y-0"
            : "bg-background/50 opacity-60"
        )}>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HugeiconsIcon icon={DatabaseIcon} size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">{item.connectionName}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {item.host}:{item.port} • {item.databaseName}
            </div>
          </div>
        </div>

        {/* ACTIONS: these must not also open the view */}
        <div className="flex items-center gap-1.5" onClick={event => event.stopPropagation()}>
          <EditDBDialog item={item} disabled={!item.enabled} />

          <div className="flex items-center gap-2">
            <Switch
              requires="configure"
              checked={item.enabled}
              disabled={isTogglePending}
              onCheckedChange={() => onToggle(item.connectionId)}
            />
          </div>
        </div>
      </div>

      <DbConnectionViewDialog item={item} open={viewOpen} onOpenChange={setViewOpen} />
    </>
  );
};

export default DBConnectionsList;
