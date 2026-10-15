import { canView, onlyAdmin } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { LibrariesController } from "./libraries.controller.js";

/**
 * @description Router for managing application configuration libraries.
 * Provides endpoints for dynamic configuration data such as:
 * - Workstreams
 * - Downstreams
 * - Data Sources
 *
 * @remarks
 * Refer to `libraries.schemas.ts` for data structure definitions.
 *
 * @returns {Router} Express router instance for libraries module
 */
export function createLibrariesRouter(): Router {
	const router = Router();

	router.get("/qc-tags/all", canView(), LibrariesController.getAllQcTags);
	router.get("/dq-checks/sources", canView(), LibrariesController.getDqCheckSources);

	router.get("/qc-tags/:type", canView(), LibrariesController.getQcTagsByType);

	router.post("/qc-tags/create", onlyAdmin(), LibrariesController.addQcTag);

	router.patch("/qc-tags/update", onlyAdmin(), LibrariesController.updateQcTag);

	router.patch("/qc-tags/toggle", onlyAdmin(), LibrariesController.toggleQcTag);

	return router;
}
