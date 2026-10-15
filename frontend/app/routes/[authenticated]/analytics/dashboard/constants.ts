export const defaultDashboardUrlParams = {
  workstream: "all",
  data_source: "all",
  downstream: "all",
  time_period: "launch_to_date",
} as const;

export type ExpandPanelId = "status" | "source" | "issues";
export type SourceChart = "bar" | "treemap";
export type IssueGroupBy = "criticality" | "workstream";
export type IssueChartView = "bar" | "pie" | "table";
export type IssueBucket = "weekly" | "monthly";
