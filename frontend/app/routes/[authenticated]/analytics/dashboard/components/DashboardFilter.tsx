import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, startTransition, useCallback, useMemo, type FC } from "react";
import type { ReportPeriod } from "@/lib/useApi/types/reportsApis.types";
import { defaultDashboardUrlParams } from "../constants";
import Panel from "./Panel";

const periodOptions: { label: string; value: ReportPeriod }[] = [
  { label: "Current Batch", value: "current_batch" },
  { label: "Current Week", value: "current_week" },
  { label: "Current Month", value: "current_month" },
  { label: "Quarter To Date", value: "quarter_to_date" },
  { label: "Year To Date", value: "year_to_date" },
  { label: "All Time", value: "launch_to_date" },
];

type Option = {
  label: string;
  value: string;
};

const DashboardFilter = () => {
  const { params, setParam } = useUrlParams(defaultDashboardUrlParams);
  const libraries = useApi("GET /api/libraries/qc-tags/all");

  const updateFilter = useCallback(
    (key: keyof typeof defaultDashboardUrlParams, value: string) => {
      const scrollY = window.scrollY;

      startTransition(() => {
        setParam(key, value as any);
      });

      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollY,
          behavior: "auto",
        });
      });
    },
    [setParam]
  );

  const libraryData = libraries.data?.data;

  const workstreamOptions = useMemo<Option[]>(
    () => [
      { label: "All Workstreams", value: "all" },
      ...(libraryData?.workstream ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ],
    [libraryData]
  );

  const dataSourceOptions = useMemo<Option[]>(
    () => [
      { label: "All Sources", value: "all" },
      ...(libraryData?.dataSource ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ],
    [libraryData]
  );

  const downstreamOptions = useMemo<Option[]>(
    () => [
      { label: "All Downstreams", value: "all" },
      ...(libraryData?.impactedDownstream ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ],
    [libraryData]
  );

  return (
    <Panel className="p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr_1fr_1fr_1fr] md:items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <HugeiconsIcon icon={FilterIcon} size={18} />
          Filters
        </div>

        <FilterSelect
          label="Workstream"
          value={params.workstream}
          onChange={v => updateFilter("workstream", v)}
          items={workstreamOptions}
        />
        <FilterSelect
          label="Data Source"
          value={params.data_source}
          onChange={v => updateFilter("data_source", v)}
          items={dataSourceOptions}
        />
        <FilterSelect
          label="Downstream"
          value={params.downstream}
          onChange={v => updateFilter("downstream", v)}
          items={downstreamOptions}
        />
        <FilterSelect
          label="Time Period"
          value={params.time_period}
          onChange={v => updateFilter("time_period", v)}
          items={periodOptions}
        />
      </div>
    </Panel>
  );
};

export default DashboardFilter;

type FilterSelectProps = {
  label: string;
  value: string;
  items: { label: string; value: string }[];
  onChange: (value: string) => void;
};

const FilterSelect: FC<FilterSelectProps> = memo(({ label, value, items, onChange }) => (
  <Select value={value} onValueChange={v => v && onChange(v)}>
    <SelectTrigger label={label} className="h-11 rounded-2xl bg-background">
      <SelectValue>{items.find(item => item.value === value)?.label}</SelectValue>
    </SelectTrigger>

    <SelectContent>
      {items.map(item => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
));
