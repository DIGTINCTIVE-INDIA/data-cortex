import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ReactECharts from "echarts-for-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChartTheme } from "../../dashboard/hooks/useChartTheme";
import { downloadEChartAsReportPng, formatExportDate } from "../../dashboard/utils/exportUtils";
import { defaultAnalyseWorkstreamUrlParams, type ApiPeriod, type Period } from "../constants";

import { ChartActions, ChartCard, MemoEChart } from "../../dashboard/components/Chart";
import ExpandedChartDialog from "../../dashboard/components/ExpandedChartDialog";
import { EmptyState } from "./EmptyState";
import Panel from "./Panel";
import { SkeletonCard } from "./WorkstreamSkeleton";
import buildChart from "../utils/buildChart";

const CardCheck = () => {
  const c = useChartTheme();
  const [period, setPeriod] = useState<Period>("monthly");
  const { params, setParam } = useUrlParams(defaultAnalyseWorkstreamUrlParams);

  const chartRef = useRef<ReactECharts>(null);
  const expandedChartRef = useRef<ReactECharts>(null);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);

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
    downloadEChartAsReportPng(expandedOpen ? expandedChartRef : chartRef, "analyze-workstream", c, {
      title: "Failed QC by Issue Type",
      subtitle: "Current filters",
      footer: `DataCortex • Exported ${formatExportDate(new Date())}`,
    });
  }, [expandedOpen, c]);

  const query = useMemo(
    () => ({
      period: params.time_period as ApiPeriod,
      bucket: period,

      workstream: params.workstream === "all" ? undefined : Number(params.workstream),
      dataSource: params.data_source === "all" ? undefined : Number(params.data_source),
      impactedDownstream: params.downstream === "all" ? undefined : Number(params.downstream),
      category: params.category === "all" ? undefined : Number(params.category),

      configType: params.file_table_type as "all" | "file" | "db",
      fileOrTableName: params.file_table_name === "all" ? undefined : params.file_table_name,
      checkType: params.check_type === "all" ? undefined : params.check_type,
    }),
    [params, period]
  );

  const cardsRes = useApi("GET /api/analyse-workstreams/check-cards", {
    query,
  });
  const trendRes = useApi("GET /api/analyse-workstreams/failed-trend", {
    query,
  });
  const libraries = useApi("GET /api/libraries/qc-tags/all");

  const cards = cardsRes.data?.data ?? [];
  const trend = trendRes.data?.data ?? [];

  const colors = useMemo(
    () => [c.primary, c.warning, c.success, c.info, c.purple, c.destructive, c.teal, c.amber],
    [c]
  );

  const chart = useMemo(
    () =>
      buildChart({
        trend,
        colors,
        period,
        expanded: false,
        zoomEnabled: false,
      }),
    [trend, colors, period]
  );
  const expandedChart = useMemo(
    () =>
      buildChart({
        trend,
        colors,
        period,
        expanded: true,
        zoomEnabled,
      }),
    [trend, colors, period, zoomEnabled]
  );

  return (
    <>
      <Panel className="space-y-6 p-5">
        <InfoBox />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cardsRes.isLoading || libraries.isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          ) : cards.length ? (
            cards.map((card: any, index: number) => (
              <motion.div
                key={card.checkType}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.035 }}
                whileHover={{ y: -3 }}
                className="rounded-2xl bg-muted/35 p-2">
                <div className="rounded-xl bg-background p-5 text-center shadow-soft ring-1 ring-border/60">
                  <p className="text-sm text-muted-foreground">{card.checkType}</p>
                  <p className="mt-3 text-2xl font-semibold text-primary">
                    {card.failed}/{card.total}
                  </p>
                </div>
              </motion.div>
            ))
          ) : (
            <EmptyState text="No check summary found." />
          )}
        </div>
      </Panel>

      <ChartCard
        title="Failed QC by Issue Type"
        action={
          <AnimatedTabs
            value={period}
            onValueChange={v => setPeriod(v as Period)}
            tabs={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        }
        tools={<ChartActions onExpand={() => setExpandedOpen(true)} onDownload={downloadChart} />}>
        {trendRes.isLoading ? (
          <div className="h-[390px] animate-pulse rounded-2xl bg-muted/40" />
        ) : (
          <MemoEChart chartRef={chartRef} option={chart} height={390} />
        )}
      </ChartCard>

      <ExpandedChartDialog
        open={expandedOpen}
        title="Failed QC by Issue Type"
        zoomEnabled={zoomEnabled}
        showZoomToggle
        onZoomChange={setZoomEnabled}
        onClose={() => setExpandedOpen(false)}
        onDownload={downloadChart}>
        <MemoEChart chartRef={expandedChartRef} option={expandedChart} height="calc(100vh - 190px)" />
      </ExpandedChartDialog>
    </>
  );
};

export default CardCheck;

function InfoBox() {
  return (
    <div className="rounded-2xl bg-muted/35 px-4 py-3 text-xs text-muted-foreground ring-1 ring-border/50">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={InformationCircleIcon} size={16} />
        <span>
          <b className="text-foreground">How to read:</b> Each card shows <b>Failed Count / Total Executions</b>.
        </span>
      </div>
    </div>
  );
}
