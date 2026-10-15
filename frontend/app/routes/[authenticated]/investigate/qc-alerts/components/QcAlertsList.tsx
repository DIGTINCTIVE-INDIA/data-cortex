"use client";

import InfiniteListWrapper from "@/components/layout/InfiniteListWrapper";
import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { Input } from "@/components/ui/input";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi, type InfiniteApiReturn } from "@/lib/useApi";
import type { QcAlertItems, QcAlertsSummary } from "@/lib/useApi/types/qcAlerts.types";
import { cn } from "@/lib/utils";
import {
  ArrowRight02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  EyeIcon,
  Search01Icon,
  ShieldCheck,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";

import { affectedLabel, AlertDetailsDialog, AlertStatusDialog, formatCount } from "./AlertDialogs";
import type { FC } from "react";
import type { TabValue } from "../constants";
import { defaultQcAlertsUrlParams } from "./QcAlertsFiltersSection";
import QCAlertsSkeletons from "./QCAlertsSkeletons";
import QcPanel from "./QcPanel";

// type TabValue = "open" | "resolved" | "discarded";

type QcAlertsList = {
  qcAlertsApi: InfiniteApiReturn<any>;
  summary?: QcAlertsSummary;
};
const QcAlertsList: FC<QcAlertsList> = ({ qcAlertsApi, summary }) => {
  const { params, setParam } = useUrlParams(defaultQcAlertsUrlParams);

  const {
    data,
    isInitialLoading,
    isInitialError,
    isInfiniteLoading,
    isInfiniteError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = qcAlertsApi;

  const alerts = data?.data?.items || [];

  if (isInitialLoading) {
    return <>{QCAlertsSkeletons.AlertsList}</>;
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <AnimatedTabs
          value={params.tab}
          onValueChange={v => setParam("tab", v as TabValue)}
          tabs={[
            { value: "open", label: `Open QC Alerts (${summary?.open ?? 0})` },
            { value: "resolved", label: `Resolved QC Alerts (${summary?.resolved ?? 0})` },
            { value: "discarded", label: `Discarded Issues (${summary?.discarded ?? 0})` },
          ]}
        />

        <div className="relative w-full lg:max-w-md">
          <HugeiconsIcon
            icon={Search01Icon}
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={params.search}
            onChange={e => setParam("search", e.target.value)}
            placeholder="Search by title, RCA ID, or description..."
            className="h-11 rounded-2xl border-border bg-card pl-10 text-sm"
          />
        </div>
      </div>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <QcPanel className="p-10 text-center">
            <p className="text-sm text-muted-foreground">No QC alerts found</p>
          </QcPanel>
        ) : (
          <InfiniteListWrapper
            isLoading={isInfiniteLoading}
            isError={isInfiniteError}
            hasNextPage={!!hasNextPage}
            onLoadMore={fetchNextPage}
            onRetry={refetch}>
            {alerts.map((alert: QcAlertItems, index: number) => (
              <AlertCard key={alert.id} alert={alert} index={index} />
            ))}
          </InfiniteListWrapper>
        )}
      </div>
    </>
  );
};

export default QcAlertsList;

const AlertCard = ({ alert, index }: { alert: QcAlertItems; index: number }) => {
  const { mutateAsync: updateAlertStatus, isPending } = useApi("PATCH /api/reports/qc-alerts/:id/status");
  const [showDetails, setShowDetails] = useState(false);
  // Which status dialog is open, if any. Both outcomes go through the same
  // dialog now that a resolve may also carry a note.
  const [statusPrompt, setStatusPrompt] = useState<"resolved" | "discarded" | null>(null);
  const criticalityColor = getCriticalityVar(alert.criticality);

  function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035 }}
      className="group rounded-3xl bg-muted/40 p-2">
      <div className="relative overflow-hidden rounded-[22px] bg-card p-5 shadow-soft ring-1 ring-border/60 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:ring-primary/30">
        <div
          className="absolute bottom-0 left-0 top-0 w-1 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ backgroundColor: criticalityColor }}
        />

        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                style={{
                  color: criticalityColor,
                  backgroundColor: `color-mix(in oklab, ${criticalityColor} 12%, transparent)`,
                }}>
                {capitalize(alert.criticality)}
              </Badge>

              <Badge className="border-warning/40 bg-warning/10 text-warning">Rule Based - {alert.category}</Badge>
            </div>

            <h3
              className={cn(
                "text-base font-semibold text-foreground",
                alert.title.includes("Null values") && "text-warning"
              )}>
              {alert.title}
            </h3>

            <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">{alert.description}</p>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <Meta label="QC ID" value={alert.checkId} />
              <Meta label="Workstream" value={alert.workstream} />
              <Meta label="Source" value={alert.source} />
              <Meta label={affectedLabel(alert.checkId)} value={formatCount(alert.recordsAffected)} />
              <Meta label="Impacted Downstream" value={alert.impactedDownstream.join(", ")} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={() => setShowDetails(true)}>
                <HugeiconsIcon icon={EyeIcon} size={16} />
                View Details
              </Button>

              {/* An open alert is waiting on a decision, so the two outcomes are
                  solid buttons -- they used to be tinted outlines, which read as
                  status labels rather than as something you press. The settled
                  states below are badges, a different genre entirely, so a
                  decided alert can never be mistaken for one awaiting action. */}
              {alert.issueStatus === "open" && (
                <>
                  <span className="mr-1 self-center text-xs text-muted-foreground">Choose an action:</span>

                  <Button
                    onlyAdmin
                    variant="success"
                    size="sm"
                    isLoading={isPending}
                    className="h-9 rounded-xl"
                    onClick={() => setStatusPrompt("resolved")}>
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
                    Mark Resolved
                  </Button>

                  <Button
                    onlyAdmin
                    variant="errorSoft"
                    size="sm"
                    isLoading={isPending}
                    className="h-9 rounded-xl"
                    onClick={() => setStatusPrompt("discarded")}>
                    <HugeiconsIcon icon={CancelCircleIcon} size={16} />
                    Discard
                  </Button>
                </>
              )}

              {alert.issueStatus === "resolved" && (
                <Badge className="h-7 gap-1.5 px-3 bg-success/10 text-success">
                  <HugeiconsIcon icon={ShieldCheck} size={14} />
                  Resolved
                </Badge>
              )}

              {alert.issueStatus === "discarded" && (
                <Badge className="h-7 gap-1.5 px-3 bg-destructive/10 text-destructive">
                  <HugeiconsIcon icon={CancelCircleIcon} size={14} />
                  Discarded
                </Badge>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-2xl text-muted-foreground transition-colors group-hover:text-primary">
            <HugeiconsIcon icon={ArrowRight02Icon} size={20} />
          </Button>
        </div>
      </div>

      <AlertDetailsDialog alert={showDetails ? alert : null} onClose={() => setShowDetails(false)} />

      <AlertStatusDialog
        alert={statusPrompt ? alert : null}
        status={statusPrompt ?? "discarded"}
        isPending={isPending}
        onClose={() => setStatusPrompt(null)}
        onConfirm={async reason => {
          const status = statusPrompt ?? "discarded";

          try {
            await updateAlertStatus({ status, reason }, { params: { id: alert.id } });
            setStatusPrompt(null);
          } catch (error) {
            const message =
              (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              (status === "resolved" ? "Could not resolve the issue" : "Could not discard the issue");

            toast.error(message);
          }
        }}
      />
    </motion.div>
  );
};

function getCriticalityVar(criticality: string) {
  if (criticality === "high") return "var(--destructive)";
  if (criticality === "medium") return "var(--warning)";
  return "var(--info)";
}

function Badge({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold",
        className
      )}>
      {children}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="font-semibold text-foreground/80">{label}:</span> <span>{value}</span>
    </span>
  );
}
