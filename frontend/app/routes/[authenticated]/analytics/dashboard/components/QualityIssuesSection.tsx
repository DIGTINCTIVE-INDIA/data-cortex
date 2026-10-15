import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import type { ReportPeriod } from "@/lib/useApi/types/reportsApis.types";
import { ArrowRight02Icon, RefreshIcon, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ReactECharts from "echarts-for-react";
import { startTransition, useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { defaultDashboardUrlParams } from "../constants";
import { useChartTheme } from "../hooks/useChartTheme";
import { buildQualityIssuesOption } from "../utils/ChartOptions";
import { downloadEChartAsReportPng, downloadQualityIssuesCsv, formatExportDate } from "../utils/exportUtils";
import { toApiNumber } from "../utils/UtilityFunctions";
import { ChartActions, ChartCard, MemoEChart } from "./Chart";
import { SkeletonBlock } from "./DashboardSkeleton";
import { ChartEmpty } from "./EmptyState";
import ExpandedChartDialog from "./ExpandedChartDialog";
import Panel from "./Panel";
import QualityIssuesTable from "./QualityIssuesTable";

type IssueGroupBy = "criticality" | "workstream";
type IssueChartView = "bar" | "pie" | "table";
type IssueBucket = "weekly" | "monthly";

type Props = {
  chartRef: React.RefObject<ReactECharts | null>;
};

const QualityIssuesSection = ({ chartRef }: Props) => {
  const c = useChartTheme();
  const navigate = useNavigate();

  const [issueGroupBy, setIssueGroupBy] = useState<IssueGroupBy>("workstream");
  const [issueView, setIssueView] = useState<IssueChartView>("table");
  const [issueBucket, setIssueBucket] = useState<IssueBucket>("weekly");

  const [expandedOpen, setExpandedOpen] = useState(false);
  const [expandedZoomEnabled, setExpandedZoomEnabled] = useState(false);

  const expandedChartRef = useRef<ReactECharts>(null);

  const { params } = useUrlParams(defaultDashboardUrlParams);

  const baseQuery = useMemo(
    () => ({
      period: params.time_period as ReportPeriod,
      workstream: toApiNumber(params.workstream),
      dataSource: toApiNumber(params.data_source),
      impactedDownstream: toApiNumber(params.downstream),
    }),
    [params.time_period, params.workstream, params.data_source, params.downstream]
  );

  const trend = useApi("GET /api/dashboard/issues-trend", {
    query: {
      ...baseQuery,
      bucket: issueBucket,
      groupBy: issueGroupBy,
    },
  });

  const table = useApi("GET /api/dashboard/issues-table", {
    query: baseQuery,
  });

  const trendRows = trend.data?.data ?? [];
  const tableRows = table.data?.data ?? [];

  const issuesOption = useMemo(
    () =>
      buildQualityIssuesOption(trendRows, issueGroupBy, issueView, c, {
        expanded: false,
        enableZoom: false,
      }),
    [trendRows, issueGroupBy, issueView, c]
  );

  const expandedIssuesOption = useMemo(
    () =>
      buildQualityIssuesOption(trendRows, issueGroupBy, issueView, c, {
        expanded: true,
        enableZoom: expandedZoomEnabled,
      }),
    [trendRows, issueGroupBy, issueView, c, expandedZoomEnabled]
  );

  const downloadChart = useCallback(() => {
    const fileName = `quality-issues-${params.time_period}`;

    if (issueView === "table") {
      downloadQualityIssuesCsv(tableRows, fileName);
      return;
    }

    downloadEChartAsReportPng(expandedOpen ? expandedChartRef : chartRef, fileName, c, {
      title: "Quality Issues",
      subtitle: [
        `Period: ${params.time_period}`,
        `Workstream: ${params.workstream}`,
        `Source: ${params.data_source}`,
        `Downstream: ${params.downstream}`,
      ].join(" • "),
      footer: `DataCortex • Exported ${formatExportDate(new Date())}`,
    });
  }, [expandedOpen, chartRef, issueView, tableRows, c, params]);

  const isLoading = (trend.isPending && !trend.data) || (table.isPending && !table.data);

  if (isLoading) {
    return <SkeletonBlock className="h-[480px]" />;
  }

  if (trend.isError || table.isError) {
    return (
      <Panel className="p-8">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Warning} size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Unable to load quality issues</h2>
          <p className="mt-2 text-sm text-muted-foreground">Please check the selected filters or API response.</p>
          <Button
            variant="outline"
            className="mt-4"
            disabled={trend.isFetching || table.isFetching}
            onClick={() => {
              trend.refetch();
              table.refetch();
            }}>
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            {trend.isFetching || table.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <ChartCard
        title="Quality Issues"
        action={
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <AnimatedTabs
                value={issueGroupBy}
                onValueChange={v => startTransition(() => setIssueGroupBy(v as IssueGroupBy))}
                btnClassName="min-w-[120px] text-[13px]"
                tabs={[
                  {
                    value: "workstream",
                    label: "By Workstream",
                  },
                  {
                    value: "criticality",
                    label: "By Criticality",
                  },
                ]}
              />

              <AnimatedTabs
                value={issueView}
                onValueChange={v => startTransition(() => setIssueView(v as IssueChartView))}
                btnClassName="min-w-[80px] text-[13px]"
                tabs={[
                  {
                    value: "bar",
                    label: "Bar",
                  },
                  {
                    value: "pie",
                    label: "Pie",
                  },
                  {
                    value: "table",
                    label: "Table",
                  },
                ]}
              />

              {issueView == "bar" && (
                <AnimatedTabs
                  value={issueBucket}
                  onValueChange={v => startTransition(() => setIssueBucket(v as IssueBucket))}
                  btnClassName="min-w-[90px] text-[13px]"
                  tabs={[
                    {
                      value: "weekly",
                      label: "Weekly",
                    },
                    {
                      value: "monthly",
                      label: "Monthly",
                    },
                  ]}
                />
              )}
            </div>

            <Button
              variant="ghost"
              className="text-primary lg:ml-auto"
              onClick={() => navigate("/investigate/qc-alerts")}>
              View Details
              <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
            </Button>
          </div>
        }
        tools={<ChartActions onExpand={() => setExpandedOpen(true)} onDownload={downloadChart} />}>
        {issueView === "table" ? (
          <QualityIssuesTable rows={tableRows} />
        ) : (
          <ChartEmpty isEmpty={!trendRows.length}>
            <MemoEChart chartRef={chartRef} option={issuesOption} height={430} />
          </ChartEmpty>
        )}
      </ChartCard>

      <ExpandedChartDialog
        open={expandedOpen}
        title="Quality Issues"
        zoomEnabled={expandedZoomEnabled}
        showZoomToggle={issueView !== "table"}
        onZoomChange={setExpandedZoomEnabled}
        onClose={() => setExpandedOpen(false)}
        onDownload={downloadChart}>
        {issueView === "table" ? (
          <div className="h-[calc(100vh-190px)] overflow-auto rounded-2xl">
            <QualityIssuesTable rows={tableRows} />
          </div>
        ) : (
          <MemoEChart chartRef={expandedChartRef} option={expandedIssuesOption} height="calc(100vh - 190px)" />
        )}
      </ExpandedChartDialog>
    </>
  );
};

export default QualityIssuesSection;
