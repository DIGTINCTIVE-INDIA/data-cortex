import type { QueryReturn } from "@/lib/useApi/types";
import { Alert02Icon, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "framer-motion";
import { type FC } from "react";
import QCAlertsSkeletons from "./QCAlertsSkeletons";
import QcPanel from "./QcPanel";

type QcAlertsSummaryCard = {
  summaryApi: QueryReturn<"GET /api/reports/qc-alerts/summary">;
};
const QcAlertsSummaryCard: FC<QcAlertsSummaryCard> = ({ summaryApi }) => {
  const { data, isLoading } = summaryApi;

  const summary = data?.data?.summary;
  const criticalitySummary = data?.data?.criticalitySummary;

  if (isLoading) {
    return <>{QCAlertsSkeletons.SummaryCards}</>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card
        tone="warning"
        icon={Warning}
        title="Total QC Alerts"
        value={summary?.totalQcAlerts ?? 0}
        items={[
          { label: "Open", value: summary?.open ?? 0, tone: "warning" },
          { label: "Resolved", value: summary?.resolved ?? 0, tone: "success" },
          { label: "Discarded", value: summary?.discarded ?? 0, tone: "error" },
        ]}
      />

      <Card
        tone="error"
        icon={Alert02Icon}
        title="Total Issues by Criticality"
        value={criticalitySummary?.totalIssues ?? 0}
        items={[
          { label: "High", value: criticalitySummary?.high ?? 0, tone: "error" },
          { label: "Medium", value: criticalitySummary?.medium ?? 0, tone: "warning" },
          { label: "Low", value: criticalitySummary?.low ?? 0, tone: "info" },
        ]}
      />
    </div>
  );
};

export default QcAlertsSummaryCard;

type Card = {
  title: string;
  value: number;
  icon: any;
  tone: "warning" | "error" | "success" | "info";
  items: { label: string; value: number; tone: string }[];
};

const Card: FC<Card> = ({ title, value, icon, tone, items }) => {
  const colorVar = getToneVar(tone);

  return (
    <m.div whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
      <QcPanel className="relative overflow-hidden p-5">
        <div className="absolute left-0 top-1 bottom-1 w-1.5 rounded-full" style={{ backgroundColor: colorVar }} />
        <div className="relative">
          <div className="flex items-start gap-4">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
              style={{
                color: colorVar,
                backgroundColor: `color-mix(in oklab, ${colorVar} 12%, transparent)`,
              }}>
              <HugeiconsIcon icon={icon} size={22} />
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <h2 className="mt-1 text-3xl font-semibold text-foreground">{value}</h2>
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 h-px bg-border/60" />

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {items.map(item => (
              <div
                key={item.label}
                className="rounded-2xl border border-border/40 bg-muted/30 p-3 text-center transition hover:bg-muted/40">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-semibold" style={{ color: getToneVar(item.tone) }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </QcPanel>
    </m.div>
  );
};

function getToneVar(tone: string) {
  if (tone === "success") return "var(--success)";
  if (tone === "warning") return "var(--warning)";
  if (tone === "error") return "var(--destructive)";
  if (tone === "info") return "var(--info)";
  return "var(--primary)";
}
