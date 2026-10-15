import { canConfigure, canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { FileStorageController } from "./fileStorage.controller.js";

export function createFileStorageConnectionsRouter() {
	const router = Router();

	router.get("/list", canView(), FileStorageController.getConnectionsList);
	router.post("/add", canConfigure(), FileStorageController.addConnection);
	router.patch("/update", canConfigure(), FileStorageController.updateConnection);
	router.patch("/toggle", canConfigure(), FileStorageController.toggleConnection);

	return router;
}
