import { registry } from "@/container.js";
import {
	configVersion,
	EngineRejectedError,
	EngineUnavailableError,
	submitToEngine,
	type EngineRunAccepted,
} from "@/services/engine-client.js";
import { engineState } from "@/services/engine-state.js";
import { customBusinessChecksConfig, db, dbBasedChecksConfig, eq, fileBasedChecksConfig } from "@repo/db";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";
import { randomUUID } from "node:crypto";

import { runCheckValidator } from "./run.validator.js";

/** Whether the check is switched on. An analyst is not shown a switched-off check, so they may not start one either. */
async function configIsEnabled(configId: string): Promise<boolean> {
	const [config] = configId.startsWith("FBC")
		? await db.select({ enabled: fileBasedChecksConfig.enabled }).from(fileBasedChecksConfig).where(eq(fileBasedChecksConfig.configId, configId)).limit(1)
		: configId.startsWith("CB")
			? await db.select({ enabled: customBusinessChecksConfig.enabled }).from(customBusinessChecksConfig).where(eq(customBusinessChecksConfig.checkId, configId)).limit(1)
			: await db.select({ enabled: dbBasedChecksConfig.enabled }).from(dbBasedChecksConfig).where(eq(dbBasedChecksConfig.configId, configId)).limit(1);

	return Boolean(config?.enabled);
}

export class QCRunController {
	static runCheck = catchAsync(async (req, res) => {
		const { configId, source, idempotencyKey } = await validate(runCheckValidator, req.body);

		// Taken from the session, never from the request body. The engine rejects a run
		// at execution time if this is not a real user.
		const userId = req.user.id;

		if (req.user.role === "analyst" && !(await configIsEnabled(configId))) {
			throw new ErrorResponse("Check not found", 404);
		}

		// Reads the in-memory rule cache, not the database.
		const notify = await registry.notificationsRepo.anyRulesEnabled();

		// A fingerprint of the check as it is NOW, so a repeated key stops meaning "the same run"
		// the moment the check or anything it uses is edited.
		const engineKey = idempotencyKey ? `${idempotencyKey}@${await configVersion(configId)}` : undefined;

		// The same click repeated while this check is already held (or being handed over) is the same
		// run -- whether the engine is still down or has just come back and the held run has not
		// reached it yet. Without this, a click in that moment would start a second run beside it.
		if (engineKey) {
			const waiting = await registry.jobsRepo.findWaiting({ userId, configId, idempotencyKey: engineKey });

			if (waiting) {
				return res.status(202).json(
					jsonResponse("mutation", {
						data: { runId: waiting, state: "HELD", duplicate: true, held: true },
						toast: { message: "Check is already held" },
					}),
				);
			}
		}

		// Chosen here, so the run has ONE id whether it goes to the engine now or is held and sent
		// later. The engine uses it as given.
		const runId = randomUUID();

		let accepted: EngineRunAccepted | null = null;
		let heldBecause = "";

		if (!engineState.isUp()) {
			// The backend already knows the engine is down, so nothing is sent: the run is held.
			heldBecause = `The engine is marked down (${engineState.get().reason}).`;
		} else {
			try {
				accepted = await submitToEngine({
					config_id: configId,
					user_id: userId,
					notify,
					run_id: runId,
					...(engineKey ? { idempotency_key: engineKey } : {}),
				});
			} catch (error) {
				if (error instanceof EngineUnavailableError) {
					// The backend's own decision. From here new runs are held until the engine says it is up.
					engineState.markDown(error.message);
					heldBecause = error.message;
				} else if (error instanceof EngineRejectedError) {
					throw new ErrorResponse(error.message, 502);
				} else {
					throw error;
				}
			}
		}

		if (!accepted) {
			const held = await registry.jobsRepo.hold({
				runId,
				configId,
				source,
				userId,
				apiKeyId: req.apiKeyId,
				idempotencyKey: engineKey,
				reason: heldBecause,
			});

			logger.warn(`Check held, engine not available: config=${configId} source=${source} run=${held.runId}: ${heldBecause}`);

			return res.status(202).json(
				jsonResponse("mutation", {
					data: { runId: held.runId, state: "HELD", duplicate: held.duplicate, held: true },
					toast: {
						message: held.duplicate
							? "Check is already held"
							: "The engine is not available. The check is held and will start by itself when the engine is back.",
					},
				}),
			);
		}

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
