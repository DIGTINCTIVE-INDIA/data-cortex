export type QcAlertsQuery = {
  search?: string;
  criticality?: "low" | "medium" | "high";
  status?: "all" | "open" | "resolved" | "discarded";
  category?: number;
  period?: "ltd" | "current_week" | "current_month" | "quarter_to_date" | "year_to_date";

  workstream?: number;
  impactedDownstream?: number;
};

export type QcAlertItems = {
  id: number;
  checkId: string;
  title: string;
  description: string;
  configId: string;
  configName: string;
  jobId: string;
  jobTimestamp: string;
  fileOrTableName: string;
  checkType: string;
  field: string;
  abort: boolean;
  checkStatus: "passed" | "failed" | "error" | "upstream_failed";
  criticality: "high" | "medium" | "low";
  issueStatus: "open" | "resolved" | "discarded";
  /** Why a person discarded it. Null for open/resolved alerts. */
  issueStatusReason: string | null;
  recordsAffected: string;
  passedRows: string;
  failureReason: string;
  category: string;
  workstream: string;
  source: string;
  impactedDownstream: string[];
};

export type QCSummary = {
  summary: QcAlertsSummary;
  criticalitySummary: QcCriticalitySummary;
};

export type QcAlertsSummary = {
  totalQcAlerts: number;
  open: number;
  resolved: number;
  discarded: number;
};

type QcCriticalitySummary = {
  totalIssues: number;
  high: number;
  medium: number;
  low: number;
};

export type UpdateQcAlertMutationBody = {
  status: "resolved" | "discarded";
  /** Required by the server when discarding; ignored when resolving. */
  reason?: string;
};
