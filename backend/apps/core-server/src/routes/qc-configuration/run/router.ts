import { canRun } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { QCRunController } from "./run.controller.js";

export function createRunCheckRouter() {
	const router = Router();

	// Runs one already-configured check through the engine.
	router.post("/", canRun(), QCRunController.runCheck);

	return router;
}
