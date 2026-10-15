import { Button } from "@/components/ui/button";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import { ArrowRight02Icon, RefreshIcon, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { defaultDashboardUrlParams } from "../constants";
import { toApiNumber, toQcAlertPeriod } from "../utils/UtilityFunctions";
import { SkeletonBlock } from "./DashboardSkeleton";
import { EmptyState } from "./EmptyState";
import Panel from "./Panel";

type AlertsPanelProps = {
  onOpen: () => void;
};

const AlertsPanel = memo(({ onOpen }: AlertsPanelProps) => {
  const { params } = useUrlParams(defaultDashboardUrlParams);

  const recentAlerts = useApi("GET /api/reports/qc-alerts", {
    query: {
      status: "open",
      period: toQcAlertPeriod(params.time_period) as any,
      workstream: toApiNumber(params.workstream),
      impactedDownstream: toApiNumber(params.downstream),
    },
  });

  const alerts = recentAlerts.data?.data?.items ?? [];

  if (recentAlerts.isPending && !recentAlerts.data) {
    return (
      <Panel className="p-5">
        <div className="space-y-3">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      </Panel>
    );
  }

  // isError is deliberately not on InfiniteApiReturn: an infinite query can fail
  // on the first page or on a later one, and those mean different things. This
  // panel only renders the first page, so the initial failure is the one to show.
  if (recentAlerts.isInitialError) {
    return (
      <Panel className="p-8">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Warning} size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Unable to load alerts</h2>
          <p className="mt-2 text-sm text-muted-foreground">Please check the selected filters or API response.</p>
          <Button
            variant="outline"
            className="mt-4"
            disabled={recentAlerts.isFetching}
            onClick={() => recentAlerts.refetch()}>
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            {recentAlerts.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="max-h-[calc(100vh-3rem)] overflow-hidden p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Recent QC Alerts & Investigation</h2>

          <p className="mt-1 text-xs text-muted-foreground">Latest failures and investigation queue</p>
        </div>

        <Button variant="ghost" size="sm" className="shrink-0 text-primary" onClick={onOpen}>
          Go to QC Alerts
          <HugeiconsIcon icon={ArrowRight02Icon} size={15} />
        </Button>
      </div>

      {!alerts.length ? (
        <EmptyState message="No open alerts found." />
      ) : (
        <div className="max-h-[calc(100vh-11rem)] space-y-3 overflow-auto pr-1">
          {alerts.map((alert: any) => (
            <div
              key={alert.id}
              className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border/60 transition hover:bg-muted/45">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                    alert.criticality === "high"
                      ? "bg-destructive/10 text-destructive"
                      : alert.criticality === "medium"
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success"
                  )}>
                  {alert.criticality}
                </span>

                {alert.category && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {alert.category}
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-foreground">{alert.title}</h3>

              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {alert.failureReason ?? alert.description}
              </p>

              <p className="mt-3 text-[11px] text-muted-foreground">{alert.jobTimestamp}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
});

export default AlertsPanel;
