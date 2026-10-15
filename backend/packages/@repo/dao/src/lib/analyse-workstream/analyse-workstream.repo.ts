import { and, db, eq, gte, isNull, results, sql } from "@repo/db";
import { PaginationType, Paginator } from "@repo/lib";

type WorkstreamPeriod = "ltd" | "current_batch" | "current_week" | "current_month" | "quarter_to_date" | "year_to_date" | "launch_to_date";

type WorkstreamBucket = "daily" | "weekly" | "monthly";

type WorkstreamBaseQuery = {
	period?: WorkstreamPeriod;
	bucket?: WorkstreamBucket;
	page?: number;
	limit?: number;

	workstream?: number | null;
	dataSource?: number | null;
	impactedDownstream?: number | null;
	category?: number | null;

	checkType?: string | null;
	configType?: "all" | "file" | "db" | null;
	fileOrTableName?: string | null;
};

type CheckDetailsView = "last10" | "last20" | "weekly" | "monthly";

const cleanString = (v?: string | null) => {
	if (!v || String(v).trim() === "" || v === "all") return null;
	return String(v).trim();
};

const buildWorkstreamFilters = (query: WorkstreamBaseQuery) => {
	const filters = [];

	if (query.workstream) filters.push(eq(results.workstream, query.workstream));
	if (query.dataSource) filters.push(eq(results.dataSource, query.dataSource));
	if (query.category) filters.push(eq(results.checkCategory, query.category));

	if (query.impactedDownstream) {
		filters.push(sql`${query.impactedDownstream} = ANY(${results.impactedDownstream})`);
	}

	const checkType = cleanString(query.checkType);
	if (checkType) filters.push(eq(results.checkName, checkType));

	const fileOrTableName = cleanString(query.fileOrTableName);
	if (fileOrTableName) filters.push(eq(results.fileOrTableName, fileOrTableName));

	if (query.configType === "file") {
		filters.push(sql`${results.configId} ILIKE 'FC%'`);
	}

	if (query.configType === "db") {
		filters.push(sql`${results.configId} NOT ILIKE 'FC%'`);
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

	return filters.length ? and(...filters) : undefined;
};

const buildFailedChecksFilters = (query: WorkstreamBaseQuery) => {
	const filters = [];

	if (query.workstream) {
		filters.push(sql`r.workstream = ${query.workstream}`);
	}

	if (query.dataSource) {
		filters.push(sql`r.data_source = ${query.dataSource}`);
	}

	if (query.category) {
		filters.push(sql`r.check_category = ${query.category}`);
	}

	if (query.impactedDownstream) {
		filters.push(sql`${query.impactedDownstream} = ANY(r.impacted_downstream)`);
	}

	const checkType = cleanString(query.checkType);
	if (checkType) {
		filters.push(sql`r.check_name = ${checkType}`);
	}

	const fileOrTableName = cleanString(query.fileOrTableName);
	if (fileOrTableName) {
		filters.push(sql`r.file_or_table_name = ${fileOrTableName}`);
	}

	if (query.configType === "file") {
		filters.push(sql`r.config_id ILIKE 'FC%'`);
	}

	if (query.configType === "db") {
		filters.push(sql`r.config_id NOT ILIKE 'FC%'`);
	}

	if (query.period === "current_batch") {
		filters.push(sql`
			r.job_timestamp = (
				SELECT MAX(job_timestamp)
				FROM ${results}
			)
		`);
	}

	if (query.period === "current_week") {
		filters.push(sql`r.job_timestamp >= date_trunc('week', now() AT TIME ZONE 'UTC')`);
	}

	if (query.period === "current_month") {
		filters.push(sql`r.job_timestamp >= date_trunc('month', now() AT TIME ZONE 'UTC')`);
	}

	if (query.period === "quarter_to_date") {
		filters.push(sql`r.job_timestamp >= date_trunc('quarter', now() AT TIME ZONE 'UTC')`);
	}

	if (query.period === "year_to_date") {
		filters.push(sql`r.job_timestamp >= date_trunc('year', now() AT TIME ZONE 'UTC')`);
	}

	return filters.length ? and(...filters) : undefined;
};

export class AnalyseWorkstreamRepo {
	async getDistinctCheckTypes(query: WorkstreamBaseQuery) {
		const whereClause = buildWorkstreamFilters(query);

		const result = await db.execute<{ checkType: string }>(sql`
      SELECT DISTINCT ${results.checkName} AS "checkType"
      FROM ${results}
      ${whereClause ? sql`WHERE ${whereClause}` : sql``}
      ORDER BY ${results.checkName};
    `);

		return result.rows.map((row) => row.checkType);
	}

	async getDistinctFileOrTableNames(query: WorkstreamBaseQuery) {
		const whereClause = buildWorkstreamFilters(query);

		const result = await db.execute<{
			fileOrTableName: string;
			configType: "file" | "db";
		}>(sql`
      SELECT DISTINCT
        ${results.fileOrTableName} AS "fileOrTableName",
        CASE
          WHEN ${results.configId} ILIKE 'FC%' THEN 'file'
          ELSE 'db'
        END AS "configType"
      FROM ${results}
      ${whereClause ? sql`WHERE ${whereClause}` : sql``}
      ORDER BY ${results.fileOrTableName};
    `);

		return result.rows;
	}

	async getCheckCards(query: WorkstreamBaseQuery) {
		const whereClause = buildWorkstreamFilters(query);

		const result = await db.execute<{
			checkType: string;
			failed: number;
			total: number;
		}>(sql`
      SELECT
        ${results.checkName} AS "checkType",
        COUNT(*) FILTER (WHERE ${results.checkStatus} = 'failed')::integer AS failed,
        COUNT(*)::integer AS total
      FROM ${results}
      -- Only rows that actually produced a verdict count towards the total.
      -- upstream_failed never ran (a gate stopped the config) and error is our fault,
      -- so including either would inflate the total and deflate the pass rate.
      ${whereClause ? sql`WHERE ${whereClause} AND` : sql`WHERE`} ${results.checkStatus} IN ('passed', 'failed')
      GROUP BY ${results.checkName}
      ORDER BY failed DESC, total DESC;
    `);

		return result.rows;
	}

	async getFailedTrend(query: WorkstreamBaseQuery) {
		const whereClause = buildWorkstreamFilters(query);
		const bucket = query.bucket ?? "monthly";

		const bucketSql =
			bucket === "daily"
				? sql`date_trunc('day', ${results.jobTimestamp})`
				: bucket === "weekly"
					? sql`date_trunc('week', ${results.jobTimestamp})`
					: sql`date_trunc('month', ${results.jobTimestamp})`;

		const labelSql =
			bucket === "daily"
				? sql`TO_CHAR(bucket_start, 'DD Mon YYYY')`
				: bucket === "weekly"
					? sql`TO_CHAR(bucket_start, 'DD Mon YYYY')`
					: sql`TO_CHAR(bucket_start, 'Mon YYYY')`;

		const result = await db.execute<{
			label: string;
			bucketStart: Date;
			checkType: string;
			failed: number;
		}>(sql`
      WITH bucketed AS MATERIALIZED (
        SELECT
          ${bucketSql} AS bucket_start,
          ${results.checkName} AS check_type
        FROM ${results}
        WHERE ${results.checkStatus} = 'failed'
        ${whereClause ? sql`AND ${whereClause}` : sql``}
      )
      SELECT
        ${labelSql} AS label,
        bucket_start AS "bucketStart",
        check_type AS "checkType",
        COUNT(*)::integer AS failed
      FROM bucketed
      GROUP BY bucket_start, check_type
      ORDER BY bucket_start, check_type;
    `);

		return result.rows;
	}

	async getFailedChecksTable(query: WorkstreamBaseQuery, { page = 1, limit = 20 }: PaginationType) {
		const whereClause = buildFailedChecksFilters(query);
		const offset = (page - 1) * limit;

		const totalResult = await db.execute<{ total: number }>(sql`
		WITH latest_keys AS (
			SELECT DISTINCT ON (
			r.config_id,
			r.check_id,
			r.check_name,
			r.file_or_table_name,
			r.field
			)
			r.check_execution_id
			FROM ${results} r
			WHERE r.check_status = 'failed'
			${whereClause ? sql`AND ${whereClause}` : sql``}
			ORDER BY
			r.config_id,
			r.check_id,
			r.check_name,
			r.file_or_table_name,
			r.field,
			r.job_timestamp DESC,
			r.check_execution_id DESC
		)

		SELECT COUNT(*)::int AS total
		FROM latest_keys;
		`);

		const total = totalResult.rows[0]?.total ?? 0;

		const result = await db.execute<{
			qcId: number;
			checkId: string;
			checkType: string;
			source: string;
			workstream: string;
			fileOrTableName: string;
			configId: string;
			configName: string;
			description: string | null;
			failureReason: string | null;
			criticality: "low" | "medium" | "high";
			latestStatus: "open" | "resolved" | "discarded";
			runDate: Date;
			last10RunStatus: ("passed" | "failed")[];
		}>(sql`
    WITH latest_keys AS (
      SELECT DISTINCT ON (
        r.config_id,
        r.check_id,
        r.check_name,
        r.file_or_table_name,
        r.field
      )
        r.check_execution_id,
        r.check_id,
        r.check_name,
        r.data_source,
        r.workstream,
        r.file_or_table_name,
        r.config_id,
        r.config_name,
        r.check_description,
        r.failure_reason,
        r.criticality,
        r.issue_status,
        r.job_timestamp,
        r.field
      FROM ${results} r
      WHERE r.check_status = 'failed'
      ${whereClause ? sql`AND ${whereClause}` : sql``}
      ORDER BY
        r.config_id,
        r.check_id,
        r.check_name,
        r.file_or_table_name,
        r.field,
        r.job_timestamp DESC,
        r.check_execution_id DESC
    ),

    paged AS (
      SELECT *
      FROM latest_keys
      ORDER BY job_timestamp DESC, check_execution_id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    )

    SELECT
      p.check_execution_id AS "qcId",
      p.check_id AS "checkId",
      p.check_name AS "checkType",
      ds.title AS source,
      ws.title AS workstream,
      p.file_or_table_name AS "fileOrTableName",
      p.config_id AS "configId",
      p.config_name AS "configName",
      p.check_description AS description,
      p.failure_reason AS "failureReason",
      p.criticality,
      COALESCE(p.issue_status, 'open') AS "latestStatus",
      p.job_timestamp AS "runDate",
      COALESCE(run_status."last10RunStatus", '[]'::jsonb) AS "last10RunStatus"
    FROM paged p
    INNER JOIN qc_tags ds ON ds.id = p.data_source
    INNER JOIN qc_tags ws ON ws.id = p.workstream

    LEFT JOIN LATERAL (
      SELECT jsonb_agg(x.check_status ORDER BY x.job_timestamp DESC, x.check_execution_id DESC) AS "last10RunStatus"
      FROM (
        SELECT
          r2.check_status,
          r2.job_timestamp,
          r2.check_execution_id
        FROM ${results} r2
        WHERE r2.config_id = p.config_id
          AND r2.check_id = p.check_id
          AND r2.check_name = p.check_name
          AND r2.file_or_table_name = p.file_or_table_name
          AND r2.field = p.field
          -- The dots show run history, so only real executions belong in them. A run that
          -- was skipped behind a failing gate is not a red dot against this check.
          AND r2.check_status IN ('passed', 'failed')
        ORDER BY r2.job_timestamp DESC, r2.check_execution_id DESC
        LIMIT 10
      ) x
    ) run_status ON true

    ORDER BY p.job_timestamp DESC, p.check_execution_id DESC;
  `);

		const rows = result.rows;

		// return result.rows;

		return Paginator.paginate(
			{
				limit: limit.toString(),
				page: page.toString(),
			},
			rows,
			total,
		);
	}

	async getCheckDetails(id: number, view: CheckDetailsView = "last10") {
		const [base] = await db.select().from(results).where(eq(results.checkExecutionId, id)).limit(1);
		if (!base) return null;

		const sameCheck = and(
			eq(results.configId, base.configId),
			eq(results.checkId, base.checkId),
			eq(results.checkName, base.checkName),
			eq(results.fileOrTableName, base.fileOrTableName),
			// `field` is nullable: table-level checks name no single column. eq() has no
			// null overload, and `= NULL` never matches anyway, so the null case needs IS NULL
			// to find the same check's other runs instead of silently returning nothing.
			base.field === null ? isNull(results.field) : eq(results.field, base.field),
		);

		let history;

		if (view === "last10") {
			history = await db.execute<{
				executionId: number;
				date: Date;
				passed: number;
				failed: number;
				total: number;
				status: "passed" | "failed";
				failureReason: string | null;
			}>(sql`
			SELECT
			${results.checkExecutionId} AS "executionId",

			${results.jobTimestamp} AS date,

			COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0)::integer AS passed,

			COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)::integer AS failed,

			(
				COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0) +
				COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)
			)::integer AS total,

			${results.checkStatus} AS status,

			${results.failureReason} AS "failureReason"
				FROM ${results}
				-- Keeps the declared "passed" | "failed" return type honest at runtime.
				WHERE ${sameCheck} AND ${results.checkStatus} IN ('passed', 'failed')
				ORDER BY ${results.jobTimestamp} DESC
				LIMIT 10;
				`);
		} else if (view === "last20") {
			history = await db.execute<{
				executionId: number;
				date: Date;
				passed: number;
				failed: number;
				total: number;
				status: "passed" | "failed";
				failureReason: string | null;
			}>(sql`
			SELECT
			${results.checkExecutionId} AS "executionId",

			${results.jobTimestamp} AS date,

			COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0)::integer AS passed,

			COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)::integer AS failed,

			(
				COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0) +
				COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)
			)::integer AS total,

			${results.checkStatus} AS status,

			${results.failureReason} AS "failureReason"

			FROM ${results}
			-- Keeps the declared "passed" | "failed" return type honest at runtime.
			WHERE ${sameCheck} AND ${results.checkStatus} IN ('passed', 'failed')
			ORDER BY ${results.jobTimestamp} DESC
			LIMIT 20;
			`);
		} else if (view === "weekly") {
			history = await db.execute<{
				date: Date;
				passed: number;
				failed: number;
				total: number;
			}>(sql`
        	SELECT
			date_trunc('week', ${results.jobTimestamp}) AS date,

			SUM(
				COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0)
			)::integer AS passed,

			SUM(
				COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)
			)::integer AS failed,

			SUM(
				COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0) +
				COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)
			)::integer AS total

			FROM ${results}
			WHERE ${sameCheck}
			GROUP BY date_trunc('week', ${results.jobTimestamp})
			ORDER BY date_trunc('week', ${results.jobTimestamp}) DESC
			LIMIT 12;
		`);
		} else if (view === "monthly") {
			history = await db.execute<{
				date: Date;
				passed: number;
				failed: number;
				total: number;
			}>(sql`
			SELECT
			date_trunc('month', ${results.jobTimestamp}) AS date,

			SUM(
				COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0)
			)::integer AS passed,

			SUM(
				COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)
			)::integer AS failed,

			SUM(
				COALESCE((CASE WHEN ${results.passedRows} ~ '^[0-9]+$' THEN ${results.passedRows}::numeric END), 0) +
				COALESCE((CASE WHEN ${results.issueRows} ~ '^[0-9]+$' THEN ${results.issueRows}::numeric END), 0)
			)::integer AS total

			FROM ${results}
			WHERE ${sameCheck}
			GROUP BY date_trunc('month', ${results.jobTimestamp})
			ORDER BY date_trunc('month', ${results.jobTimestamp}) DESC
			LIMIT 12;
		`);
		}

		// const limit = view === "last10" ? 10 : view === "last20" ? 20 : 20;

		return {
			summary: base,
			view,
			runHistory: history?.rows.reverse(),
		};
	}

	/**
	 * NOT IMPLEMENTED -- this returns FABRICATED rows, not real failing records.
	 *
	 * rowId, actual and expected below are invented from a loop index. Nothing here
	 * reads the source data. It is wired to no endpoint on the frontend and must not
	 * be, because the output is indistinguishable from a real finding.
	 *
	 * A real implementation needs one of:
	 *   - the engine persisting failed row identifiers (it computes them in
	 *     trad_ct_id/sql_executor.py but `results` has no column for them), or
	 *   - re-running the check predicate against the source connection on demand.
	 *
	 * Until then the UI deliberately has no "View Top 100" control.
	 */
	async getTopErrorRecords(id: number, limit = 100) {
		const [base] = await db.select().from(results).where(eq(results.checkExecutionId, id)).limit(1);
		if (!base) return [];

		return Array.from({ length: Math.min(limit, 100) }).map((_, index) => ({
			index: index + 1,
			rowId: 1001 + index,
			table: base.fileOrTableName,
			column: base.field,
			actual: index % 2 === 0 ? "NULL" : `invalid_${index}`,
			expected: "valid value",
			errorDescription: base.failureReason ?? "Quality check failed",
			detectedAt: base.jobTimestamp,
		}));
	}
}
