import { logger } from "@repo/logger";

/**
 * What the backend believes about the engine. One piece of memory, owned by the backend alone.
 *
 * The rules, and who may change it:
 *   down  only the backend decides this, when handing a run to the engine fails (or when its
 *         check at startup finds the engine unreachable). The engine never says it is going down.
 *   up    the engine pinging "I have started" (or a developer running the same ping by hand), or
 *         the backend's own check at startup finding the engine healthy.
 *
 * Nothing polls. Once it is down it stays down until one of those two things happens, and while
 * it is down new runs are held rather than sent. The state lives in this process's memory, so it
 * assumes one backend process; after a restart it is re-learned by the startup check.
 */
export type EngineStatus = "up" | "down";

let status: EngineStatus = "down";
let since = new Date();
let reason = "not checked yet";

export const engineState = {
	get() {
		return { status, since, reason };
	},

	isUp() {
		return status === "up";
	},

	/** The backend's own decision. Returns true when this changed the state. */
	markDown(why: string) {
		const changed = status !== "down";

		status = "down";
		reason = why;

		if (changed) {
			since = new Date();
			logger.warn(`Engine is DOWN: ${why}. New runs will be held until the engine says it is up.`);
		}

		return changed;
	},

	/** The engine said so, or the startup check found it healthy. Returns true when this changed the state. */
	markUp(source: string) {
		const changed = status !== "up";

		status = "up";
		reason = source;

		if (changed) {
			since = new Date();
			logger.info(`Engine is UP (${source}). Held runs will be sent.`);
		}

		return changed;
	},
};
