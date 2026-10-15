import type { ReportPeriod } from "./reportsApis.types";

export type DashboardBaseQuery = {
  period?: ReportPeriod;
  workstream?: number | null;
  dataSource?: number | null;
  impactedDownstream?: number | null;
};

export type DashboardIssuesTrendQuery = DashboardBaseQuery & {
  bucket?: "weekly" | "monthly";
  groupBy?: "criticality" | "workstream";
};

export type DashboardSummaryResponse = {
  totalChecksExecuted: number;
  checksPassed: number;
  checksFailed: number;
  passRate: number;
  totalIssues: number;
  openIssues: number;
  resolvedIssues: number;
  discardedIssues: number;
  criticality: {
    high: number;
    medium: number;
    low: number;
  };
};

export type DashboardIssuesStatusResponse = {
  label: string;
  open: number;
  resolved: number;
  discarded: number;
}[];

export type DashboardIssuesBySourceResponse = {
  sourceId: number;
  source: string;
  totalIssues: number;
  high: number;
  medium: number;
  low: number;
}[];

export type WorkstreamTrendRow = {
  label: string;
  bucketStart: string;
  workstream: string;
  totalIssues: number;
};

export type CriticalityTrendRow = {
  label: string;
  bucketStart: string;
  high: number;
  medium: number;
  low: number;
};
export type DashboardIssuesTrendResponse = WorkstreamTrendRow[] | CriticalityTrendRow[];

export type DashboardIssuesTableResponse = {
  workstreamId: number;
  workstream: string;
  totalChecks: number;
  totalIssues: number;
  high: number;
  medium: number;
  low: number;
}[];

export type QcAlertsQuery = {
  page?: number;
  limit?: number;
  search?: string;
  criticality?: "low" | "medium" | "high";
  status?: "all" | "open" | "resolved" | "discarded";
  category?: number;
  period?: "ltd" | "current_week" | "current_month" | "quarter_to_date" | "year_to_date";
  workstream?: number;
  impactedDownstream?: number;
};

export type QcAlertRow = {
  id: number;
  checkId: string;
  title: string;
  description?: string | null;
  criticality: "low" | "medium" | "high";
  issueStatus: "open" | "resolved" | "discarded";
  category: string;
  workstream: string;
  source: string;
  jobTimestamp: string;
  failureReason?: string | null;
};

export type QcAlertsSummaryResponse = {
  summary: {
    totalQcAlerts: number;
    open: number;
    resolved: number;
    discarded: number;
  };
  criticalitySummary: {
    totalIssues: number;
    high: number;
    medium: number;
    low: number;
  };
};
