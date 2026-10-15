import { registry } from "@/container.js";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";

import { runCheckValidator } from "./run.validator.js";

type EngineRunRequest = {
	config_id: string;
	user_id: string;
	idempotency_key?: string;

	/**
	 * False means "nobody has asked to be emailed about anything", so the engine can
	 * skip the failure callback entirely and save the round trip. It is deliberately
	 * coarse: the precise answer needs the config row, and every dispatch would then
	 * pay a SELECT to save a callback on the rarer failure path.
	 */
	notify: boolean;
};

type EngineRunAccepted = {
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

/**
 * Hands the run to dc-engine over HTTP. dc-engine is the only runner.
 *
 * The engine queues the run on Celery and answers in milliseconds with a run id --
 * it does not wait for the check to finish. A 202 here means "accepted", never
 * "passed". Callers poll `GET /v1/runs/{run_id}` on the engine for the outcome.
 *
 * There is deliberately no local fallback: the backend no longer spawns
 * subprocesses. If the engine cannot take the run, the request fails and the caller
 * is told why -- better than silently running somewhere else and reporting success.
 *
 * DC_ENGINE_URL is read here rather than at module load, so a deployment that has
 * not set it still boots and serves every other route; only this endpoint fails.
 */
async function submitToEngine(payload: EngineRunRequest): Promise<EngineRunAccepted> {
	const engineUrl = process.env.DC_ENGINE_URL ?? DEFAULT_ENGINE_URL;
	const endpoint = `${engineUrl}/v1/runs`;

	let response: Response;

	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5000),
		});
	} catch (error) {
		// Covers connection refused, DNS failure and the 5s timeout above.
		logger.error("Check engine could not be reached -- the check was NOT started", { endpoint, error });
		throw new ErrorResponse("The check engine is unreachable. The check was not started.", 503);
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		logger.error(`Check engine rejected the run (HTTP ${response.status}) -- the check was NOT started`, {
			endpoint,
			body,
		});

		switch (response.status) {
			case 404:
				throw new ErrorResponse("The check engine has no run endpoint at this address. The check was not started.", 502);

			case 422:
				throw new ErrorResponse("The check engine rejected the run payload. The check was not started.", 502);

			default:
				throw new ErrorResponse(
					`The check engine rejected the run (HTTP ${response.status}). The check was not started.`,
					502,
				);
		}
	}

	const accepted = (await response.json().catch(() => null)) as EngineRunAccepted | null;

	if (!accepted?.run_id) {
		logger.error("Check engine accepted the run but returned no run_id", { endpoint, accepted });
		throw new ErrorResponse("The check engine did not return a run id. The run may or may not have started.", 502);
	}

	return accepted;
}

export class QCRunController {
	static runCheck = catchAsync(async (req, res) => {
		const { configId, source, idempotencyKey } = await validate(runCheckValidator, req.body);

		// Taken from the session, never from the request body. The engine rejects a run
		// at execution time if this is not a real user.
		const userId = req.user.id;

		// Reads the in-memory rule cache, not the database.
		const notify = await registry.notificationsRepo.anyRulesEnabled();

		const accepted = await submitToEngine({
			config_id: configId,
			user_id: userId,
			notify,
			...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
		});

		const isDuplicate = accepted.duplicate === true;

		// Keep a durable record for the Jobs page. The engine has accepted the run, so a
		// bookkeeping failure here must not turn into a failed request: the check IS
		// running. Re-recording a duplicate is a no-op.
		try {
			await registry.jobsRepo.record({ runId: accepted.run_id, configId, source, userId, apiKeyId: req.apiKeyId });
		} catch (error) {
			logger.error("Could not record the run for the Jobs page", { runId: accepted.run_id, error });
		}

		logger.info(
			`Check ${isDuplicate ? "already queued" : "queued"} on engine: config=${configId} source=${source} run=${accepted.run_id} state=${accepted.state}`,
		);

		return res.status(202).json(
			jsonResponse("mutation", {
				data: {
					runId: accepted.run_id,
					state: accepted.state,
					duplicate: isDuplicate,
				},
				// The engine returns the original run when an idempotency key repeats, so
				// say so rather than implying a second run was started.
				toast: { message: isDuplicate ? "Check is already running" : "Check queued" },
			}),
		);
	});
}
