export type ReportPeriod =
  | "current_batch"
  | "current_week"
  | "current_month"
  | "quarter_to_date"
  | "year_to_date"
  | "launch_to_date";

export type QcSummaryQuery = {
  period?: string;
  workstream?: number | null;
};

export type QcReportSummary = {
  totalChecksExecuted: number;
  checksPassed: number;
  checksFailed: number;
  passRate: number;
};

export type QcSummaryReportRow = {
  workstreamId: number;
  workstream: string;
  checksExecuted: number;
  checksPassed: number;
  checksFailed: number;
  passRate: number;
  recurringIssues: number;
  downstreamImpacted: string[];
};

export type QcSummaryReportTotal = {
  workstream: string;
  checksExecuted: number;
  checksPassed: number;
  checksFailed: number;
  passRate: number;
  recurringIssues: number;
  downstreamImpacted: string[];
};

export type QcSummaryReportResponse = {
  summary: QcReportSummary;
  rows: QcSummaryReportRow[];
  total: QcSummaryReportTotal;
};
