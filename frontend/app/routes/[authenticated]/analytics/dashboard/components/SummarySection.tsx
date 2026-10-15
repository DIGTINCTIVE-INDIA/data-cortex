import { Button } from "@/components/ui/button";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import type { ReportPeriod } from "@/lib/useApi/types/reportsApis.types";
import { RefreshIcon, ShieldCheck, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { defaultDashboardUrlParams } from "../constants";
import { SkeletonBlock } from "./DashboardSkeleton";
import MetricCard from "./MetricCard";
import Panel from "./Panel";
import { toApiNumber } from "../utils/UtilityFunctions";

const SummarySection = () => {
  const { params, setParam } = useUrlParams(defaultDashboardUrlParams);

  const baseQuery = useMemo(
    () => ({
      period: params.time_period as ReportPeriod,
      workstream: toApiNumber(params.workstream),
      dataSource: toApiNumber(params.data_source),
      impactedDownstream: toApiNumber(params.downstream),
    }),
    [params.time_period, params.workstream, params.data_source, params.downstream]
  );

  const summary = useApi("GET /api/dashboard/summary", { query: baseQuery });

  const summaryData = summary.data?.data;

  if (summary.isPending && !summary.data) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="h-36" />
      </div>
    );
  }

  if (summary.isError) {
    return (
      <Panel className="p-8">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Warning} size={24} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-foreground">Unable to load summary</h2>
          <p className="mt-2 text-sm text-muted-foreground">Please check the selected filters or API response.</p>
          <Button variant="outline" className="mt-4" disabled={summary.isFetching} onClick={() => summary.refetch()}>
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            {summary.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </Panel>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <MetricCard
        icon={ShieldCheck}
        title="Total Checks Executed"
        value={summaryData?.totalChecksExecuted ?? 0}
        tone="success"
        stats={[
          { label: "Passed", value: summaryData?.checksPassed ?? 0, tone: "success" },
          { label: "Failed", value: summaryData?.checksFailed ?? 0, tone: "error" },
          { label: "Pass Rate", value: `${summaryData?.passRate ?? 0}%`, tone: "info" },
        ]}
      />

      <MetricCard
        icon={Warning}
        title="Total Issues"
        value={summaryData?.totalIssues ?? 0}
        tone="warning"
        stats={[
          { label: "Open", value: summaryData?.openIssues ?? 0, tone: "warning" },
          { label: "Resolved", value: summaryData?.resolvedIssues ?? 0, tone: "success" },
          { label: "Discarded", value: summaryData?.discardedIssues ?? 0, tone: "error" },
        ]}
      />
    </div>
  );
};

export default SummarySection;
