import { canConfigure, canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { DBController } from "./db.controller.js";

export function createDbConnectionsRouter() {
	const router = Router();

	router.get("/list", canView(), DBController.getConnectionsList);
	router.post("/add", canConfigure(), DBController.addConnection);
	router.patch("/update", canConfigure(), DBController.updateConnection);
	router.patch("/toggle", canConfigure(), DBController.toggleConnection);

	router.get("/tables", canConfigure(), DBController.getConnectionTables);
	router.get("/columns", canConfigure(), DBController.getConnectionColumns);

	return router;
}
