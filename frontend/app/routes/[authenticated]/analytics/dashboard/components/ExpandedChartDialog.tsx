import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { CloseIcon, DownloadIcon } from "./Icon";

type ExpandedChartDialogProps = {
  open: boolean;
  title: string;
  zoomEnabled: boolean;
  showZoomToggle: boolean;
  onZoomChange: (value: boolean) => void;
  onClose: () => void;
  onDownload: () => void;
  children: ReactNode;
};

const ExpandedChartDialog = ({
  open,
  title,
  zoomEnabled,
  showZoomToggle,
  onZoomChange,
  onClose,
  onDownload,
  children,
}: ExpandedChartDialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-background/92 p-3 backdrop-blur-md md:p-6">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden rounded-[30px] bg-card shadow-2xl ring-1 ring-border">
        <div className="flex shrink-0 flex-col gap-4 border-b border-border/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Expanded view for better readability. Enable zoom only when needed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showZoomToggle && (
              <Button
                type="button"
                onClick={() => onZoomChange(!zoomEnabled)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-2xl px-3 text-xs font-semibold ring-1 transition",
                  zoomEnabled
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-muted/40 text-muted-foreground ring-border hover:bg-muted"
                )}>
                <span
                  className={cn("size-2 rounded-full", zoomEnabled ? "bg-primary-foreground" : "bg-muted-foreground")}
                />
                {zoomEnabled ? "Zoom enabled" : "Enable zoom"}
              </Button>
            )}

            <Button variant="outline" size="sm" className="rounded-2xl" onClick={onDownload}>
              <DownloadIcon className="mr-2" />
              Download PNG
            </Button>

            <Button variant="ghost" size="sm" className="rounded-2xl" onClick={onClose}>
              <CloseIcon className="mr-2" />
              Close
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
};

export default ExpandedChartDialog;
