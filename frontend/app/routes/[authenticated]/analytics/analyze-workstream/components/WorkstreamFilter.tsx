import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useApi } from "@/lib/useApi";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, startTransition, useCallback, useMemo, useState, type FC } from "react";
import {
  defaultAnalyseWorkstreamUrlParams,
  fileTableTypeOptions,
  periodOptions,
  type ApiPeriod,
  type Option,
  type Period,
} from "../constants";
import Panel from "./Panel";

const WorkstreamFilter = () => {
  const [period, setPeriod] = useState<Period>("monthly");
  const { params, setParam } = useUrlParams(defaultAnalyseWorkstreamUrlParams);

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

  const libraries = useApi("GET /api/libraries/qc-tags/all");
  const checkTypesRes = useApi("GET /api/analyse-workstreams/distinct-check-types", {
    query,
  });

  const fileTableNamesRes = useApi("GET /api/analyse-workstreams/distinct-file-table-names", {
    query,
  });

  const libraryData = libraries.data?.data;
  const checkTypes = checkTypesRes.data?.data ?? [];
  const fileTableNames = fileTableNamesRes.data?.data ?? [];

  const updateFilter = useCallback(
    (key: keyof typeof defaultAnalyseWorkstreamUrlParams, value: string) => {
      const scrollY = window.scrollY;

      startTransition(() => {
        setParam(key, value as any);

        if (key === "file_table_type") {
          setParam("file_table_name", "all" as any);
        }
      });

      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    },
    [setParam]
  );

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

  const categoryOptions = useMemo<Option[]>(
    () => [
      { label: "All Categories", value: "all" },
      ...(libraryData?.category ?? []).map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ],
    [libraryData]
  );

  const checkTypeOptions = useMemo<Option[]>(
    () => [
      { label: "All Check Types", value: "all" },
      ...checkTypes.map((item: string) => ({
        label: item,
        value: item,
      })),
    ],
    [checkTypes]
  );

  const fileTableOptions = useMemo<Option[]>(
    () => [
      { label: "All Files / Tables", value: "all" },
      ...fileTableNames.map((item: any) => ({
        label: `${item.fileOrTableName} (${item.configType})`,
        value: item.fileOrTableName,
      })),
    ],
    [fileTableNames]
  );

  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
        <HugeiconsIcon icon={FilterIcon} size={18} />
        Filters
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          label="Workstream"
          value={params.workstream}
          onChange={v => updateFilter("workstream", v)}
          items={workstreamOptions}
        />

        <FilterSelect
          label="Source"
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
          label="Category"
          value={params.category}
          onChange={v => updateFilter("category", v)}
          items={categoryOptions}
        />

        <FilterSelect
          label="File/Table Type"
          value={params.file_table_type}
          onChange={v => updateFilter("file_table_type", v)}
          items={fileTableTypeOptions}
        />

        <FilterSelect
          label="File or Table"
          value={params.file_table_name}
          onChange={v => updateFilter("file_table_name", v)}
          items={fileTableOptions}
        />

        <FilterSelect
          label="Check Type"
          value={params.check_type}
          onChange={v => updateFilter("check_type", v)}
          items={checkTypeOptions}
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

export default WorkstreamFilter;

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
        <SelectItem key={`${item.value}-${item.label}`} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
));
