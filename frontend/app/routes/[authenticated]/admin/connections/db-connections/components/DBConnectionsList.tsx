import { useApi } from "@/lib/useApi";
import { DatabaseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import ItemCard from "@/components/ui/custom/ItemCard";
import { Switch } from "@/components/ui/switch";
import EditDBDialog from "./EditDBDialog";
import { SkeletonList } from "./ListSkeleton";

const DBConnectionsList = () => {
  const {
    data: DBResponse,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    isInfiniteError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useApi("GET /api/db/connections/list");

  const items = DBResponse?.data?.items || [];

  const { mutateAsync: toggleDBConnection, isPending: isTogglePending } = useApi("PATCH /api/db/connections/toggle");

  const { mutateAsync: mutateUpdate, isPending } = useApi("PATCH /api/db/connections/update");

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

      {/* LIST CONTAINER */}
      <ItemCard>
        {/* <div className="rounded-2xl bg-muted p-2 space-y-2"> */}
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
              <div
                key={item.connectionId}
                className={`flex items-center justify-between px-4 py-3 rounded-xl backdrop-blur transition-all
                ${item.enabled ? "bg-background/80 hover:bg-background" : "bg-background/50 opacity-60"}`}>
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

                {/* ACTIONS */}
                <div className="flex items-center gap-1.5">
                  <EditDBDialog item={item} disabled={!item.enabled} />
                  {/* <DeleteDBDialog connectionId={item.connectionId} disabled={isPending} /> */}

                  <div className="flex items-center gap-2">
                    <Switch
                      requires="configure"
                      checked={item.enabled}
                      disabled={isTogglePending}
                      onCheckedChange={() => handleToggleConnection(item.connectionId)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </InfiniteListWrapper>
        )}
      </ItemCard>
      {/* </div> */}
    </div>
  );
};

export default DBConnectionsList;
