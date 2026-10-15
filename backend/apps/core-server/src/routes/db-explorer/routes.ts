import { canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { DBExplorerController } from "./db-explorer.controller.js";

export function createDbExplorerRouter(): Router {
	const router = Router();

	// Open to every signed-in role: it only runs read-only SELECTs, validated server-side, in a
	// read-only transaction with a row cap. A service identity is still refused (canView
	// excludes it).
	router.post("/execute-query", canView(), DBExplorerController.executeQuery);

	return router;
}
