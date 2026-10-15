export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobCheckCounts = {
  passed: number;
  failed: number;
  error: number;
  upstream_failed: number;
};

export type JobStartedBy = { id: string; fullName: string; role: "admin" | "engineer" | "analyst" | "service" };

export type JobItem = {
  runId: string;
  configId: string;
  configName: string | null;
  source: "db" | "file" | "custom-sql";
  status: JobStatus;
  engineState: string | null;
  /** The engine's overall result: a criticality, or "FAIL". Null until it finishes. */
  jobStatus: string | null;
  /** Why the job itself failed -- not why a check did. */
  error: string | null;
  submittedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: JobStartedBy | null;
  /** For runs started with an API key: "name (dck_prefix)". Null for a person. */
  startedWithKey?: string | null;
  checks: JobCheckCounts;
};

export type JobCheckResult = {
  checkExecutionId: number;
  checkId: string;
  checkName: string;
  field: string | null;
  checkStatus: "passed" | "failed" | "error" | "upstream_failed";
  criticality: "low" | "medium" | "high" | null;
  issueRows: string;
  passedRows: string;
  failureReason: string | null;
  issueStatus: "open" | "resolved" | "discarded" | null;
};

export type JobDetail = JobItem & { results: JobCheckResult[] };
