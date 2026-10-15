import { canRun, canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";

import { JobsController } from "./jobs.controller.js";

/**
 * Mounted behind validateRunAccess, so a person's token OR a service user's API key gets
 * here. The two routes then differ on purpose:
 *
 *   list   people only -- a service user has no business browsing runs
 *   detail anyone who may run a check, so a service can poll the run it started
 *
 * Either way the repo scopes the answer: admins see everything, everyone else only the
 * runs they started.
 */
export function createJobsRouter() {
	const router = Router();

	router.get("/", canView(), JobsController.list);
	router.get("/:runId", canRun(), JobsController.get);

	return router;
}
