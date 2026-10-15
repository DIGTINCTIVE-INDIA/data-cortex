export type WorkstreamPeriod =
  | "ltd"
  | "current_batch"
  | "current_week"
  | "current_month"
  | "quarter_to_date"
  | "year_to_date"
  | "launch_to_date";

export type WorkstreamBucket = "daily" | "weekly" | "monthly";

export type WorkstreamBaseQuery = {
  period?: WorkstreamPeriod;
  bucket?: WorkstreamBucket;

  workstream?: number | null;
  dataSource?: number | null;
  impactedDownstream?: number | null;
  category?: number | null;

  checkType?: string | null;
  configType?: "all" | "file" | "db";
  fileOrTableName?: string | null;
};

export type WorkstreamDistinctCheckTypesResponse = string[];

export type WorkstreamDistinctFileTableNamesResponse = {
  fileOrTableName: string;
  configType: "file" | "db";
}[];

export type WorkstreamCheckCardsResponse = {
  checkType: string;
  failed: number;
  total: number;
}[];

export type WorkstreamFailedTrendResponse = {
  label: string;
  bucketStart: string;
  checkType: string;
  failed: number;
}[];

export type WorkstreamFailedChecksTableResponse = {
  qcId: number;
  checkId: string;
  checkType: string;
  source: string;
  workstream: string;
  fileOrTableName: string;
  configId: string;
  configName: string;
  description?: string | null;
  failureReason?: string | null;
  criticality: "low" | "medium" | "high";
  latestStatus: "open" | "resolved" | "discarded";
  runDate: string;
  last10RunStatus: ("passed" | "failed" | "error" | "upstream_failed")[];
}[];
