import { and, count, db, desc, eq, gte, inArray, qcTagsLibrary, results, sql } from "@repo/db";

type DashboardPeriod = "current_batch" | "current_week" | "current_month" | "quarter_to_date" | "year_to_date" | "launch_to_date";

type DashboardBaseQuery = {
	period?: DashboardPeriod;
	workstream?: number | null;
	dataSource?: number | null;
	impactedDownstream?: number | null;
};

type DashboardTrendQuery = DashboardBaseQuery & {
	bucket?: "weekly" | "monthly";
	groupBy?: "criticality" | "workstream";
};

const buildDashboardFilters = (query: DashboardBaseQuery) => {
	const filters = [];

	if (query.workstream) filters.push(eq(results.workstream, query.workstream));
	if (query.dataSource) filters.push(eq(results.dataSource, query.dataSource));

	if (query.impactedDownstream) {
		filters.push(sql`${query.impactedDownstream} = ANY(${results.impactedDownstream})`);
	}

	if (query.period === "current_batch") {
		filters.push(sql`${results.jobTimestamp} = (SELECT MAX(${results.jobTimestamp}) FROM ${results})`);
	}

	if (query.period === "current_week") {
		filters.push(gte(results.jobTimestamp, sql`date_trunc('week', now() AT TIME ZONE 'UTC')`));
	}

	if (query.period === "current_month") {
		filters.push(gte(results.jobTimestamp, sql`date_trunc('month', now() AT TIME ZONE 'UTC')`));
	}
	if (query.period === "quarter_to_date") {
		filters.push(gte(results.jobTimestamp, sql`date_trunc('quarter', now() AT TIME ZONE 'UTC')`));
	}
	if (query.period === "year_to_date") {
		filters.push(gte(results.jobTimestamp, sql`date_trunc('year', now() AT TIME ZONE 'UTC')`));
	}

	// launch_to_date means all time, so no date filter.

	return filters.length ? and(...filters) : undefined;
};

/**
 * The period drives CASE branches inside the SQL, so it cannot be absent.
 *
 * The validator marks it optional, which meant a request without one rendered
 * `WHEN  = 'current_batch'` and failed with a bare "syntax error at or near =".
 * Defaulting here keeps the endpoint answering instead of 500-ing, and matches
 * what the filter shows when nothing is chosen.
 */
const periodOf = (query: { period?: string | null }) => query.period ?? "current_month";

export class DashboardRepo {
	constructor() {}

	async getDashboardSummary(query: DashboardBaseQuery) {
		const whereClause = buildDashboardFilters(query);

		const [row] = await db
			.select({
				totalChecksExecuted: count(),
				checksPassed: count(sql`CASE WHEN ${results.checkStatus} = 'passed' THEN 1 END`),
				checksFailed: count(sql`CASE WHEN ${results.checkStatus} = 'failed' THEN 1 END`),
				openIssues: count(
					sql`CASE 
						WHEN ${results.checkStatus} = 'failed'
						AND COALESCE(${results.issueStatus}, 'open') = 'open'
						THEN 1 
					END`,
				),
				resolvedIssues: count(
					sql`CASE 
						WHEN ${results.checkStatus} = 'failed'
						AND ${results.issueStatus} = 'resolved'
						THEN 1 
					END`,
				),
				discardedIssues: count(
					sql`CASE 
						WHEN ${results.checkStatus} = 'failed'
						AND ${results.issueStatus} = 'discarded'
						THEN 1 
					END`,
				),
				highIssues: count(
					sql`CASE 
						WHEN ${results.checkStatus} = 'failed'
						AND ${results.criticality} = 'high'
						THEN 1 
					END`,
				),
				mediumIssues: count(
					sql`CASE 
						WHEN ${results.checkStatus} = 'failed'
						AND ${results.criticality} = 'medium'
						THEN 1 
					END`,
				),
				lowIssues: count(
					sql`CASE 
						WHEN ${results.checkStatus} = 'failed'
						AND ${results.criticality} = 'low'
						THEN 1 
					END`,
				),
			})
			.from(results)
			// Only rows that actually produced a verdict. upstream_failed never ran and
			// error is our fault, so counting either inflates totalChecksExecuted and
			// drags down the pass rate derived from it.
			.where(and(whereClause ?? undefined, inArray(results.checkStatus, ["passed", "failed"])));

		return {
			totalChecksExecuted: row?.totalChecksExecuted ?? 0,
			checksPassed: row?.checksPassed ?? 0,
			checksFailed: row?.checksFailed ?? 0,
			passRate: row?.totalChecksExecuted ? Math.round((row.checksPassed / row.totalChecksExecuted) * 100) : 0,
			totalIssues: row?.checksFailed ?? 0,
			openIssues: row?.openIssues ?? 0,
			resolvedIssues: row?.resolvedIssues ?? 0,
			discardedIssues: row?.discardedIssues ?? 0,
			criticality: {
				high: row?.highIssues ?? 0,
				medium: row?.mediumIssues ?? 0,
				low: row?.lowIssues ?? 0,
			},
		};
	}

	async getDashboardIssuesStatus(query: DashboardBaseQuery) {
		const whereClause = buildDashboardFilters(query);

		const result = await db.execute<{
			label: string;
			bucketStart: Date;
			open: number;
			resolved: number;
			discarded: number;
		}>(sql`
		WITH filtered AS MATERIALIZED (
			SELECT
				${results.jobTimestamp} AS job_timestamp,
				COALESCE(${results.issueStatus}, 'open') AS issue_status
			FROM ${results}
			WHERE ${results.checkStatus} = 'failed'
			${whereClause ? sql`AND ${whereClause}` : sql``}
		),

		bucketed_base AS (
			SELECT
				CASE
					WHEN ${periodOf(query)} = 'current_batch' THEN date_trunc('second', job_timestamp)
					WHEN ${periodOf(query)} IN ('current_week', 'current_month') THEN date_trunc('day', job_timestamp)
					ELSE date_trunc('month', job_timestamp)
				END AS bucket_start,

				issue_status
			FROM filtered
		),

		bucketed AS (
			SELECT
				bucket_start,

				CASE
					WHEN ${periodOf(query)} = 'current_batch'
						THEN 'Current Batch • ' || TO_CHAR(bucket_start, 'DD Mon YYYY HH24:MI')

					WHEN ${periodOf(query)} IN ('current_week', 'current_month')
						THEN TO_CHAR(bucket_start, 'DD Mon YYYY')

					ELSE TO_CHAR(bucket_start, 'Mon YYYY')
				END AS label,

				COUNT(*) FILTER (WHERE issue_status = 'open')::integer AS open,
				COUNT(*) FILTER (WHERE issue_status = 'resolved')::integer AS resolved,
				COUNT(*) FILTER (WHERE issue_status = 'discarded')::integer AS discarded

			FROM bucketed_base
			GROUP BY bucket_start
		)

		SELECT
			label,
			bucket_start AS "bucketStart",
			open,
			resolved,
			discarded
		FROM bucketed
		ORDER BY bucket_start;
	`);

		return result.rows;
	}

	async getDashboardIssuesBySource(query: DashboardBaseQuery) {
		const whereClause = buildDashboardFilters(query);

		const result = await db.execute<{
			sourceId: number;
			source: string;
			totalIssues: number;
			high: number;
			medium: number;
			low: number;
		}>(sql`
    SELECT
      ds.id AS "sourceId",
      ds.title AS "source",
      COUNT(*)::integer AS "totalIssues",
      COUNT(*) FILTER (WHERE ${results.criticality} = 'high')::integer AS "high",
      COUNT(*) FILTER (WHERE ${results.criticality} = 'medium')::integer AS "medium",
      COUNT(*) FILTER (WHERE ${results.criticality} = 'low')::integer AS "low"
    FROM ${results}
    INNER JOIN qc_tags ds ON ds.id = ${results.dataSource}
    WHERE ${results.checkStatus} = 'failed'
    ${whereClause ? sql`AND ${whereClause}` : sql``}
    GROUP BY ds.id, ds.title
    ORDER BY "totalIssues" DESC;
  `);

		return result.rows;
	}

	async getDashboardIssuesTrend(query: DashboardTrendQuery) {
		const whereClause = buildDashboardFilters(query);
		const bucket = query.bucket ?? "weekly";
		const groupBy = query.groupBy ?? "criticality";

		const bucketSql =
			bucket === "monthly" ? sql`date_trunc('month', ${results.jobTimestamp})` : sql`date_trunc('week', ${results.jobTimestamp})`;

		const labelSql = bucket === "monthly" ? sql`TO_CHAR(bucket_start, 'Mon YYYY')` : sql`TO_CHAR(bucket_start, 'DD Mon YYYY')`;

		if (groupBy === "workstream") {
			const result = await db.execute<{
				label: string;
				bucketStart: Date;
				workstream: string;
				totalIssues: number;
			}>(sql`
			WITH bucketed AS MATERIALIZED (
				SELECT
					${bucketSql} AS bucket_start,
					${results.workstream} AS workstream
				FROM ${results}
				WHERE ${results.checkStatus} = 'failed'
				${whereClause ? sql`AND ${whereClause}` : sql``}
			)

			SELECT
				${labelSql} AS label,
				b.bucket_start AS "bucketStart",
				ws.title AS workstream,
				COUNT(*)::integer AS "totalIssues"

			FROM bucketed b
			INNER JOIN qc_tags ws
				ON ws.id = b.workstream

			GROUP BY
				b.bucket_start,
				ws.title

			ORDER BY
				b.bucket_start,
				ws.title;
		`);

			return result.rows;
		}

		const result = await db.execute<{
			label: string;
			bucketStart: Date;
			high: number;
			medium: number;
			low: number;
		}>(sql`
		WITH bucketed AS MATERIALIZED (
			SELECT
				${bucketSql} AS bucket_start,
				${results.criticality} AS criticality
			FROM ${results}
			WHERE ${results.checkStatus} = 'failed'
			${whereClause ? sql`AND ${whereClause}` : sql``}
		)

		SELECT
			${labelSql} AS label,
			bucket_start AS "bucketStart",

			COUNT(*) FILTER (WHERE criticality = 'high')::integer AS high,
			COUNT(*) FILTER (WHERE criticality = 'medium')::integer AS medium,
			COUNT(*) FILTER (WHERE criticality = 'low')::integer AS low

		FROM bucketed

		GROUP BY bucket_start

		ORDER BY bucket_start;
	`);

		return result.rows;
	}

	async getDashboardIssuesTable(query: DashboardBaseQuery) {
		const whereClause = buildDashboardFilters(query);

		const totalIssues = sql<number>`
			COUNT(*) FILTER (
			WHERE ${results.checkStatus} = 'failed'
			)::integer
		`.as("totalIssues");

		const rows = await db
			.select({
				workstreamId: qcTagsLibrary.id,
				workstream: qcTagsLibrary.tagTitle,

				totalChecks: sql<number>`
					COUNT(*)::integer
				`.as("totalChecks"),

				totalIssues,

				high: sql<number>`
					COUNT(*) FILTER (
					WHERE ${results.checkStatus} = 'failed'
					AND ${results.criticality} = 'high'
					)::integer
				`.as("high"),

				medium: sql<number>`
					COUNT(*) FILTER (
					WHERE ${results.checkStatus} = 'failed'
					AND ${results.criticality} = 'medium'
					)::integer
				`.as("medium"),

				low: sql<number>`
					COUNT(*) FILTER (
					WHERE ${results.checkStatus} = 'failed'
					AND ${results.criticality} = 'low'
					)::integer
				`.as("low"),
			})
			.from(results)
			.innerJoin(qcTagsLibrary, eq(qcTagsLibrary.id, results.workstream))
			.where(whereClause ?? undefined)
			.groupBy(qcTagsLibrary.id, qcTagsLibrary.tagTitle)
			.orderBy(desc(totalIssues));

		return rows;
	}
}
