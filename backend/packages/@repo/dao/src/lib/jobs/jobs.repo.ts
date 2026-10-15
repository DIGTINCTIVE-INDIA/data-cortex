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

export type JobStatus = "queued" | "running" | "completed" | "failed";

const TERMINAL: JobStatus[] = ["completed", "failed"];

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
		const pending = rows.filter(row => !TERMINAL.includes(row.status as JobStatus));

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
				let jobStatus = row.jobStatus;

				if (engine?.state === "SUCCESS" && engine.result && typeof engine.result === "object") {
					jobStatus = engine.result.status ?? jobStatus;
				}

				if (engine?.state === "FAILURE") {
					error = engine.error ?? "The job failed";
				}

				if (engine?.state === "REVOKED") {
					error = "The run was cancelled";
				}

				// The engine's record expires; the results table does not. Rows under this run's
				// job id mean it ran, whatever the engine now says about it.
				if ((status === null || status === "queued") && hasResults) {
					status = "completed";
				}

				if (status === "queued" && !hasResults && Date.now() - row.submittedAt.getTime() > STALE_QUEUED_MS) {
					status = "failed";
					error = "The engine has no record of this run and nothing was written. It was never picked up.";
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
			query.status ? eq(checkRuns.status, query.status) : undefined,
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

		const found = await db
			.select({
				run: getTableColumns(checkRuns),
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
		const pending = rows.filter(row => !TERMINAL.includes(row.status as JobStatus));
		const finishedNow = new Map<string, Record<string, number>>();

		if (pending.length > 0) {
			await this.refresh(rows);

			const justFinished = pending.filter(row => TERMINAL.includes(row.status as JobStatus));

			if (justFinished.length > 0) {
				for (const [runId, entry] of await this.summaries(justFinished.map(row => row.runId))) {
					finishedNow.set(runId, entry);
				}
			}
		}

		const empty = { passed: 0, failed: 0, error: 0, upstream_failed: 0 };

		const items = found.map((entry, index) => ({
			...rows[index]!,
			configName: entry.configName ?? null,
			startedBy: { id: entry.run.userId, fullName: entry.ownerName, role: entry.ownerRole },
			// The credential, for runs started with an API key. A revoked key keeps its name
			// here: the run happened, and what matters is which key made it.
			startedWithKey: entry.keyName ? `${entry.keyName} (dck_${entry.keyPrefix})` : null,
			checks: finishedNow.get(entry.run.runId) ?? { ...empty, ...(entry.checks ?? {}) },
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

		const [names, counts, owner, checks, keyNames] = await Promise.all([
			this.configNames([row.configId]),
			this.summaries([row.runId]),
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
			configName: names.get(row.configId) ?? null,
			startedBy: owner[0] ?? null,
			startedWithKey: row.apiKeyId ? (keyNames.get(row.apiKeyId) ?? null) : null,
			checks: counts.get(row.runId) ?? { passed: 0, failed: 0, error: 0, upstream_failed: 0 },
			results: checks,
		};
	}
}

