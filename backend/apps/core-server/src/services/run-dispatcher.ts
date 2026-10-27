import { registry } from "@/container.js";
import { logger } from "@repo/logger";

import { EngineRejectedError, EngineUnavailableError, probeEngine, submitToEngine } from "./engine-client.js";
import { engineState } from "./engine-state.js";

/**
 * Hands the runs the backend held (the engine could not take them) over to the engine.
 *
 * It runs when -- and only when -- something tells the backend the engine is reachable: the engine's
 * "I have started" ping, or the backend's own check as it starts. There is NO timer, no retry loop
 * and no polling anywhere here. The loop below is a drain, not a poll: it takes held runs one by one
 * until there are none left or a hand-over fails, and then it stops and waits to be called again.
 */
let flushing = false;
let flushAgain = false;

export async function flushHeldRuns(why: string): Promise<void> {
	// A flush already running will pick up whatever arrived; do not run two at once.
	if (flushing) {
		flushAgain = true;
		return;
	}

	flushing = true;

	try {
		let sent = 0;

		while (engineState.isUp()) {
			const run = await registry.jobsRepo.claimNextHeld();

			if (!run) break;

			const outcome = await handOver(run);

			if (outcome === "sent") sent += 1;
			if (outcome === "stop") break;
		}

		if (sent > 0) logger.info(`Handed ${sent} held run(s) to the engine (${why}).`);
	} catch (error) {
		logger.error("Flushing held runs failed; they stay held", { error });
	} finally {
		flushing = false;

		if (flushAgain) {
			flushAgain = false;
			void flushHeldRuns("a ping arrived during the previous flush");
		}
	}
}

type HandOver = "sent" | "rejected" | "stop";

async function handOver(run: { runId: string; configId: string; userId: string }): Promise<HandOver> {
	try {
		const notify = await registry.notificationsRepo.anyRulesEnabled();

		// The run keeps the id it was given when it was held. The engine treats a repeated id as the
		// same run, so a hand-over repeated after a crash cannot start it twice.
		await submitToEngine({ config_id: run.configId, user_id: run.userId, notify, run_id: run.runId });
		await registry.jobsRepo.markDispatched(run.runId);

		return "sent";
	} catch (error) {
		if (error instanceof EngineUnavailableError) {
			// The backend's own decision: the engine is down again. The rest stay held.
			engineState.markDown(error.message);
			await registry.jobsRepo.returnToHeld(run.runId, error.message);

			return "stop";
		}

		if (error instanceof EngineRejectedError) {
			// The engine looked at it and said no: holding would never help, so it ends here, with the reason.
			await registry.jobsRepo.failHeld(run.runId, {
				title: "The engine would not accept this run",
				reason: error.message,
				detail: `HTTP ${error.status}\n${error.body}`.trim(),
			});

			return "rejected";
		}

		// Our own failure (the database, say), not the engine's: keep the run, do not call the engine down.
		logger.error(`Could not hand held run ${run.runId} to the engine`, { error });
		await registry.jobsRepo.returnToHeld(run.runId, error instanceof Error ? error.message : String(error)).catch(() => undefined);

		return "stop";
	}
}

/**
 * Run once as the backend starts. It looks at the engine ONE time to learn the state, puts back any
 * hand-over a previous backend was in the middle of, and, if the engine is healthy, sends what is held.
 */
export async function checkEngineAtStartup(): Promise<void> {
	const found = await probeEngine();

	if (found.up) engineState.markUp("startup check found it healthy");
	else engineState.markDown(`startup check: ${found.detail}`);

	try {
		const released = await registry.jobsRepo.releaseStuckDispatches();
		const held = await registry.jobsRepo.heldCount();

		if (released > 0) logger.info(`Put back ${released} hand-over(s) a previous backend did not finish.`);
		logger.info(`  held runs     : ${held}${held > 0 && !found.up ? " (waiting for the engine to say it is up)" : ""}`);
	} catch (error) {
		logger.warn("Could not read the held runs at startup", { error });
		return;
	}

	if (found.up) void flushHeldRuns("backend started and the engine is up");
}
