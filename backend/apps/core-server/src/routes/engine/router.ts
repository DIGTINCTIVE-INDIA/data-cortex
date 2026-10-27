import { registry } from "@/container.js";
import { AuthMiddlewares } from "@/middlewares/auth-middleware.js";
import { engineOnly } from "@/middlewares/engine-middleware.js";
import { canView } from "@/middlewares/role-middleware.js";
import { engineState } from "@/services/engine-state.js";
import { flushHeldRuns } from "@/services/run-dispatcher.js";
import { logger } from "@repo/logger";
import { Router } from "express";

export function createEngineRouter() {
	const router = Router();

	// --- engine -> backend. No user session; the shared secret instead. Fire and forget on the
	// engine's side, so this answers at once and does the work after replying.
	router.post("/started", engineOnly(), (_req, res) => {
		logger.info("The engine announced that it has started");
		engineState.markUp("the engine announced that it started");
		void flushHeldRuns("the engine announced that it started");

		res.status(202).json({ ok: true });
	});

	// --- a person looking: what the backend believes about the engine.
	router.get("/state", AuthMiddlewares.validateAccessToken, canView(), async (_req, res) => {
		const { status, since, reason } = engineState.get();

		res.json({ status, since, reason, heldRuns: await registry.jobsRepo.heldCount() });
	});

	return router;
}
