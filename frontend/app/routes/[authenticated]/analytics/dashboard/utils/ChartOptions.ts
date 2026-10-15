import type {
  CriticalityTrendRow,
  DashboardIssuesBySourceResponse,
  DashboardIssuesStatusResponse,
  DashboardIssuesTrendResponse,
  WorkstreamTrendRow,
} from "@/lib/useApi/types/dashboardApis.types";
import type { useChartTheme } from "../hooks/useChartTheme";
import {
  axisCategory,
  axisValue,
  categoryDataZoom,
  compactNumber,
  getGridBottom,
  legend,
  paletteColors,
  tooltip,
} from "./ChartHelpers";

type SourceChart = "bar" | "treemap";
type IssueGroupBy = "criticality" | "workstream";
type IssueChartView = "bar" | "pie" | "table";
type IssueBucket = "weekly" | "monthly";
type ExpandPanelId = "status" | "source" | "issues";

type ChartMode = {
  expanded?: boolean;
  enableZoom?: boolean;
};

export function buildStatusOption(
  rows: DashboardIssuesStatusResponse,
  c: ReturnType<typeof useChartTheme>,
  mode: ChartMode = {}
) {
  const labels = rows.map(r => r.label);
  const expanded = Boolean(mode.expanded);

  return {
    backgroundColor: "transparent",
    animation: !expanded,
    color: [c.success, c.warning, c.mutedForeground],
    tooltip: tooltip(c),
    legend: legend(c),
    grid: {
      left: expanded ? 64 : 15,
      right: 15,
      top: 24,
      bottom: getGridBottom(labels.length, mode),
      containLabel: true,
    },
    dataZoom: categoryDataZoom(labels.length, c, mode),
    xAxis: axisCategory(labels, c, mode),
    yAxis: axisValue(c),
    series: [
      {
        name: "Resolved",
        type: "bar",
        stack: "status",
        data: rows.map(r => Number(r.resolved ?? 0)),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: { color: c.success, borderRadius: [0, 0, 8, 8] },
      },
      {
        name: "Open",
        type: "bar",
        stack: "status",
        data: rows.map(r => Number(r.open ?? 0)),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: { color: c.warning },
      },
      {
        name: "Discarded",
        type: "bar",
        stack: "status",
        data: rows.map(r => Number(r.discarded ?? 0)),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: { color: c.mutedForeground, borderRadius: [8, 8, 0, 0] },
      },
    ],
  };
}

export function buildSourceOption(
  rows: DashboardIssuesBySourceResponse,
  view: SourceChart,
  c: ReturnType<typeof useChartTheme>,
  mode: ChartMode = {}
) {
  const palette = paletteColors(c);
  const expanded = Boolean(mode.expanded);

  if (view === "treemap") {
    return {
      backgroundColor: "transparent",
      animation: !expanded,
      tooltip: tooltip(c, "item"),
      series: [
        {
          type: "treemap",
          left: expanded ? 18 : 10,
          right: expanded ? 18 : 10,
          top: expanded ? 18 : 10,
          bottom: expanded ? 18 : 10,
          roam: expanded && mode.enableZoom,
          nodeClick: false,
          breadcrumb: { show: false },
          squareRatio: 1.15,
          visibleMin: 1,
          label: {
            show: true,
            color: c.primaryForeground,
            fontWeight: 800,
            fontSize: expanded ? 16 : 12,
            lineHeight: expanded ? 20 : 15,
            overflow: "truncate",
            ellipsis: "…",
            formatter: (params: any) => {
              const name = String(params.name ?? "");
              const value = Number(params.value ?? 0).toLocaleString();
              return `${name}\n${value}`;
            },
          },
          upperLabel: { show: false },
          itemStyle: {
            borderColor: c.card,
            borderWidth: expanded ? 6 : 4,
            borderRadius: 14,
            gapWidth: expanded ? 6 : 4,
          },
          data: rows.map((row, index) => ({
            name: row.source,
            value: Number(row.totalIssues ?? 0),
            itemStyle: { color: palette[index % palette.length] },
          })),
        },
      ],
    };
  }

  return {
    backgroundColor: "transparent",
    animation: !expanded,
    tooltip: tooltip(c),
    grid: {
      left: 15,
      right: 15,
      top: 16,
      bottom: 38,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      splitNumber: 4,
      min: 0,
      splitLine: { lineStyle: { color: c.border, type: "dashed" } },
      axisLabel: {
        color: c.mutedForeground,
        fontSize: 12,
        formatter: (value: number) => compactNumber(value),
        hideOverlap: true,
        margin: 8,
      },
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: rows.map(row => row.source),
      axisLabel: {
        color: c.mutedForeground,
        fontSize: expanded ? 13 : 12,
        width: 78,
        overflow: "truncate",
      },
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: rows.map((row, index) => ({
          value: Number(row.totalIssues ?? 0),
          itemStyle: { color: palette[index % palette.length], borderRadius: [0, 9, 9, 0] },
        })),
        barMaxWidth: expanded ? 30 : 22,
      },
    ],
  };
}

export function buildQualityIssuesOption(
  rows: DashboardIssuesTrendResponse,
  groupBy: IssueGroupBy,
  view: IssueChartView,
  c: ReturnType<typeof useChartTheme>,
  mode: ChartMode = {}
) {
  const palette = paletteColors(c);
  const expanded = Boolean(mode.expanded);

  if (view === "pie") {
    if (groupBy === "workstream") {
      const workstreamRows = rows as WorkstreamTrendRow[];
      const map = new Map<string, number>();
      workstreamRows.forEach(row =>
        map.set(row.workstream, (map.get(row.workstream) ?? 0) + Number(row.totalIssues ?? 0))
      );

      return {
        backgroundColor: "transparent",
        animation: !expanded,
        tooltip: tooltip(c, "item"),
        legend: legend(c),
        series: [
          {
            type: "pie",
            radius: expanded ? ["48%", "74%"] : ["52%", "76%"],
            center: ["50%", "45%"],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: c.card, borderWidth: expanded ? 6 : 4, borderRadius: 10 },
            label: { color: c.foreground, formatter: "{b}" },
            data: [...map.entries()].map(([name, value], index) => ({
              name,
              value,
              itemStyle: { color: palette[index % palette.length] },
            })),
          },
        ],
      };
    }

    const criticalityRows = rows as CriticalityTrendRow[];

    const total = criticalityRows.reduce(
      (acc, row) => {
        acc.high += Number(row.high ?? 0);
        acc.medium += Number(row.medium ?? 0);
        acc.low += Number(row.low ?? 0);
        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );

    return {
      backgroundColor: "transparent",
      animation: !expanded,
      tooltip: tooltip(c, "item"),
      legend: legend(c),
      series: [
        {
          type: "pie",
          radius: expanded ? ["48%", "74%"] : ["52%", "76%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: c.card, borderWidth: expanded ? 6 : 4, borderRadius: 10 },
          label: { color: c.foreground, formatter: "{b}: {c}" },
          data: [
            { name: "High", value: total.high, itemStyle: { color: c.warning } },
            { name: "Medium", value: total.medium, itemStyle: { color: c.purple } },
            { name: "Low", value: total.low, itemStyle: { color: c.success } },
          ],
        },
      ],
    };
  }

  if (groupBy === "workstream") {
    const workstreamRows = rows as WorkstreamTrendRow[];

    const labels = [...new Set(workstreamRows.map(row => row.label))];

    const workstreams = [...new Set(workstreamRows.map(row => row.workstream))];

    return {
      backgroundColor: "transparent",
      animation: !expanded,
      tooltip: tooltip(c),
      legend: legend(c),
      grid: {
        left: expanded ? 64 : 52,
        right: 22,
        top: 28,
        bottom: getGridBottom(labels.length, mode),
        containLabel: true,
      },
      dataZoom: categoryDataZoom(labels.length, c, mode),
      xAxis: axisCategory(labels, c, mode),
      yAxis: axisValue(c),
      series: workstreams.map((ws, index) => ({
        name: ws,
        type: "bar",
        stack: "total",
        data: labels.map(
          label => workstreamRows.find(row => row.label === label && row.workstream === ws)?.totalIssues ?? 0
        ),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: {
          color: palette[index % palette.length],
          borderRadius: index === workstreams.length - 1 ? [8, 8, 0, 0] : 0,
        },
      })),
    };
  }

  const criticalityRows = rows as CriticalityTrendRow[];

  const labels = criticalityRows.map(row => row.label);

  return {
    backgroundColor: "transparent",
    animation: !expanded,
    tooltip: tooltip(c),
    legend: legend(c),
    grid: {
      left: expanded ? 64 : 52,
      right: 22,
      top: 28,
      bottom: getGridBottom(labels.length, mode),
      containLabel: true,
    },
    dataZoom: categoryDataZoom(labels.length, c, mode),
    xAxis: axisCategory(labels, c, mode),
    yAxis: axisValue(c),
    series: [
      {
        name: "High",
        type: "bar",
        stack: "total",
        data: criticalityRows.map(row => row.high),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: { color: c.warning },
      },
      {
        name: "Medium",
        type: "bar",
        stack: "total",
        data: criticalityRows.map(row => row.medium),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: { color: c.purple },
      },
      {
        name: "Low",
        type: "bar",
        stack: "total",
        data: criticalityRows.map(row => row.low),
        barMaxWidth: expanded ? 34 : 28,
        itemStyle: { color: c.success, borderRadius: [8, 8, 0, 0] },
      },
    ],
  };
}
