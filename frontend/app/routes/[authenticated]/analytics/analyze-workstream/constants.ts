export type Option = {
  label: string;
  value: string;
};

export type Period = "daily" | "weekly" | "monthly";

export const periodOptions: Option[] = [
  { label: "LTD", value: "ltd" },
  { label: "Current Batch", value: "current_batch" },
  { label: "Current Week", value: "current_week" },
  { label: "Current Month", value: "current_month" },
  { label: "Quarter To Date", value: "quarter_to_date" },
  { label: "Year To Date", value: "year_to_date" },
  { label: "All Time", value: "launch_to_date" },
];

export const fileTableTypeOptions: Option[] = [
  { label: "All", value: "all" },
  { label: "Files", value: "file" },
  { label: "DB Tables", value: "db" },
];

export const defaultAnalyseWorkstreamUrlParams = {
  workstream: "all",
  data_source: "all",
  downstream: "all",
  category: "all",
  file_table_type: "all",
  file_table_name: "all",
  check_type: "all",
  time_period: "ltd",
};

export type ApiPeriod =
  | "ltd"
  | "current_batch"
  | "current_week"
  | "current_month"
  | "quarter_to_date"
  | "year_to_date"
  | "launch_to_date";

export const COLORS = [
  "var(--primary)",
  "var(--warning)",
  "var(--success)",
  "var(--info)",
  "var(--purple)",
  "var(--error)",
  "var(--teal)",
  "var(--amber)",
];
