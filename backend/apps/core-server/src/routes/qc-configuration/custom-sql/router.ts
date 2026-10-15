import { canConfigure, canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { QCConfCustomSqlController } from "./custom-sql.controller.js";

export function createCustomSqlCheckRouter() {
	const router = Router();

	// QC Custom SQL Check Configurations
	router.post("/validate-query", canConfigure(), QCConfCustomSqlController.validateCustomSqlCheckQuery);
	router.post("/create-check", canConfigure(), QCConfCustomSqlController.createCustomSqlCheckConfig);
	router.patch("/update-check", canConfigure(), QCConfCustomSqlController.updateCustomSqlCheckConfig);
	router.patch("/toggle-check", canConfigure(), QCConfCustomSqlController.toggleCustomSqlCheckConfig);
	router.get("/list-checks", canView(), QCConfCustomSqlController.listCustomSqlCheckConfigs);
	router.get("/schema", canView(), QCConfCustomSqlController.getCustomSqlEditorSchema);

	return router;
}
