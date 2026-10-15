import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "fetch" | "upload";

/**
 * Where the expected columns come from. One way is in front of you at a time.
 *
 * It used to be two large cards plus a drop zone under them, which read as a sequence of
 * steps and left the field table pushed far down the page. Now:
 *
 *   - nothing loaded yet: a single slim bar. If the columns can be read from the source,
 *     that is the default, with a small switch to "upload a file" instead; if they
 *     cannot, only the upload is shown and there is no switch to explain.
 *   - columns loaded: the bar collapses to one line ("12 columns loaded  Change"), so the
 *     table they feed gets the room.
 */
export function SchemaSourceChooser({
  uploadPanel,
  onFetch,
  isFetching,
  canFetch,
  fetchBlockedReason,
  loadedColumns,
  sourceLabel,
}: {
  uploadPanel: ReactNode;
  onFetch: () => void;
  isFetching: boolean;
  canFetch: boolean;
  fetchBlockedReason: string;
  loadedColumns: number;
  sourceLabel?: string;
}) {
  const [mode, setMode] = useState<Mode>(canFetch ? "fetch" : "upload");
  const [changing, setChanging] = useState(false);

  // Keep the mode valid if the ability to fetch appears or goes away.
  useEffect(() => {
    if (!canFetch) setMode("upload");
  }, [canFetch]);

  // Once columns arrive, fold the chooser away.
  useEffect(() => {
    if (loadedColumns > 0) setChanging(false);
  }, [loadedColumns]);

  if (loadedColumns > 0 && !changing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <p className="text-sm text-foreground">
          <span className="mr-1.5 text-success">✓</span>
          <span className="font-medium tabular-nums">{loadedColumns}</span> column{loadedColumns === 1 ? "" : "s"} loaded
        </p>

        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => setChanging(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Columns</p>

        {canFetch ? (
          <div role="radiogroup" aria-label="Where the columns come from" className="flex gap-1 rounded-lg bg-muted p-1">
            {(
              [
                ["fetch", sourceLabel ? `Read from ${sourceLabel}` : "Read from source"],
                ["upload", "Upload a file"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" title={fetchBlockedReason}>
            Upload a CSV, Excel or JSON file
          </p>
        )}
      </div>

      {mode === "fetch" && canFetch ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-sm text-muted-foreground">
            Takes the columns as they are now{sourceLabel ? ` in ${sourceLabel}` : ""}.
          </p>

          <Button type="button" size="sm" className="h-8 shrink-0 rounded-lg" onClick={onFetch} isLoading={isFetching}>
            Read columns
          </Button>
        </div>
      ) : (
        uploadPanel
      )}
    </div>
  );
}
