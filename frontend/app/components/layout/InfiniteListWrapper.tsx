import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, type FC } from "react";

type InfiniteListWrapper = {
  children: React.ReactNode;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
};

/**
 * Reusable auto infinite-scroll wrapper.
 *
 * Uses an invisible sentinel div after the last item, so no fixed height or width is required.
 * When the sentinel enters the viewport, it automatically calls `onLoadMore`.
 *
 * It also shows:
 * - theme-based slim spinner while loading more
 * - retry button when loading more fails
 *
 * @example
 * const {
 *   data,
 *   refetch,
 *   isInitialLoading,
 *   isInitialError,
 *   isInfiniteLoading,
 *   isInfiniteError,
 *   hasNextPage,
 *   fetchNextPage,
 * } = useApi("GET /api/libraries/qc-tags/:type", {
 *   params: { type },
 * });
 *
 * const items = data?.data?.items || [];
 *
 * return (
 *   <InfiniteListWrapper
 *     isLoading={isInfiniteLoading}
 *     isError={isInfiniteError}
 *     hasNextPage={!!hasNextPage}
 *     onLoadMore={fetchNextPage}
 *     onRetry={refetch}
 *   >
 *     {items.map(item => (
 *       <div key={item.id}>{item.tagTitle}</div>
 *     ))}
 *   </InfiniteListWrapper>
 * );
 */
const InfiniteListWrapper: FC<InfiniteListWrapper> = ({
  children,
  isLoading,
  isError,
  hasNextPage,
  onLoadMore,
  onRetry,
}) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;

    if (!node) return;
    if (!hasNextPage) return;
    if (isLoading) return;
    if (isError) return;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];

        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      {
        root: null,
        rootMargin: "180px",
        threshold: 0.1,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isLoading, isError, onLoadMore]);

  return (
    <>
      {children}

      <div ref={sentinelRef} className="h-px w-full" />

      {isLoading && (
        <div className="flex justify-center py-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-xs text-muted-foreground">Something went wrong. Please try again.</p>

          <button
            type="button"
            onClick={onRetry}
            className="
                group inline-flex size-10 cursor-pointer items-center justify-center rounded-full
                border border-border/70
                bg-gradient-to-b from-background to-muted
                text-muted-foreground shadow-sm transition-all duration-200
                hover:scale-105 hover:border-primary/40 hover:text-primary hover:shadow-md
                active:scale-95
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                "
            aria-label="Retry loading more">
            <HugeiconsIcon
              icon={RefreshIcon}
              size={18}
              className="transition-transform duration-300 group-hover:rotate-180"
            />
          </button>
        </div>
      )}
    </>
  );
};

export default InfiniteListWrapper;
