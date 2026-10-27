import {
	customBusinessChecksConfig,
	databaseConnection,
	db,
	dbBasedChecksConfig,
	eq,
	fileBasedChecksConfig,
	fileConnection,
	inArray,
	traditionalConfigDetails,
} from "@repo/db";
import { logger } from "@repo/logger";
import { createHash } from "node:crypto";

export type EngineRunRequest = {
	config_id: string;
	user_id: string;
	idempotency_key?: string;

	/**
	 * The id the run will have, chosen here. The engine uses it as given and treats a repeat of
	 * the same id as the same run, so a run held by the backend keeps ONE id from the click to
	 * its result, and handing it over twice (after a crash, say) cannot start it twice.
	 */
	run_id?: string;

	/**
	 * False means "nobody has asked to be emailed about anything", so the engine can
	 * skip the failure callback entirely and save the round trip. It is deliberately
	 * coarse: the precise answer needs the config row, and every dispatch would then
	 * pay a SELECT to save a callback on the rarer failure path.
	 */
	notify: boolean;
};

export type EngineRunAccepted = {
	run_id: string;
	state: string;
	submitted_at: number;
	duplicate?: boolean;
};

/**
 * Default engine address.
 *
 * 127.0.0.1 rather than localhost on purpose: dc-engine binds IPv4 only, while
 * "localhost" resolves to ::1 first on Windows, which fails with ECONNREFUSED on
 * the IPv6 address before anything reaches the engine.
 */
const DEFAULT_ENGINE_URL = "http://127.0.0.1:8000";

const engineUrl = () => process.env.DC_ENGINE_URL ?? DEFAULT_ENGINE_URL;

/**
 * The engine could not take the run right now: nothing answered, it timed out, or it said it
 * is unavailable (502/503/504 -- for example its queue is down). The run is not wrong; it should
 * be held and handed over later.
 */
export class EngineUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EngineUnavailableError";
	}
}

/** The engine looked at the run and refused it (unknown config, bad payload). Holding would not help. */
export class EngineRejectedError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: string,
	) {
		super(message);
		this.name = "EngineRejectedError";
	}
}

/**
 * Hands the run to dc-engine over HTTP. dc-engine is the only runner.
 *
 * The engine queues the run on Celery and answers in milliseconds with a run id --
 * it does not wait for the check to finish. A 202 here means "accepted", never
 * "passed". Callers poll `GET /v1/runs/{run_id}` on the engine for the outcome.
 *
 * Throws EngineUnavailableError when the engine cannot be reached or says it is unavailable, and
 * EngineRejectedError when it answers and refuses. The caller decides what each means; this never
 * runs anything anywhere else.
 *
 * DC_ENGINE_URL is read here rather than at module load, so a deployment that has not set
 * it still boots and serves every other route.
 */
export async function submitToEngine(payload: EngineRunRequest): Promise<EngineRunAccepted> {
	const endpoint = `${engineUrl()}/v1/runs`;

	let response: Response;

	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5000),
		});
	} catch (error) {
		// Connection refused, DNS failure and the 5s timeout above.
		throw new EngineUnavailableError(`The engine could not be reached at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "");

		if ([502, 503, 504].includes(response.status)) {
			throw new EngineUnavailableError(`The engine answered ${response.status}: ${body.slice(0, 300) || "unavailable"}`);
		}

		logger.error(`Check engine rejected the run (HTTP ${response.status})`, { endpoint, body });

		throw new EngineRejectedError(
			response.status === 404
				? "The check engine has no run endpoint at this address. The check was not started."
				: response.status === 422
					? "The check engine rejected the run payload. The check was not started."
					: `The check engine rejected the run (HTTP ${response.status}). The check was not started.`,
			response.status,
			body,
		);
	}

	const accepted = (await response.json().catch(() => null)) as EngineRunAccepted | null;

	if (!accepted?.run_id) {
		throw new EngineRejectedError("The check engine did not return a run id. The run may or may not have started.", 502, "");
	}

	return accepted;
}

/**
 * One look at the engine's health. Used at startup, and nowhere on a timer: the backend decides the
 * engine is down when a hand-over fails and decides it is up when the engine says so (or at
 * startup, here).
 */
export async function probeEngine(): Promise<{ up: boolean; detail: string }> {
	try {
		const response = await fetch(`${engineUrl()}/health`, { signal: AbortSignal.timeout(3000) });
		const body = (await response.json().catch(() => null)) as {
			status?: string;
			broker?: string;
			idempotency_store?: string;
		} | null;

		// The engine answers 200 even when its queue is down and says so in the body, so "up"
		// means the queue and the idempotency store are both reported up, not just that it answered.
		if (response.ok && body?.status === "ok" && body.broker === "up" && body.idempotency_store === "up") {
			return { up: true, detail: "healthy" };
		}

		return {
			up: false,
			detail: `answered ${response.status}; queue ${body?.broker ?? "unknown"}, idempotency store ${body?.idempotency_store ?? "unknown"}`,
		};
	} catch (error) {
		return { up: false, detail: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * A fingerprint of everything a run depends on: the check's configuration, its field
 * rules, and the source and target connections (credentials included, so a changed
 * password counts). It goes into the idempotency key, so a repeated key stops meaning
 * "the same run" the moment the check or anything it uses is edited -- otherwise a retry
 * after fixing a bad path or connection would be answered with the failed run it was
 * meant to replace.
 *
 * Content, not timestamps: not every edit path bumps `updated_at`.
 */
export async function configVersion(configId: string): Promise<string> {
	const [config] = configId.startsWith("FBC")
		? await db.select().from(fileBasedChecksConfig).where(eq(fileBasedChecksConfig.configId, configId)).limit(1)
		: configId.startsWith("CB")
			? await db.select().from(customBusinessChecksConfig).where(eq(customBusinessChecksConfig.checkId, configId)).limit(1)
			: await db.select().from(dbBasedChecksConfig).where(eq(dbBasedChecksConfig.configId, configId)).limit(1);

	if (!config) return "none";

	const connectionIds = Object.entries(config)
		.filter(([key, value]) => /ConnectionId$/.test(key) && typeof value === "string")
		.map(([, value]) => value as string);

	const [rules, dbConnections, fileConnections] = await Promise.all([
		configId.startsWith("CB")
			? Promise.resolve([])
			: db.select().from(traditionalConfigDetails).where(eq(traditionalConfigDetails.configId, configId)),
		connectionIds.length ? db.select().from(databaseConnection).where(inArray(databaseConnection.connectionId, connectionIds)) : [],
		connectionIds.length ? db.select().from(fileConnection).where(inArray(fileConnection.connectionId, connectionIds)) : [],
	]);

	const byKey = <T extends object>(rows: T[], key: keyof T) => [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));

	return createHash("sha256")
		.update(
			JSON.stringify([
				config,
				byKey(rules, "tcReqId"),
				byKey(dbConnections, "connectionId"),
				byKey(fileConnections, "connectionId"),
			]),
		)
		.digest("hex")
		.slice(0, 16);
}
