import type { QcSummaryReportTotal } from "@/lib/useApi/types/reportsApis.types";
import { cn } from "@/lib/utils";
import { Calendar03Icon, CheckmarkCircle02Icon, TaskDone01Icon, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type SummarySectionProp = {
  totals: QcSummaryReportTotal | undefined;
};

const SummarySection = ({ totals }: SummarySectionProp) => {
  return (
    <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
      <MetricCard label="Total Checks Executed" value={totals?.checksExecuted ?? 0} icon={TaskDone01Icon} tone="info" />
      <MetricCard label="Checks Passed" value={totals?.checksPassed ?? 0} icon={CheckmarkCircle02Icon} tone="success" />
      <MetricCard label="Checks Failed" value={totals?.checksFailed ?? 0} icon={Warning} tone="error" />
      <MetricCard label="Pass Rate" value={`${totals?.passRate ?? 0}%`} icon={Calendar03Icon} tone="warning" />
    </div>
  );
};

export default SummarySection;

type MetricCardProp = {
  label: string;
  value: string | number;
  icon: any;
  tone: "success" | "error" | "warning" | "info";
};

function MetricCard({ label, value, icon, tone }: MetricCardProp) {
  const toneMap = {
    success: {
      card: "from-success/8 via-success/4 to-card border-success/15",
      icon: "bg-success/10 text-success",
      value: "text-success",
    },
    error: {
      card: "from-destructive/8 via-destructive/4 to-card border-destructive/15",
      icon: "bg-destructive/10 text-destructive",
      value: "text-destructive",
    },
    warning: {
      card: "from-warning/8 via-warning/4 to-card border-warning/15",
      icon: "bg-warning/10 text-warning",
      value: "text-warning",
    },
    info: {
      card: "from-muted/40 via-muted/20 to-card border-border/40",
      icon: "bg-primary/10 text-primary",
      value: "text-foreground",
    },
  }[tone];

  return (
    <div
      className={cn(
        "rounded-2xl border bg-gradient-to-br p-4 transition hover:-translate-y-0.5 hover:shadow-sm",
        toneMap.card
      )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={cn("mt-2 text-3xl font-semibold", toneMap.value)}>{value}</p>
        </div>

        <div className={cn("flex size-10 items-center justify-center rounded-2xl", toneMap.icon)}>
          <HugeiconsIcon icon={icon} size={20} />
        </div>
      </div>
    </div>
  );
}
