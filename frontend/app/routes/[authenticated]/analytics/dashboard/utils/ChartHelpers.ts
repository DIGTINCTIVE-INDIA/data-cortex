import type { useChartTheme } from "../hooks/useChartTheme";

type ChartMode = {
  expanded?: boolean;
  enableZoom?: boolean;
};

export function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function categoryDataZoom(length: number, c: ReturnType<typeof useChartTheme>, mode: ChartMode = {}) {
  if (!mode.expanded || !mode.enableZoom) return [];
  if (length <= 10) return [];

  const visibleItems = 20;
  const start = Math.max(0, 100 - (visibleItems / length) * 100);

  return [
    {
      type: "inside",
      start,
      end: 100,
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: true,
    },
    {
      type: "slider",
      start,
      end: 100,
      height: 22,
      bottom: 14,
      borderColor: c.border,
      fillerColor: c.primary,
      backgroundColor: c.muted,
      handleStyle: { color: c.primary, borderColor: c.primary },
      textStyle: { color: c.mutedForeground },
    },
  ];
}

export function getGridBottom(length: number, mode: ChartMode = {}) {
  if (!mode.expanded || !mode.enableZoom || length <= 10) return 64;
  return 104;
}

export function axisCategory(data: any[], c: ReturnType<typeof useChartTheme>, mode: ChartMode = {}) {
  const expanded = Boolean(mode.expanded);

  return {
    type: "category",
    data,
    axisLabel: {
      color: c.mutedForeground,
      fontSize: expanded ? 13 : 12,
      rotate: data.length > (expanded ? 18 : 8) ? 28 : 0,
      formatter: (value: string) => {
        if (!value) return "";
        return String(value)
          .replace(/ • /g, "\n")
          .replace(/ (\d{4})$/, "\n$1");
      },
    },
    axisLine: { lineStyle: { color: c.border } },
    axisTick: { show: false },
  };
}

export function axisValue(c: ReturnType<typeof useChartTheme>) {
  return {
    type: "value",
    splitLine: { lineStyle: { color: c.border, type: "dashed" } },
    axisLabel: { color: c.mutedForeground, fontSize: 12 },
    axisLine: { lineStyle: { color: c.border } },
  };
}

export function legend(c: ReturnType<typeof useChartTheme>) {
  return {
    bottom: 0,
    icon: "roundRect",
    itemWidth: 14,
    itemHeight: 10,
    textStyle: { color: c.mutedForeground, fontSize: 12 },
  };
}

export function tooltip(c: ReturnType<typeof useChartTheme>, trigger: "axis" | "item" = "axis") {
  return {
    trigger,
    backgroundColor: c.card,
    borderColor: c.border,
    textStyle: { color: c.foreground },
  };
}

export function paletteColors(c: ReturnType<typeof useChartTheme>) {
  return [c.info, c.success, c.warning, c.purple, c.teal, c.amber, c.primary, c.indigo, c.pink];
}
