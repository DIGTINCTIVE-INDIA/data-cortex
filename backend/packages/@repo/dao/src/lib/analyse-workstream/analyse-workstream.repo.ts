import {
	and,
	customBusinessChecksConfig,
	databaseConnection,
	db,
	dbBasedChecksConfig,
	eq,
	fileBasedChecksConfig,
	gte,
	isNull,
	results,
	sql,
	traditionalChecksLibraryRev,
} from "@repo/db";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { DBExplorerRepo } from "../db-explorer/db.explorer.repo.js";
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
          -- The field is NULL for custom checks and other table-level checks, and = NULL never
          -- matches, which left those checks with no dots at all. IS NOT DISTINCT FROM matches
          -- two NULLs as well as two equal values.
          AND r2.field IS NOT DISTINCT FROM p.field
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
	 * The rows a check rejected, read from the error table the engine wrote on the check's
	 * target connection (`{target_table_prefix}_err`), so Postgres and Snowflake targets both
	 * work through the same read-only explorer path.
	 *
	 * `results` keeps counts only, so the rows are found from the config: result -> config
	 * -> target connection + prefix -> that job's rows in the error table. Traditional checks
	 * mark each failed row in a column named after the check; custom checks tag each row with
	 * the check id. Table-level checks (row count, for instance) reject no single row, so they
	 * have none to show and say so rather than showing an empty grid.
	 */
	async getTopErrorRecords(id: number, limit = 100) {
		const [base] = await db.select().from(results).where(eq(results.checkExecutionId, id)).limit(1);
		if (!base) throw new ErrorResponse("Check result not found", 404);

		const configId = base.configId ?? "";
		const [config] = configId.startsWith("FBC")
			? await db.select().from(fileBasedChecksConfig).where(eq(fileBasedChecksConfig.configId, configId)).limit(1)
			: configId.startsWith("CB")
				? await db.select().from(customBusinessChecksConfig).where(eq(customBusinessChecksConfig.checkId, configId)).limit(1)
				: await db.select().from(dbBasedChecksConfig).where(eq(dbBasedChecksConfig.configId, configId)).limit(1);

		const empty = (note: string) => ({ columns: [], rows: [], hasMore: false, note });

		if (!config) return empty("The configuration for this check no longer exists, so its error records cannot be located.");

		const [connection] = await db
			.select({ databaseType: databaseConnection.databaseType })
			.from(databaseConnection)
			.where(eq(databaseConnection.connectionId, config.targetConnectionId))
			.limit(1);
		if (!connection) return empty("The target connection for this check no longer exists.");

		// The engine quotes Snowflake identifiers upper-case and Postgres ones as written.
		const isSnowflake = connection.databaseType === "snowflake";
		const ident = (name: string) => `"${(isSnowflake ? name.toUpperCase() : name).replace(/"/g, '""')}"`;
		const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

		// `_err` holds only the latest run; `_err_hist` accumulates every run, so it is the one that
		// can answer for an older run. `_err` is the fallback for tables that predate the history.
		const tables = [ident(`${config.targetTablePrefix}_err_hist`), ident(`${config.targetTablePrefix}_err`)];
		const conditions = [`${ident("_job_id")} = ${lit(base.jobId)}`];

		if (configId.startsWith("CB")) {
			// The engine stores this value wrapped in quote characters.
			conditions.push(`${ident("_check_id")} LIKE ${lit(`%${configId}%`)}`);
		} else {
			const [library] = await db
				.select({ mapping: traditionalChecksLibraryRev.checkMappingName })
				.from(traditionalChecksLibraryRev)
				.where(eq(traditionalChecksLibraryRev.checkId, base.checkId))
				.limit(1);
			if (!library) return empty("This check has no individual error records.");
			conditions.push(`${ident(`_${library.mapping}`)} LIKE ${lit('%"Fail"%')}`);
		}

		const explorer = new DBExplorerRepo();
		const missing = /does not exist|invalid identifier|not authorized|SQL compilation error/i;

		let lastError: unknown = null;

		for (const table of tables) {
			try {
				const result = await explorer.executeQuery(config.targetConnectionId, {
					sqlQuery: `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")}`,
					page: 1,
					pageSize: Math.min(limit, 100),
				});

				return { columns: result.columns, rows: result.rows, hasMore: result.pagination.hasMore, note: null as string | null };
			} catch (error) {
				lastError = error;
				if (!missing.test(String((error as { message?: string })?.message ?? ""))) throw error;
			}
		}

		// Every candidate table was absent: the check passed, is table-level, or wrote no rows.
		void lastError;
		return empty("No error records were stored for this check. It may check the table as a whole, or the error table has not been created yet.");
	}
}
