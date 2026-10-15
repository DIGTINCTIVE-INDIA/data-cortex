import { Button } from "@/components/ui/button";
import ReactECharts from "echarts-for-react";
import { memo, type ReactNode } from "react";
import { DownloadIcon, ExpandIcon } from "./Icon";
import Panel from "./Panel";

type ChartCardProps = {
  title: string;
  action?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
};

export const ChartCard = memo(({ title, action, tools, children }: ChartCardProps) => {
  return (
    <Panel className="p-5">
      <div className="mb-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
          {tools && <div className="shrink-0">{tools}</div>}
        </div>

        {action && <div className="flex flex-wrap items-center  gap-2">{action}</div>}
      </div>

      {children}
    </Panel>
  );
});

type ChartActionsProps = {
  onExpand: () => void;
  onDownload: () => void;
};

export const ChartActions = memo(({ onExpand, onDownload }: ChartActionsProps) => {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-muted/45 p-1 ring-1 ring-border/60">
      <ChartIconButton tooltip="Expand chart" onClick={onExpand}>
        <ExpandIcon />
      </ChartIconButton>

      <ChartIconButton tooltip="Download PNG" onClick={onDownload}>
        <DownloadIcon />
      </ChartIconButton>
    </div>
  );
});

type ChartIconButtonProps = {
  tooltip: string;
  onClick: () => void;
  children: ReactNode;
};

const ChartIconButton = ({ tooltip, onClick, children }: ChartIconButtonProps) => {
  return (
    <div className="group relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title={tooltip}
        aria-label={tooltip}
        className="h-8 w-8 rounded-xl p-0 text-muted-foreground hover:bg-background hover:text-primary"
        onClick={onClick}>
        {children}
      </Button>

      <div className="pointer-events-none absolute right-0 top-10 z-20 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-lg ring-1 ring-border transition group-hover:opacity-100">
        {tooltip}
      </div>
    </div>
  );
};

type MemoEChartProps = {
  chartRef?: React.RefObject<ReactECharts | null>;
  option: any;
  height: number | string;
};

export const MemoEChart = memo(({ chartRef, option, height }: MemoEChartProps) => {
  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      notMerge
      lazyUpdate
      opts={{ renderer: "canvas" }}
      style={{ height, width: "100%" }}
    />
  );
});
