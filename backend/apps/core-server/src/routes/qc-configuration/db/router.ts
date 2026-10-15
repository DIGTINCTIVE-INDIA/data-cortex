import { canConfigure, canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { QCConfDBController } from "./db.controller.js";

export function createDBCheckRouter() {
	const router = Router();

	// QC Database Check Configurations
	router.post("/create-check", canConfigure(), QCConfDBController.createDBCheckConfig);
	router.patch("/update-check", canConfigure(), QCConfDBController.updateDBCheckConfig);
	router.patch("/toggle-check", canConfigure(), QCConfDBController.toggleDBCheckConfig);
	router.get("/list-checks", canView(), QCConfDBController.listDBCheckConfigs);

	// Field rules for a db-based check, set after the check itself exists.
	router.post("/set-columns", canConfigure(), QCConfDBController.setDBCheckColumns);
	router.get("/list-columns", canView(), QCConfDBController.listDBCheckColumns);

	return router;
}
