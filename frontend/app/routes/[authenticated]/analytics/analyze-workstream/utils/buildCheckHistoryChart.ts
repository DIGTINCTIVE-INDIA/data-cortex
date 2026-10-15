import type { EChartsOption } from "echarts";

type HistoryItem = {
  date: string;
  passed: number;
  failed: number;
};

type View = "last10" | "last20" | "weekly" | "monthly";

type BuildCheckHistoryChartProps = {
  history: HistoryItem[];
  view: View;
  colors: {
    success: string;
    destructive: string;
  };
};

export default function buildCheckHistoryChart({ history, view, colors }: BuildCheckHistoryChartProps): EChartsOption {
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
    },

    legend: {
      show: false,
    },

    grid: {
      left: 45,
      right: 20,
      top: 20,
      bottom: 60,
      containLabel: true,
    },

    xAxis: {
      type: "category",

      //   data: history.map(h =>
      //     new Date(h.date).toLocaleDateString("en-IN", {
      //       day: "2-digit",
      //       month: "short",
      //     })
      //   ),

      data: history.map(h => {
        const date = new Date(h.date);

        if (view === "monthly") {
          return date.toLocaleDateString("en-IN", {
            month: "short",
            year: "2-digit",
          });
        }

        if (view === "weekly") {
          return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
          });
        }

        return date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        });
      }),

      axisLabel: {
        rotate: 45,
        // fontSize: 11,
      },
    },

    yAxis: {
      type: "value",
    },

    series: [
      {
        name: "Passed",

        type: "bar",

        stack: "runs",

        data: history.map(h => h.passed),

        itemStyle: {
          color: colors.success,
          borderRadius: [4, 4, 0, 0],
        },
      },

      {
        name: "Failed",

        type: "bar",

        stack: "runs",

        data: history.map(h => h.failed),

        itemStyle: {
          color: colors.destructive,
        },
      },
    ],
  };
}
