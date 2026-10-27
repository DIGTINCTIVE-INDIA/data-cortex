export type JobStatus = "held" | "queued" | "running" | "completed" | "failed";

export type JobCheckCounts = {
  passed: number;
  failed: number;
  error: number;
  upstream_failed: number;
};

/**
 * What the run did to the data, separate from how many checks it ran. `failed` is how many
 * DIFFERENT rows failed at least one check. All null when the rows were not evaluated, and for
 * runs from before rows were recorded.
 */
export type JobRows = { total: number | null; failed: number | null; clean: number | null };

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
  /** Why the job itself failed -- not why a check did. The plain reason, or the raw error when no known cause matched. */
  error: string | null;
  /** For a held run: how many hand-overs to the engine were tried, and why the last one did not go through. */
  dispatchAttempts?: number;
  lastDispatchError?: string | null;
  /** Short plain name of that failure, e.g. "Storage bucket not found". Null for runs from before it was recorded. */
  errorTitle: string | null;
  /** The raw exception and traceback, for developers. Null for runs from before it was recorded. */
  errorDetail: string | null;
  submittedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: JobStartedBy | null;
  /** For runs started with an API key: "name (dck_prefix)". Null for a person. */
  startedWithKey?: string | null;
  checks: JobCheckCounts;
  rows: JobRows;
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
