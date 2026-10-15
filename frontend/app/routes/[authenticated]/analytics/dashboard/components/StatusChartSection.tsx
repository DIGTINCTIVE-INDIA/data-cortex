import { Button } from "@/components/ui/button";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import type { ReportPeriod } from "@/lib/useApi/types/reportsApis.types";
import { RefreshIcon, Warning } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultDashboardUrlParams } from "../constants";
import { useChartTheme } from "../hooks/useChartTheme";
import { buildStatusOption } from "../utils/ChartOptions";
import { downloadEChartAsReportPng, formatExportDate } from "../utils/exportUtils";
import { toApiNumber } from "../utils/UtilityFunctions";
import { ChartActions, ChartCard, MemoEChart } from "./Chart";
import { SkeletonBlock } from "./DashboardSkeleton";
import { ChartEmpty } from "./EmptyState";
import ExpandedChartDialog from "./ExpandedChartDialog";
import Panel from "./Panel";

const StatusChartSection = () => {
  const c = useChartTheme();

  const chartRef = useRef<ReactECharts>(null);
  const expandedChartRef = useRef<ReactECharts>(null);

  const [expandedOpen, setExpandedOpen] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);

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

  const status = useApi("GET /api/dashboard/issues-status", {
    query: baseQuery,
  });

  const statusRows = status.data?.data ?? [];

  const statusOption = useMemo(
    () =>
      buildStatusOption(statusRows, c, {
        expanded: false,
        enableZoom: false,
      }),
    [statusRows, c]
  );

  const expandedStatusOption = useMemo(
    () =>
      buildStatusOption(statusRows, c, {
        expanded: true,
        enableZoom: zoomEnabled,
      }),
    [statusRows, c, zoomEnabled]
  );

  useEffect(() => {
    if (!expandedOpen) return;

    setZoomEnabled(false);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expandedOpen]);

  const downloadChart = useCallback(() => {
    downloadEChartAsReportPng(expandedOpen ? expandedChartRef : chartRef, "issues-status", c, {
      title: "Issues & Status",
      subtitle: "Current dashboard filters",
      footer: `DataCortex • Exported ${formatExportDate(new Date())}`,
    });
  }, [expandedOpen, c]);

  if (status.isPending && !status.data) {
    return <SkeletonBlock className="h-[480px]" />;
  }

  if (status.isError) {
    return (
      <Panel className="p-8">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={Warning} size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Unable to load status chart</h2>

          <p className="mt-2 text-sm text-muted-foreground">Please check the selected filters or API response.</p>

          <Button variant="outline" className="mt-4" disabled={status.isFetching} onClick={() => status.refetch()}>
            <HugeiconsIcon icon={RefreshIcon} size={16} />
            {status.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <ChartCard
        title="Issues & Status"
        tools={<ChartActions onExpand={() => setExpandedOpen(true)} onDownload={downloadChart} />}>
        <ChartEmpty isEmpty={!statusRows.length}>
          <MemoEChart chartRef={chartRef} option={statusOption} height={382} />
        </ChartEmpty>
      </ChartCard>

      <ExpandedChartDialog
        open={expandedOpen}
        title="Issues & Status"
        zoomEnabled={zoomEnabled}
        showZoomToggle
        onZoomChange={setZoomEnabled}
        onClose={() => setExpandedOpen(false)}
        onDownload={downloadChart}>
        <MemoEChart chartRef={expandedChartRef} option={expandedStatusOption} height="calc(100vh - 190px)" />
      </ExpandedChartDialog>
    </>
  );
};

export default StatusChartSection;
