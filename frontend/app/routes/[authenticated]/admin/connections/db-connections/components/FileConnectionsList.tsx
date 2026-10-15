import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/lib/useApi";
import { CloudIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import EditFileDialog from "./EditFileDialog";
import { ListSkeleton } from "./ListSkeleton";

const FileStorageConnectionsList = () => {
  const {
    data: FileResponse,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    isInfiniteError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useApi("GET /api/file-storage/connections/list");

  const items = FileResponse?.data?.items || [];

  const { mutateAsync: toggleFileConnection, isPending: isTogglePending } = useApi(
    "PATCH /api/file-storage/connections/toggle"
  );

  const { mutateAsync: mutateUpdate, isPending } = useApi("PATCH /api/file-storage/connections/update");

  const handleToggleConnection = async (connectionId: string) => {
    await toggleFileConnection(undefined, {
      query: { connectionId },
    });
  };

  if (isInitialLoading) return <ListSkeleton />;

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <HugeiconsIcon icon={CloudIcon} size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">File Storage</h3>
          <p className="text-xs text-muted-foreground">S3 & storage integrations</p>
        </div>
      </div>

      {/* LIST CONTAINER */}
      <div className="rounded-2xl bg-muted p-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center">No connections yet</div>
        ) : (
          <InfiniteListWrapper
            isLoading={isInfiniteLoading}
            isError={isInitialError}
            hasNextPage={hasNextPage}
            onLoadMore={fetchNextPage}
            onRetry={refetch}>
            {items.map((item: any) => (
              <div
                key={item.connectionId}
                className={`flex items-center justify-between px-4 py-3 rounded-xl bg-background/80 backdrop-blur hover:bg-background transition-all
                ${item.enabled ? "bg-background/80 hover:bg-background" : "bg-background/50 opacity-60"}`}>
                {/* LEFT */}
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <HugeiconsIcon icon={CloudIcon} size={18} className="text-primary" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-foreground">{item.connectionName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.storageType} • {item.bucketOrContainerName}
                    </div>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="flex items-center gap-1.5">
                  <EditFileDialog item={item} disabled={!item.enabled} />
                  {/* <DeleteFileDialog connectionId={item.connectionId} disabled={isPending} /> */}

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
      </div>
    </div>
  );
};

export default FileStorageConnectionsList;
