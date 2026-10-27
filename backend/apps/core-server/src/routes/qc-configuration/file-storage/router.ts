import { canConfigure, canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { QCConfFileStorageController } from "./file-storage.controller.js";

export function createFileStorageCheckRouter() {
	const router = Router();

	router.post("/get-schema", canConfigure(), QCConfFileStorageController.getFileStorageCheckSchema);
	router.post("/create-check", canConfigure(), QCConfFileStorageController.createFileStorageCheckConfig);
	router.patch("/update-check", canConfigure(), QCConfFileStorageController.updateFileStorageCheckConfig);
	router.patch("/toggle-check", canConfigure(), QCConfFileStorageController.toggleFileStorageCheckConfig);
	router.get("/list-columns", canView(), QCConfFileStorageController.listFileStorageCheckColumns);
	router.get("/list-checks", canView(), QCConfFileStorageController.listFileStorageCheckConfigs);

	return router;
}
