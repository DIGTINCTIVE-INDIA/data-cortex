export type ReportPeriod = "current_batch" | "current_week" | "current_month" | "quarter_to_date" | "year_to_date" | "launch_to_date";

export type QcSummaryQuery = {
	period?: ReportPeriod;
	workstream?: number | null;
};

export type QcSummaryCard = {
	totalChecksExecuted: number;
	checksPassed: number;
	checksFailed: number;
	passRate: number;
};

export type QcSummaryWorkstreamRow = {
	workstreamId: number;
	workstream: string;
	checksExecuted: number;
	checksPassed: number;
	checksFailed: number;
	passRate: number;
	recurringIssues: number;
	downstreamImpacted: string[];
};

export type QcSummaryReport = {
	summary: QcSummaryCard;
	rows: QcSummaryWorkstreamRow[];
	total: Omit<QcSummaryWorkstreamRow, "workstreamId" | "workstream" | "downstreamImpacted"> & {
		workstream: "Total";
		downstreamImpacted: string[];
	};
};
