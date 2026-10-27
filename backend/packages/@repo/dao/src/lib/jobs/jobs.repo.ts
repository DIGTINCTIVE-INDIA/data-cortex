import {
	and,
	asc,
	checkRuns,
	count,
	customBusinessChecksConfig,
	db,
	dbBasedChecksConfig,
	desc,
	eq,
	fileBasedChecksConfig,
	getTableColumns,
	inArray,
	max,
	min,
	results,
	serviceApiKeys,
	sql,
	usersTable,
} from "@repo/db";
import type { UserRoleEnum } from "@repo/db";
import { Paginator } from "@repo/lib";
import { ErrorResponse } from "@repo/lib/error-handlers-module";

export type JobViewer = { id: string; role: UserRoleEnum };

export type JobStatus = "held" | "queued" | "running" | "completed" | "failed";

const TERMINAL: JobStatus[] = ["completed", "failed"];

/**
 * Held runs have not reached the engine, so there is nothing to ask it about them: refreshing them
 * would look for a run the engine has never heard of. "dispatching" is the short claim while one
 * hand-over is in flight; the API reports it as "held".
 */
const WAITING_FOR_ENGINE = ["held", "dispatching"];

const publicStatus = (status: string) => (status === "dispatching" ? "held" : status);

/**
 * What a run did to the DATA, kept apart from how many checks it ran.
 *
 * A check is one rule on one column (null on column A, duplicate on column A, null on column B
 * are three checks); a custom check is one check. Rows are the table's rows: how many there were,
 * and how many DIFFERENT rows failed at least one check. A row that fails three checks is one
 * affected row, so "3 checks failed" and "1 row affected" can both be true of the same run.
 */
export type JobRows = { total: number | null; failed: number | null; clean: number | null };

const NO_ROWS: JobRows = { total: null, failed: null, clean: null };

const toRows = (picture: { total: number | null; failed: number | null } | null | undefined): JobRows => {
	if (!picture || picture.total === null || picture.total === undefined) return NO_ROWS;

	const failed = picture.failed ?? 0;

	return { total: picture.total, failed, clean: Math.max(0, picture.total - failed) };
};

// Results written before the row columns existed carry no run-level picture, but a custom check's
// own counts say the same thing: rows returned, and rows that passed. Older traditional runs have
// no way to say how many different rows failed, so they show none.
const ROWS_TOTAL_SQL = sql`max(coalesce(${results.rowsTotal}, case when ${results.checkType} = 'custom_sql' and ${results.issueRows} ~ '^[0-9]+$' and ${results.passedRows} ~ '^[0-9]+$' then ${results.issueRows}::int + ${results.passedRows}::int end))`;
const ROWS_FAILED_SQL = sql`max(coalesce(${results.rowsFailed}, case when ${results.checkType} = 'custom_sql' and ${results.issueRows} ~ '^[0-9]+$' then ${results.issueRows}::int end))`;

const DEFAULT_ENGINE_URL = "http://127.0.0.1:8000";

/**
 * How long a run may sit "queued" before it is declared lost.
 *
 * Celery cannot tell a task that has not started from one it has never heard of --
 * both read PENDING. Past this with no result rows, nothing is going to start it.
 */
const STALE_QUEUED_MS = 6 * 60 * 60 * 1000;

/** The engine's own state names, mapped onto ours. */
const STATE_TO_STATUS: Record<string, JobStatus> = {
	PENDING: "queued",
	RECEIVED: "queued",
	STARTED: "running",
	RETRY: "running",
	SUCCESS: "completed",
	FAILURE: "failed",
	REVOKED: "failed",
};

type EngineRun = {
	state: string;
	result?: { status?: string; started_at?: string; finished_at?: string } | string | null;
	error?: string;
	/** Short plain name of the failure, and the raw exception + traceback for developers. */
	error_title?: string;
	error_detail?: string;
	finished_at?: string;
} | null;

const asDate = (value?: string | null) => {
	const date = value ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date : null;
};

/** `null` means the engine could not be asked -- not that the run does not exist. */
async function fetchEngineRun(runId: string): Promise<EngineRun> {
	const url = `${process.env.DC_ENGINE_URL ?? DEFAULT_ENGINE_URL}/v1/runs/${encodeURIComponent(runId)}`;

	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(1500) });

		if (!response.ok) return null;

		return (await response.json()) as EngineRun;
	} catch {
		return null;
	}
}

export class JobsRepo {
	/** Records a run the engine has just accepted. Re-recording the same run is a no-op. */
	async record(input: { runId: string; configId: string; source: string; userId: string; apiKeyId?: string }) {
		await db
			.insert(checkRuns)
			.values({
				runId: input.runId,
				configId: input.configId,
				source: input.source,
				userId: input.userId,
				apiKeyId: input.apiKeyId ?? null,
				status: "queued",
				engineState: "PENDING",
			})
			.onConflictDoNothing();
	}

	/**
	 * A run with this key that the backend is still holding (or in the middle of handing over), if
	 * any. Used so a repeated click is the SAME run, both while the engine is down and in the moment
	 * after it comes back, before the held run has reached it.
	 */
	async findWaiting(input: { userId: string; configId: string; idempotencyKey: string }): Promise<string | null> {
		const [existing] = await db
			.select({ runId: checkRuns.runId })
			.from(checkRuns)
			.where(
				and(
					inArray(checkRuns.status, WAITING_FOR_ENGINE),
					eq(checkRuns.userId, input.userId),
					eq(checkRuns.configId, input.configId),
					eq(checkRuns.idempotencyKey, input.idempotencyKey),
				),
			)
			.limit(1);

		return existing?.runId ?? null;
	}

	/**
	 * Keeps a run the engine could not take, to be handed over when it can. The caller has already
	 * chosen the run id and will return it to the user, who sees the run in the Jobs list as held.
	 *
	 * A double click while the engine is down carries the same idempotency key, so it is the SAME
	 * held run (duplicate = true), not two.
	 */
	async hold(input: {
		runId: string;
		configId: string;
		source: string;
		userId: string;
		apiKeyId?: string;
		idempotencyKey?: string;
		reason: string;
	}): Promise<{ runId: string; duplicate: boolean }> {
		if (input.idempotencyKey) {
			const existing = await this.findWaiting({
				userId: input.userId,
				configId: input.configId,
				idempotencyKey: input.idempotencyKey,
			});

			if (existing) return { runId: existing, duplicate: true };
		}

		await db.insert(checkRuns).values({
			runId: input.runId,
			configId: input.configId,
			source: input.source,
			userId: input.userId,
			apiKeyId: input.apiKeyId ?? null,
			status: "held",
			engineState: null,
			idempotencyKey: input.idempotencyKey ?? null,
			dispatchAttempts: 0,
			lastDispatchError: input.reason,
		});

		return { runId: input.runId, duplicate: false };
	}

	/**
	 * Takes the oldest held run for hand-over, atomically: two flushes can never take the same one.
	 * SKIP LOCKED makes a second claimer move on to the next run instead of waiting.
	 */
	async claimNextHeld(): Promise<{
		runId: string;
		configId: string;
		source: string;
		userId: string;
		attempts: number;
	} | null> {
		const claimed = await db.execute<{
			run_id: string;
			config_id: string;
			source: string;
			user_id: string;
			dispatch_attempts: number;
		}>(sql`
			UPDATE check_runs
			SET status = 'dispatching', dispatch_attempts = dispatch_attempts + 1, updated_at = now()
			WHERE run_id = (
				SELECT run_id FROM check_runs
				WHERE status = 'held'
				ORDER BY submitted_at ASC
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING run_id, config_id, source, user_id, dispatch_attempts
		`);

		const row = claimed.rows[0];

		return row
			? { runId: row.run_id, configId: row.config_id, source: row.source, userId: row.user_id, attempts: row.dispatch_attempts }
			: null;
	}

	/** The engine accepted a held run: it is now queued like any other. */
	async markDispatched(runId: string) {
		await db
			.update(checkRuns)
			.set({ status: "queued", engineState: "PENDING", lastDispatchError: null, updatedAt: new Date() })
			.where(eq(checkRuns.runId, runId));
	}

	/** The engine could not take it after all: back to held, with why. */
	async returnToHeld(runId: string, reason: string) {
		await db
			.update(checkRuns)
			.set({ status: "held", lastDispatchError: reason, updatedAt: new Date() })
			.where(eq(checkRuns.runId, runId));
	}

	/** The engine looked at a held run and refused it: it will never run, so it ends here, with the reason. */
	async failHeld(runId: string, failure: { title: string; reason: string; detail: string }) {
		const now = new Date();

		await db
			.update(checkRuns)
			.set({
				status: "failed",
				error: failure.reason,
				errorTitle: failure.title,
				errorDetail: failure.detail,
				finishedAt: now,
				updatedAt: now,
			})
			.where(eq(checkRuns.runId, runId));
	}

	/**
	 * A backend that stopped in the middle of a hand-over leaves a run marked dispatching. Put such
	 * runs back to held (run once, at startup) so they are sent again; the engine treats a repeated
	 * run id as the same run, so this cannot start one twice.
	 */
	async releaseStuckDispatches() {
		const released = await db
			.update(checkRuns)
			.set({ status: "held", updatedAt: new Date() })
			.where(eq(checkRuns.status, "dispatching"))
			.returning({ runId: checkRuns.runId });

		return released.length;
	}

	async heldCount() {
		const [{ total }] = await db
			.select({ total: count() })
			.from(checkRuns)
			.where(inArray(checkRuns.status, WAITING_FOR_ENGINE));

		return Number(total);
	}

	/**
	 * Admins see every run. Everyone else sees only the ones they started, and a run
	 * that is not theirs is reported as missing rather than forbidden, so its
	 * existence is not disclosed either.
	 */
	private visibleTo(viewer: JobViewer) {
		return viewer.role === "admin" ? undefined : eq(checkRuns.userId, viewer.id);
	}

	/**
	 * Brings non-terminal runs up to date from the engine.
	 *
	 * Reads, not a background worker: nothing polls while nobody is looking, and the
	 * cost is one HTTP call per unfinished run on the page being viewed. If the engine
	 * cannot be reached the stored state is returned as it is -- an unreachable engine
	 * says nothing about the run, so it is never turned into a failure.
	 */
	private async refresh(rows: (typeof checkRuns.$inferSelect)[]) {
		const pending = rows.filter(
			row => !TERMINAL.includes(row.status as JobStatus) && !WAITING_FOR_ENGINE.includes(row.status),
		);

		await Promise.all(
			pending.map(async row => {
				const engine = await fetchEngineRun(row.runId);

				const [{ rows: resultRows, lastAt, firstAt }] = await db
					.select({
						rows: count(),
						lastAt: max(results.jobTimestamp),
						firstAt: min(results.jobTimestamp),
					})
					.from(results)
					.where(eq(results.jobId, `JOB_${row.runId}`));

				const hasResults = Number(resultRows) > 0;

				let status: JobStatus | null = engine ? (STATE_TO_STATUS[engine.state] ?? null) : null;
				let error: string | null = row.error;
				let errorTitle: string | null = row.errorTitle;
				let errorDetail: string | null = row.errorDetail;
				let jobStatus = row.jobStatus;

				if (engine?.state === "SUCCESS" && engine.result && typeof engine.result === "object") {
					jobStatus = engine.result.status ?? jobStatus;
				}

				if (engine?.state === "FAILURE") {
					error = engine.error ?? "The engine reported a failure but gave no reason.";
					errorTitle = engine.error_title ?? "Job failed";
					errorDetail = engine.error_detail ?? null;
				}

				if (engine?.state === "REVOKED") {
					error = "The run was cancelled before it finished.";
					errorTitle = "Run cancelled";
					errorDetail = `Engine state: ${engine.state}`;
				}

				// The engine's record expires; the results table does not. Rows under this run's
				// job id mean it ran, whatever the engine now says about it.
				if ((status === null || status === "queued") && hasResults) {
					status = "completed";
				}

				if (status === "queued" && !hasResults && Date.now() - row.submittedAt.getTime() > STALE_QUEUED_MS) {
					status = "failed";
					error = "The engine has no record of this run and nothing was written. It was never picked up.";
					errorTitle = "Run was never picked up";
					errorDetail = `Queued at ${row.submittedAt.toISOString()} and still queued after ${Math.round(STALE_QUEUED_MS / 3_600_000)} hours with no results written.`;
				}

				if (status === null || status === row.status) return;

				const now = new Date();

				// The engine's own clock when it has one. Result-row timestamps are the
				// job's START time, so using them for "finished" made durations a guess,
				// and "now" (the moment someone opened this page) made them worse.
				const engineResult = engine?.result && typeof engine.result === "object" ? engine.result : null;
				const engineStarted = asDate(engineResult?.started_at);
				const engineFinished = asDate(engineResult?.finished_at) ?? asDate(engine?.finished_at);

				const [updated] = await db
					.update(checkRuns)
					.set({
						status,
						engineState: engine?.state ?? row.engineState,
						jobStatus,
						error,
						errorTitle,
						errorDetail,
						startedAt: engineStarted ?? row.startedAt ?? (status === "queued" ? null : (firstAt ?? now)),
						finishedAt: TERMINAL.includes(status) ? (engineFinished ?? lastAt ?? now) : null,
						updatedAt: now,
					})
					.where(eq(checkRuns.runId, row.runId))
					.returning();

				if (updated) Object.assign(row, updated);
			}),
		);
	}

	/** Names for a page of config ids. Configs live in three tables, picked by prefix. */
	private async configNames(configIds: string[]) {
		const unique = [...new Set(configIds)];

		if (unique.length === 0) return new Map<string, string>();

		const [dbRows, fileRows, customRows] = await Promise.all([
			db
				.select({ id: dbBasedChecksConfig.configId, name: dbBasedChecksConfig.configName })
				.from(dbBasedChecksConfig)
				.where(inArray(dbBasedChecksConfig.configId, unique)),
			db
				.select({ id: fileBasedChecksConfig.configId, name: fileBasedChecksConfig.configName })
				.from(fileBasedChecksConfig)
				.where(inArray(fileBasedChecksConfig.configId, unique)),
			db
				.select({ id: customBusinessChecksConfig.checkId, name: customBusinessChecksConfig.checkName })
				.from(customBusinessChecksConfig)
				.where(inArray(customBusinessChecksConfig.checkId, unique)),
		]);

		return new Map([...dbRows, ...fileRows, ...customRows].map(row => [row.id, row.name]));
	}

	/** Names of the API keys behind a page of runs: id -> "name (dck_prefix)". */
	private async keyNames(keyIds: (string | null)[]) {
		const unique = [...new Set(keyIds.filter((id): id is string => Boolean(id)))];

		if (unique.length === 0) return new Map<string, string>();

		const keys = await db
			.select({ id: serviceApiKeys.id, name: serviceApiKeys.name, prefix: serviceApiKeys.keyPrefix })
			.from(serviceApiKeys)
			.where(inArray(serviceApiKeys.id, unique));

		return new Map(keys.map(key => [key.id, `${key.name} (dck_${key.prefix})`]));
	}

	/** The rows picture (see JobRows) for a set of runs, in one query. */
	private async rowPictures(runIds: string[]) {
		const out = new Map<string, JobRows>();

		if (runIds.length === 0) return out;

		const rows = await db
			.select({ jobId: results.jobId, total: ROWS_TOTAL_SQL.mapWith(Number), failed: ROWS_FAILED_SQL.mapWith(Number) })
			.from(results)
			.where(
				inArray(
					results.jobId,
					runIds.map(id => `JOB_${id}`),
				),
			)
			.groupBy(results.jobId);

		for (const row of rows) {
			// max() of nothing is NULL, which mapWith(Number) turns into NaN.
			out.set(
				row.jobId.replace(/^JOB_/, ""),
				toRows({ total: Number.isNaN(row.total) ? null : row.total, failed: Number.isNaN(row.failed) ? null : row.failed }),
			);
		}

		return out;
	}

	/** passed / failed / error / upstream_failed counts for a set of runs, in one query. */
	private async summaries(runIds: string[]) {
		const out = new Map<string, Record<string, number>>();

		if (runIds.length === 0) return out;

		const rows = await db
			.select({ jobId: results.jobId, status: results.checkStatus, n: count() })
			.from(results)
			.where(
				inArray(
					results.jobId,
					runIds.map(id => `JOB_${id}`),
				),
			)
			.groupBy(results.jobId, results.checkStatus);

		for (const row of rows) {
			const runId = row.jobId.replace(/^JOB_/, "");
			const entry = out.get(runId) ?? { passed: 0, failed: 0, error: 0, upstream_failed: 0 };

			entry[row.status] = Number(row.n);
			out.set(runId, entry);
		}

		return out;
	}

	async list(
		viewer: JobViewer,
		query: { page?: number; limit?: number; status?: JobStatus; configId?: string },
	) {
		const limit = query.limit ?? 20;
		const page = query.page ?? 1;

		const where = and(
			this.visibleTo(viewer),
			query.status
				? query.status === "held"
					? inArray(checkRuns.status, WAITING_FOR_ENGINE)
					: eq(checkRuns.status, query.status)
				: undefined,
			query.configId ? eq(checkRuns.configId, query.configId) : undefined,
		);

		// ONE round trip. The database is a network hop away (about 235 ms each), so what
		// this page waits for is how many sequential trips it makes, not how heavy the
		// query is. It used to make several in a row -- count, rows, engine refresh, then
		// names, counts, owners and keys -- which is where the wait came from. Everything a
		// row needs is joined or sub-selected here instead, and the total rides along as a
		// window count.
		const checkCounts = sql<Record<string, number> | null>`(
			SELECT jsonb_object_agg(s.check_status, s.n)
			FROM (
				SELECT ${results.checkStatus} AS check_status, count(*)::int AS n
				FROM ${results}
				WHERE ${results.jobId} = 'JOB_' || ${checkRuns.runId}
				GROUP BY ${results.checkStatus}
			) s
		)`;

		const rowPicture = sql<{ total: number | null; failed: number | null } | null>`(
			SELECT jsonb_build_object(
				'total', max(coalesce(${results.rowsTotal}, case when ${results.checkType} = 'custom_sql' and ${results.issueRows} ~ '^[0-9]+$' and ${results.passedRows} ~ '^[0-9]+$' then ${results.issueRows}::int + ${results.passedRows}::int end)),
				'failed', max(coalesce(${results.rowsFailed}, case when ${results.checkType} = 'custom_sql' and ${results.issueRows} ~ '^[0-9]+$' then ${results.issueRows}::int end))
			)
			FROM ${results}
			WHERE ${results.jobId} = 'JOB_' || ${checkRuns.runId}
		)`;

		const found = await db
			.select({
				run: getTableColumns(checkRuns),
				rowsPicture: rowPicture,
				total: sql<number>`count(*) OVER ()`.mapWith(Number),
				ownerName: usersTable.fullName,
				ownerRole: usersTable.role,
				keyName: serviceApiKeys.name,
				keyPrefix: serviceApiKeys.keyPrefix,
				configName: sql<string | null>`coalesce(${dbBasedChecksConfig.configName}, ${fileBasedChecksConfig.configName}, ${customBusinessChecksConfig.checkName})`,
				checks: checkCounts,
			})
			.from(checkRuns)
			.innerJoin(usersTable, eq(usersTable.id, checkRuns.userId))
			.leftJoin(serviceApiKeys, eq(serviceApiKeys.id, checkRuns.apiKeyId))
			.leftJoin(dbBasedChecksConfig, eq(dbBasedChecksConfig.configId, checkRuns.configId))
			.leftJoin(fileBasedChecksConfig, eq(fileBasedChecksConfig.configId, checkRuns.configId))
			.leftJoin(customBusinessChecksConfig, eq(customBusinessChecksConfig.checkId, checkRuns.configId))
			.where(where)
			.orderBy(desc(checkRuns.submittedAt))
			.limit(limit)
			.offset((page - 1) * limit);

		if (found.length === 0) {
			// A page past the end has no rows to carry the total on. Count only then.
			const [{ total }] = await db.select({ total: count() }).from(checkRuns).where(where);
			return Paginator.paginate({ limit: limit.toString(), page: page.toString() }, [], total);
		}

		const total = found[0]!.total;
		const rows = found.map(entry => entry.run);

		// Only unfinished runs need the engine. When there are none -- the usual case --
		// the request is already done. When there are, they are brought up to date and
		// the few that just finished are counted in one small extra query.
		const pending = rows.filter(
			row => !TERMINAL.includes(row.status as JobStatus) && !WAITING_FOR_ENGINE.includes(row.status),
		);
		const finishedNow = new Map<string, Record<string, number>>();
		const finishedRows = new Map<string, JobRows>();

		if (pending.length > 0) {
			await this.refresh(rows);

			const justFinished = pending.filter(row => TERMINAL.includes(row.status as JobStatus));

			if (justFinished.length > 0) {
				const ids = justFinished.map(row => row.runId);

				for (const [runId, entry] of await this.summaries(ids)) {
					finishedNow.set(runId, entry);
				}

				for (const [runId, entry] of await this.rowPictures(ids)) {
					finishedRows.set(runId, entry);
				}
			}
		}

		const empty = { passed: 0, failed: 0, error: 0, upstream_failed: 0 };

		const items = found.map((entry, index) => ({
			...rows[index]!,
			status: publicStatus(rows[index]!.status),
			configName: entry.configName ?? null,
			startedBy: { id: entry.run.userId, fullName: entry.ownerName, role: entry.ownerRole },
			// The credential, for runs started with an API key. A revoked key keeps its name
			// here: the run happened, and what matters is which key made it.
			startedWithKey: entry.keyName ? `${entry.keyName} (dck_${entry.keyPrefix})` : null,
			checks: finishedNow.get(entry.run.runId) ?? { ...empty, ...(entry.checks ?? {}) },
			// Checks and rows are different counts; see JobRows.
			rows: finishedRows.get(entry.run.runId) ?? toRows(entry.rowsPicture),
		}));

		return Paginator.paginate({ limit: limit.toString(), page: page.toString() }, items, total);
	}

	async get(viewer: JobViewer, runId: string) {
		const [row] = await db
			.select()
			.from(checkRuns)
			.where(and(eq(checkRuns.runId, runId), this.visibleTo(viewer)))
			.limit(1);

		if (!row) {
			throw new ErrorResponse("Job not found", 404);
		}

		await this.refresh([row]);

		const [names, counts, rowPictures, owner, checks, keyNames] = await Promise.all([
			this.configNames([row.configId]),
			this.summaries([row.runId]),
			this.rowPictures([row.runId]),
			db
				.select({ id: usersTable.id, fullName: usersTable.fullName, role: usersTable.role })
				.from(usersTable)
				.where(eq(usersTable.id, row.userId))
				.limit(1),
			db
				.select({
					checkExecutionId: results.checkExecutionId,
					checkId: results.checkId,
					checkName: results.checkName,
					field: results.field,
					checkStatus: results.checkStatus,
					criticality: results.criticality,
					issueRows: results.issueRows,
					passedRows: results.passedRows,
					failureReason: results.failureReason,
					issueStatus: results.issueStatus,
				})
				.from(results)
				.where(eq(results.jobId, `JOB_${row.runId}`))
				.orderBy(asc(results.checkExecutionId)),
			this.keyNames([row.apiKeyId]),
		]);

		return {
			...row,
			status: publicStatus(row.status),
			configName: names.get(row.configId) ?? null,
			startedBy: owner[0] ?? null,
			startedWithKey: row.apiKeyId ? (keyNames.get(row.apiKeyId) ?? null) : null,
			checks: counts.get(row.runId) ?? { passed: 0, failed: 0, error: 0, upstream_failed: 0 },
			rows: rowPictures.get(row.runId) ?? NO_ROWS,
			results: checks,
		};
	}
}

