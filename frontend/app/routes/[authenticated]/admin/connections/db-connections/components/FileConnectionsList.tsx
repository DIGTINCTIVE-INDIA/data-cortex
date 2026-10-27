import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import ItemCard from "@/components/ui/custom/ItemCard";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import { CloudIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { FileConnectionViewDialog } from "./ConnectionViewDialogs";
import EditFileDialog from "./EditFileDialog";
import { ListSkeleton } from "./ListSkeleton";

const FileStorageConnectionsList = () => {
  const {
    data: FileResponse,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useApi("GET /api/file-storage/connections/list");

  const items = FileResponse?.data?.items || [];

  const { mutateAsync: toggleFileConnection, isPending: isTogglePending } = useApi(
    "PATCH /api/file-storage/connections/toggle"
  );

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

      {/* LIST CONTAINER: a fixed height, so the page keeps its length and the list scrolls inside it */}
      <ItemCard className="h-[calc(100vh-20rem)] min-h-[24rem] overflow-y-auto">
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
              <FileConnectionCard
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

const FileConnectionCard = ({
  item,
  isTogglePending,
  onToggle,
}: {
  item: any;
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

        {/* ACTIONS: these must not also open the view */}
        <div className="flex items-center gap-1.5" onClick={event => event.stopPropagation()}>
          <EditFileDialog item={item} disabled={!item.enabled} />

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

      <FileConnectionViewDialog item={item} open={viewOpen} onOpenChange={setViewOpen} />
    </>
  );
};

export default FileStorageConnectionsList;
