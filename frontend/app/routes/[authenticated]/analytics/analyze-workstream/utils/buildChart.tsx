
import type { Period } from "../constants";

type BuildChartProps = {
  trend: any[];
  colors: string[];
  period: Period;
  expanded: boolean;
  zoomEnabled: boolean;
};

const buildChart = ({ trend, colors, period, expanded, zoomEnabled }: BuildChartProps) => {

  const labels = Array.from(new Set(trend.map((item: any) => item.label)));
  const chartCheckTypes = Array.from(new Set(trend.map((item: any) => item.checkType)));

  return {
    color: colors,

    tooltip: {
      trigger: "axis",
    },

    legend: {
      bottom: 0,
      type: "scroll",
      textStyle: {
        color: "var(--muted-foreground)",
      },
    },

    grid: expanded
      ? {
          left: 60,
          right: 40,
          top: 30,
          bottom: 90,
        }
      : {
          left: 42,
          right: 24,
          top: 24,
          bottom: 58,
        },

    xAxis: {
      type: "category",
      data: labels,
      

      axisLine: {
        lineStyle: {
          color: "var(--border)",
        },
      },

      axisLabel: {
        color: "var(--muted-foreground)",
        interval:  "auto",
      },
    },

    yAxis: {
      type: "value",

      splitLine: {
        lineStyle: {
          color: "var(--border)",
          type: "dashed",
        },
      },

      axisLabel: {
        color: "var(--muted-foreground)",
      },
    },

    dataZoom:
      expanded && zoomEnabled
        ? [
            {
              type: "inside",
            },
            {
              type: "slider",
            },
          ]
        : [],

    series: chartCheckTypes.map((type: any, index) => ({
      name: type,
      type: "bar",

      stack: "failed",

      barWidth: expanded ? (period === "monthly" ? 30 : 7) : period === "monthly" ? 28 : 5,

      itemStyle: {
        color: colors[index],

        // borderColor: "#fff",

        // borderWidth: 1,

        ...(index === chartCheckTypes.length - 1 && {
          borderRadius: [8, 8, 0, 0],
        }),
      },

      data: labels.map(label => {
        const item = trend.find((i: any) => i.label === label && i.checkType === type);

        return item?.failed ?? 0;
      }),
    })),
  };
};

export default buildChart;
