"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, type FC } from "react";
import QcPanel from "./QcPanel";

type criticality = "all" | "high" | "medium" | "low";
export const defaultQcAlertsUrlParams = {
  criticality: "all" as criticality,
  category: "all" as string,
  time_period: "ltd" as string,
  workstream: "all" as string,
  impacted_downstream: "all" as string,
  tab: "open" as "open" | "resolved" | "discarded",
  search: "" as string,
} as const;

const criticalityOptions = [
  { label: "All Criticality", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const periodOptions = [
  {
    label: "LTD",
    value: "ltd",
  },
  {
    label: "Current Week",
    value: "current_week",
  },
  {
    label: "Current Month",
    value: "current_month",
  },
  {
    label: "Quarter To Date",
    value: "quarter_to_date",
  },
  {
    label: "Year To Date",
    value: "year_to_date",
  },
];

const QcAlertsFiltersSection = () => {
  const { setParam, params } = useUrlParams(defaultQcAlertsUrlParams);
  const { criticality, category, impacted_downstream, time_period, workstream } = params;
  const { data, isPending } = useApi("GET /api/libraries/qc-tags/all");

  const categoryOptions = useMemo(() => {
    return [
      {
        label: "All Categories",
        value: "all",
      },

      ...(data?.data.category ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ];
  }, [data?.data.category]);

  const workstreamOptions = useMemo(() => {
    return [
      {
        label: "All Workstreams",
        value: "all",
      },

      ...(data?.data.workstream ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ];
  }, [data?.data.workstream]);

  const downstreamOptions = useMemo(() => {
    return [
      {
        label: "All Downstreams",
        value: "all",
      },

      ...(data?.data.impactedDownstream ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ];
  }, [data?.data.impactedDownstream]);

  if (isPending) {
    return (
      <QcPanel className="p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr]">
          <div className="h-11 w-20 animate-pulse rounded-xl bg-muted" />

          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </QcPanel>
    );
  }

  return (
    <QcPanel className="p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr]">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <HugeiconsIcon icon={FilterIcon} size={18} />
          Filters
        </div>

        <FilterSelect
          label="Criticality"
          value={criticality}
          onChange={v => setParam("criticality", v as criticality)}
          items={criticalityOptions}
        />

        <FilterSelect
          label="Category"
          value={category}
          onChange={v => setParam("category", v)}
          items={categoryOptions}
          isLoading={isPending}
        />

        <FilterSelect
          label="Time Period"
          value={time_period}
          onChange={v => setParam("time_period", v)}
          items={periodOptions}
        />

        <FilterSelect
          label="Workstream"
          value={workstream}
          onChange={v => setParam("workstream", v)}
          items={workstreamOptions}
          isLoading={isPending}
        />

        <div className="lg:col-start-2 lg:col-span-1">
          <FilterSelect
            label="Impacted Downstream"
            value={impacted_downstream}
            onChange={v => setParam("impacted_downstream", v)}
            items={downstreamOptions}
            isLoading={isPending}
          />
        </div>
      </div>
    </QcPanel>
  );
};

export default QcAlertsFiltersSection;

type FilterSelect = {
  label: string;
  value: string;
  items: {
    label: string;
    value: string;
  }[];
  onChange: (value: string) => void;
  isLoading?: boolean;
};

const FilterSelect: FC<FilterSelect> = ({ label, value, items, onChange, isLoading = false }) => {
  return (
    <Select
      value={value}
      onValueChange={value => {
        if (value) {
          onChange(value);
        }
      }}>
      <SelectTrigger isLoading={isLoading} label={label} className="h-11 rounded-2xl bg-background">
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
  );
};
