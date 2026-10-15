import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import type { ReportPeriod } from "@/lib/useApi/types/reportsApis.types";
import { RefreshIcon, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ReactECharts from "echarts-for-react";
import { startTransition, useCallback, useMemo, useRef, useState } from "react";
import { defaultDashboardUrlParams } from "../constants";
import { useChartTheme } from "../hooks/useChartTheme";
import { buildSourceOption } from "../utils/ChartOptions";
import { downloadEChartAsReportPng, formatExportDate } from "../utils/exportUtils";
import { toApiNumber } from "../utils/UtilityFunctions";
import { ChartActions, ChartCard, MemoEChart } from "./Chart";
import { SkeletonBlock } from "./DashboardSkeleton";
import { ChartEmpty } from "./EmptyState";
import ExpandedChartDialog from "./ExpandedChartDialog";
import Panel from "./Panel";

type SourceChart = "bar" | "treemap";

type Props = {
  chartRef: React.RefObject<ReactECharts | null>;
};

const SourceChartSection = ({ chartRef }: Props) => {
  const c = useChartTheme();

  const [sourceChart, setSourceChart] = useState<SourceChart>("bar");

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

  const sources = useApi("GET /api/dashboard/issues-by-source", {
    query: baseQuery,
  });

  const sourceRows = sources.data?.data ?? [];

  const sourceOption = useMemo(
    () =>
      buildSourceOption(sourceRows, sourceChart, c, {
        expanded: false,
        enableZoom: false,
      }),
    [sourceRows, sourceChart, c]
  );

  const expandedSourceOption = useMemo(
    () =>
      buildSourceOption(sourceRows, sourceChart, c, {
        expanded: true,
        enableZoom: expandedZoomEnabled,
      }),
    [sourceRows, sourceChart, c, expandedZoomEnabled]
  );

  const downloadChart = useCallback(() => {
    downloadEChartAsReportPng(expandedOpen ? expandedChartRef : chartRef, "quality-issues-by-source", c, {
      title: "Quality Issues by Source",
      subtitle: [
        `Period: ${params.time_period}`,
        `Workstream: ${params.workstream}`,
        `Source: ${params.data_source}`,
        `Downstream: ${params.downstream}`,
      ].join(" • "),
      footer: `DataCortex • Exported ${formatExportDate(new Date())}`,
    });
  }, [expandedOpen, chartRef, c, params]);

  if (sources.isPending && !sources.data) {
    return <SkeletonBlock className="h-[480px]" />;
  }

  if (sources.isError) {
    return (
      <Panel className="p-8">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Warning} size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Unable to load source chart</h2>
          <p className="mt-2 text-sm text-muted-foreground">Please check the selected filters or API response.</p>
          <Button variant="outline" className="mt-4" disabled={sources.isFetching} onClick={() => sources.refetch()}>
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            {sources.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <ChartCard
        title="Quality Issues by Source"
        action={
          <AnimatedTabs
            value={sourceChart}
            onValueChange={v => startTransition(() => setSourceChart(v as SourceChart))}
            btnClassName="px-1 min-w-[90px] text-[12px]"
            tabs={[
              {
                value: "bar",
                label: "Bar",
              },
              {
                value: "treemap",
                label: "Treemap",
              },
            ]}
          />
        }
        tools={<ChartActions onExpand={() => setExpandedOpen(true)} onDownload={downloadChart} />}>
        <ChartEmpty isEmpty={!sourceRows.length}>
          <MemoEChart chartRef={chartRef} option={sourceOption} height={330} />
        </ChartEmpty>
      </ChartCard>

      <ExpandedChartDialog
        open={expandedOpen}
        title="Quality Issues by Source"
        zoomEnabled={expandedZoomEnabled}
        showZoomToggle
        onZoomChange={setExpandedZoomEnabled}
        onClose={() => setExpandedOpen(false)}
        onDownload={downloadChart}>
        <MemoEChart chartRef={expandedChartRef} option={expandedSourceOption} height="calc(100vh - 190px)" />
      </ExpandedChartDialog>
    </>
  );
};

export default SourceChartSection;
