import { and, count, db, eq, gte, ilike, or, results, sql } from "@repo/db";
import { PaginationType, Paginator } from "@repo/lib";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { QcSummaryQuery, QcSummaryReport } from "@repo/types";

type QcAlertStatus = "open" | "resolved" | "discarded";
type QcAlertCriticality = "low" | "medium" | "high";
type QcAlertPeriod = "ltd" | "current_week" | "current_month" | "quarter_to_date" | "year_to_date";

type GetQcAlertsQuery = PaginationType & {
	search?: string | null;
	criticality?: QcAlertCriticality | null;
	status?: QcAlertStatus | "all" | null;
	category?: number | null;
	period?: QcAlertPeriod | null;
	workstream?: number | null;
	impactedDownstream?: number | null;
};

type GetQcAlertsSummaryQuery = Omit<GetQcAlertsQuery, "page" | "limit" | "status" | "search">;

type UpdateQcAlertStatusPayload = {
	id: number;
	status: "resolved" | "discarded";
	/** Required when discarding; the validator enforces it. */
	reason?: string;
};

const buildPeriodFilter = (period?: QcAlertPeriod | QcSummaryQuery["period"] | null) => {
	if (period === "current_week") {
		return gte(results.jobTimestamp, sql`date_trunc('week', now() AT TIME ZONE 'UTC')`);
	}

	if (period === "current_month") {
		return gte(results.jobTimestamp, sql`date_trunc('month', now() AT TIME ZONE 'UTC')`);
	}

	if (period === "quarter_to_date") {
		return gte(results.jobTimestamp, sql`date_trunc('quarter', now() AT TIME ZONE 'UTC')`);
	}

	if (period === "year_to_date") {
		return gte(results.jobTimestamp, sql`date_trunc('year', now() AT TIME ZONE 'UTC')`);
	}

	return undefined;
};

const normalizeId = (value: unknown) => {
	if (value === undefined || value === null || String(value).trim() === "") {
		return null;
	}

	const parsed = Number(value);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error("Invalid numeric filter value");
	}

	return parsed;
};

const normalizeWorkstream = (workstream: QcSummaryQuery["workstream"]) => {
	return normalizeId(workstream);
};

export class ReportsRepo {
	/**
	 * Builds the QC Summary Report for the selected period and optional workstream.
	 *
	 * Period filters:
	 * - current_batch:
	 *   Uses only records from the latest available job_timestamp in the results table.
	 *
	 * - current_week:
	 *   Uses records from the start of the current UTC week until now.
	 *
	 * - current_month:
	 *   Uses records from the start of the current UTC month until now.
	 *
	 * - quarter_to_date:
	 *   Uses records from the start of the current UTC quarter until now.
	 *   A quarter means a 3-month business period:
	 *   Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec.
	 *
	 * - year_to_date:
	 *   Uses records from the start of the current UTC year until now.
	 *
	 * Query flow:
	 * 1. Builds filters based on period and workstream.
	 * 2. Creates filtered_results as a MATERIALIZED CTE so PostgreSQL filters the
	 *    results table once and reuses that filtered dataset in later CTEs.
	 * 3. summary_rows calculates per-workstream metrics:
	 *    - checksExecuted
	 *    - checksPassed
	 *    - checksFailed
	 *    - passRate
	 *    - recurringIssues
	 * 4. downstream_ids unnests impacted_downstream safely in a separate CTE.
	 *    This avoids multiplying result rows while counting checks.
	 * 5. downstream_rows converts downstream IDs into downstream tag titles.
	 * 6. final_rows merges workstream metrics with downstream impact names.
	 * 7. totals calculates overall report totals at DB level.
	 * 8. Final SELECT returns the exact JSON shape required by QcSummaryReport.
	 *
	 * Important:
	 * The downstream aggregation is intentionally separated from summary_rows.
	 * Joining impacted_downstream directly while counting checks would multiply rows
	 * and produce incorrect totals.
	 */
	async getQcSummaryReport(query: QcSummaryQuery): Promise<QcSummaryReport> {
		const period = query.period ?? "current_batch";
		const workstream = normalizeWorkstream(query.workstream);

		const filters = [];

		if (workstream !== null) {
			filters.push(eq(results.workstream, workstream));
		}

		if (period === "current_batch") {
			filters.push(sql`
				${results.jobTimestamp} = (
					SELECT MAX(${results.jobTimestamp})
					FROM ${results}
				)
			`);
		}

		if (period === "current_week") {
			filters.push(gte(results.jobTimestamp, sql`date_trunc('week', now() AT TIME ZONE 'UTC')`));
		}

		if (period === "current_month") {
			filters.push(gte(results.jobTimestamp, sql`date_trunc('month', now() AT TIME ZONE 'UTC')`));
		}

		if (period === "quarter_to_date") {
			filters.push(gte(results.jobTimestamp, sql`date_trunc('quarter', now() AT TIME ZONE 'UTC')`));
		}

		if (period === "year_to_date") {
			filters.push(gte(results.jobTimestamp, sql`date_trunc('year', now() AT TIME ZONE 'UTC')`));
		}

		const whereClause = filters.length > 0 ? and(...filters) : undefined;

		const result = await db.execute<{
			report: QcSummaryReport;
		}>(sql`
            WITH latest_batch AS (
                SELECT MAX(job_timestamp) AS job_timestamp
                FROM ${results}
            ),

            /*
             * Only rows carrying a verdict about the client's data reach the aggregates
             * below. Excluding here rather than inside each COUNT keeps every total, the
             * pass rate and the issue count consistent, and a later aggregate cannot
             * forget the rule.
             *
             *   upstream_failed -- never ran; a gate before it stopped the config. The
             *                      verdict lives in the gate's own row, so counting these
             *                      reports one gate failure as dozens of issues.
             *   error           -- our fault, not a data-quality finding, so it must not
             *                      move the client's numbers.
             */
            filtered_results AS MATERIALIZED (
                SELECT
                    ${results.workstream} AS workstream,
                    ${results.checkStatus} AS check_status,
                    ${results.issueStatus} AS issue_status,
                    ${results.impactedDownstream} AS impacted_downstream
                FROM ${results}
                ${whereClause ? sql`WHERE ${whereClause} AND` : sql`WHERE`} ${results.checkStatus} IN ('passed', 'failed')
            ),

            summary_rows AS (
                SELECT
                    q.id AS "workstreamId",
                    q.title AS "workstream",

                    COUNT(*)::integer AS "checksExecuted",

                    COUNT(*) FILTER (
                        WHERE fr.check_status = 'passed'
                    )::integer AS "checksPassed",

                    COUNT(*) FILTER (
                        WHERE fr.check_status = 'failed'
                    )::integer AS "checksFailed",

                    CASE
                        WHEN COUNT(*) = 0 THEN 0
                        ELSE ROUND(
                            COUNT(*) FILTER (
                                WHERE fr.check_status = 'passed'
                            )::numeric
                            / COUNT(*)::numeric
                            * 100
                        )::integer
                    END AS "passRate",

                    COUNT(*) FILTER (
                        WHERE fr.check_status = 'failed'
                        AND fr.issue_status IS DISTINCT FROM 'resolved'
                    )::integer AS "recurringIssues"

                FROM filtered_results fr
                INNER JOIN qc_tags q
                    ON q.id = fr.workstream
                GROUP BY q.id, q.title
            ),

            downstream_ids AS (
                SELECT DISTINCT
                    fr.workstream AS "workstreamId",
                    UNNEST(fr.impacted_downstream) AS downstream_id
                FROM filtered_results fr
                WHERE fr.impacted_downstream IS NOT NULL
                    AND cardinality(fr.impacted_downstream) > 0
            ),

            downstream_rows AS (
                SELECT
                    di."workstreamId",

                    ARRAY_AGG(
                        DISTINCT d.title
                        ORDER BY d.title
                    )::text[] AS "downstreamImpacted"

                FROM downstream_ids di
                INNER JOIN qc_tags d
                    ON d.id = di.downstream_id
                GROUP BY di."workstreamId"
            ),

            final_rows AS MATERIALIZED (
                SELECT
                    sr."workstreamId",
                    sr."workstream",
                    sr."checksExecuted",
                    sr."checksPassed",
                    sr."checksFailed",
                    sr."passRate",
                    sr."recurringIssues",
                    COALESCE(dr."downstreamImpacted", ARRAY[]::text[]) AS "downstreamImpacted"
                FROM summary_rows sr
                LEFT JOIN downstream_rows dr
                    ON dr."workstreamId" = sr."workstreamId"
            ),

            totals AS (
                SELECT
                    COALESCE(SUM(fr."checksExecuted"), 0)::integer AS "totalChecksExecuted",
                    COALESCE(SUM(fr."checksPassed"), 0)::integer AS "checksPassed",
                    COALESCE(SUM(fr."checksFailed"), 0)::integer AS "checksFailed",
                    COALESCE(SUM(fr."recurringIssues"), 0)::integer AS "recurringIssues",

                    CASE
                        WHEN COALESCE(SUM(fr."checksExecuted"), 0) = 0 THEN 0
                        ELSE ROUND(
                            COALESCE(SUM(fr."checksPassed"), 0)::numeric
                            / NULLIF(SUM(fr."checksExecuted"), 0)::numeric
                            * 100
                        )::integer
                    END AS "passRate",

                    COALESCE(
                        ARRAY(
                            SELECT DISTINCT downstream
                            FROM final_rows x
                            CROSS JOIN LATERAL UNNEST(x."downstreamImpacted") AS downstream
                            ORDER BY downstream
                        ),
                        ARRAY[]::text[]
                    ) AS "downstreamImpacted"

                FROM final_rows fr
            )

            SELECT json_build_object(
                'summary', json_build_object(
                    'totalChecksExecuted', t."totalChecksExecuted",
                    'checksPassed', t."checksPassed",
                    'checksFailed', t."checksFailed",
                    'passRate', t."passRate"
                ),

                'rows', COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'workstreamId', fr."workstreamId",
                                'workstream', fr."workstream",
                                'checksExecuted', fr."checksExecuted",
                                'checksPassed', fr."checksPassed",
                                'checksFailed', fr."checksFailed",
                                'passRate', fr."passRate",
                                'recurringIssues', fr."recurringIssues",
                                'downstreamImpacted', fr."downstreamImpacted"
                            )
                            ORDER BY fr."workstream"
                        )
                        FROM final_rows fr
                    ),
                    '[]'::json
                ),

                'total', json_build_object(
                    'workstream', 'Total',
                    'checksExecuted', t."totalChecksExecuted",
                    'checksPassed', t."checksPassed",
                    'checksFailed', t."checksFailed",
                    'passRate', t."passRate",
                    'recurringIssues', t."recurringIssues",
                    'downstreamImpacted', t."downstreamImpacted"
                )
            ) AS report
            FROM totals t;
        `);

		const row = result.rows[0];

		return row.report;
	}

	async getQcAlertsReport(query: GetQcAlertsQuery) {
		const page = Math.max(Number(query.page ?? 1), 1);
		const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 100);
		const offset = (page - 1) * limit;

		const filters = [eq(results.checkStatus, "failed")];

		if (query.status && query.status !== "all") {
			filters.push(sql`COALESCE(${results.issueStatus}, 'open') = ${query.status}`);
		}

		if (query.criticality) {
			filters.push(eq(results.criticality, query.criticality));
		}

		if (query.category) {
			filters.push(eq(results.checkCategory, Number(query.category)));
		}

		if (query.workstream) {
			filters.push(eq(results.workstream, Number(query.workstream)));
		}

		if (query.impactedDownstream) {
			filters.push(sql`${Number(query.impactedDownstream)} = ANY(${results.impactedDownstream})`);
		}

		const periodFilter = buildPeriodFilter(query.period);

		if (periodFilter) {
			filters.push(periodFilter);
		}

		if (query.search?.trim()) {
			const search = `%${query.search.trim()}%`;

			filters.push(
				or(
					ilike(results.checkName, search),
					ilike(results.checkDescription, search),
					ilike(results.checkId, search),
					ilike(results.configId, search),
					ilike(results.configName, search),
					ilike(results.failureReason, search),
					ilike(results.fileOrTableName, search),
					ilike(results.field, search),
				)!,
			);
		}

		const whereClause = and(...filters);

		const [{ total }] = await db.select({ total: count() }).from(results).where(whereClause);

		const items = await db.execute(sql`
			WITH paginated_base AS MATERIALIZED (
				SELECT
					${results.checkExecutionId} AS check_execution_id,
					${results.jobId} AS job_id,
					${results.jobTimestamp} AS job_timestamp,
					${results.checkId} AS check_id,
					${results.checkName} AS check_name,
					${results.checkDescription} AS check_description,
					${results.configId} AS config_id,
					${results.configName} AS config_name,
					${results.checkCategory} AS check_category,
					${results.workstream} AS workstream,
					${results.impactedDownstream} AS impacted_downstream,
					${results.dataSource} AS data_source,
					${results.fileOrTableName} AS file_or_table_name,
					${results.checkType} AS check_type,
					${results.field} AS field,
					${results.abort} AS abort,
					${results.checkStatus} AS check_status,
					${results.criticality} AS criticality,
					${results.issueRows} AS issue_rows,
					${results.passedRows} AS passed_rows,
					${results.failureReason} AS failure_reason,
					COALESCE(${results.issueStatus}, 'open') AS issue_status,
					${results.issueStatusReason} AS issue_status_reason
				FROM ${results}
				WHERE ${whereClause}
				ORDER BY ${results.jobTimestamp} DESC, ${results.checkExecutionId} DESC
				LIMIT ${limit}
				OFFSET ${offset}
			)

			SELECT
				pb.check_execution_id AS "id",
				pb.check_id AS "checkId",
				pb.check_name AS "title",
				pb.check_description AS "description",
				pb.config_id AS "configId",
				pb.config_name AS "configName",
				pb.job_id AS "jobId",
				pb.job_timestamp AS "jobTimestamp",
				pb.file_or_table_name AS "fileOrTableName",
				pb.check_type AS "checkType",
				pb.field,
				pb.abort,
				pb.check_status AS "checkStatus",
				pb.criticality,
				pb.issue_status AS "issueStatus",
				pb.issue_status_reason AS "issueStatusReason",
				pb.issue_rows AS "recordsAffected",
				pb.passed_rows AS "passedRows",
				pb.failure_reason AS "failureReason",
				category.title AS "category",
				workstream.title AS "workstream",
				data_source.title AS "source",
				COALESCE(
					ARRAY_AGG(DISTINCT downstream.title ORDER BY downstream.title)
						FILTER (WHERE downstream.title IS NOT NULL),
					ARRAY[]::text[]
				) AS "impactedDownstream"
			FROM paginated_base pb
			LEFT JOIN qc_tags category ON category.id = pb.check_category
			LEFT JOIN qc_tags workstream ON workstream.id = pb.workstream
			LEFT JOIN qc_tags data_source ON data_source.id = pb.data_source
			LEFT JOIN qc_tags downstream ON downstream.id = ANY(pb.impacted_downstream)
			GROUP BY
				pb.check_execution_id,
				pb.check_id,
				pb.check_name,
				pb.check_description,
				pb.config_id,
				pb.config_name,
				pb.job_id,
				pb.job_timestamp,
				pb.file_or_table_name,
				pb.check_type,
				pb.field,
				pb.abort,
				pb.check_status,
				pb.criticality,
				pb.issue_rows,
				pb.passed_rows,
				pb.failure_reason,
				pb.issue_status,
				pb.issue_status_reason,
				category.title,
				workstream.title,
				data_source.title
			ORDER BY pb.job_timestamp DESC, pb.check_execution_id DESC;
		`);

		return Paginator.paginate(
			{
				page: page.toString(),
				limit: limit.toString(),
			},
			items.rows,
			total,
		);
	}

	async getQcAlertsSummary(query: GetQcAlertsSummaryQuery) {
		const filters = [eq(results.checkStatus, "failed")];

		if (query.criticality) {
			filters.push(eq(results.criticality, query.criticality));
		}

		if (query.category) {
			filters.push(eq(results.checkCategory, Number(query.category)));
		}

		if (query.workstream) {
			filters.push(eq(results.workstream, Number(query.workstream)));
		}

		if (query.impactedDownstream) {
			filters.push(sql`${Number(query.impactedDownstream)} = ANY(${results.impactedDownstream})`);
		}

		const periodFilter = buildPeriodFilter(query.period);

		if (periodFilter) {
			filters.push(periodFilter);
		}

		const whereClause = and(...filters);

		const result = await db.execute<{
			totalQcAlerts: number;
			open: number;
			resolved: number;
			discarded: number;
			high: number;
			medium: number;
			low: number;
		}>(sql`
			SELECT
				COUNT(*)::integer AS "totalQcAlerts",
				COUNT(*) FILTER (WHERE COALESCE(${results.issueStatus}, 'open') = 'open')::integer AS "open",
				COUNT(*) FILTER (WHERE ${results.issueStatus} = 'resolved')::integer AS "resolved",
				COUNT(*) FILTER (WHERE ${results.issueStatus} = 'discarded')::integer AS "discarded",
				COUNT(*) FILTER (WHERE ${results.criticality} = 'high')::integer AS "high",
				COUNT(*) FILTER (WHERE ${results.criticality} = 'medium')::integer AS "medium",
				COUNT(*) FILTER (WHERE ${results.criticality} = 'low')::integer AS "low"
			FROM ${results}
			WHERE ${whereClause};
		`);

		const row = result.rows[0];

		return {
			summary: {
				totalQcAlerts: row?.totalQcAlerts ?? 0,
				open: row?.open ?? 0,
				resolved: row?.resolved ?? 0,
				discarded: row?.discarded ?? 0,
			},
			criticalitySummary: {
				totalIssues: row?.totalQcAlerts ?? 0,
				high: row?.high ?? 0,
				medium: row?.medium ?? 0,
				low: row?.low ?? 0,
			},
		};
	}

	async updateQcAlertStatus(payload: UpdateQcAlertStatusPayload) {
		const [updatedAlert] = await db
			.update(results)
			.set({
				issueStatus: payload.status,
				// Both outcomes may carry a note (required on discard, optional on
				// resolve: "fixed at source, reloaded 14 Oct"). Writing null when none
				// is given is what stops a later status change keeping the previous
				// note, which would attribute the old reason to the new outcome.
				issueStatusReason: payload.reason ?? null,
				updatedAt: new Date(),
			})
			.where(and(eq(results.checkExecutionId, payload.id), eq(results.checkStatus, "failed")))
			.returning({
				id: results.checkExecutionId,
				checkId: results.checkId,
				title: results.checkName,
				issueStatus: results.issueStatus,
				issueStatusReason: results.issueStatusReason,
				updatedAt: results.updatedAt,
			});

		if (!updatedAlert) {
			throw new ErrorResponse("QC alert not found", 404);
		}

		return updatedAlert;
	}
}
