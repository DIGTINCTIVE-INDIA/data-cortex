import { AuthMiddlewares } from "@/middlewares/auth-middleware.js";
import { engineOnly } from "@/middlewares/engine-middleware.js";
import { canConfigure } from "@/middlewares/role-middleware.js";
import { Router } from "express";

import { NotificationsController } from "./notifications.controller.js";

export function createNotificationsRouter() {
	const router = Router();

	// --- engine -> backend. No user session; shared secret instead.
	router.post("/events/check-failed", engineOnly(), NotificationsController.checkFailed);

	// --- everything else is an admin acting through the UI
	router.get("/rules", AuthMiddlewares.validateAccessToken, canConfigure(), NotificationsController.listRules);
	router.post("/rules", AuthMiddlewares.validateAccessToken, canConfigure(), NotificationsController.createRule);
	router.patch("/rules", AuthMiddlewares.validateAccessToken, canConfigure(), NotificationsController.updateRule);
	router.patch("/rules/toggle", AuthMiddlewares.validateAccessToken, canConfigure(), NotificationsController.toggleRule);
	router.delete("/rules", AuthMiddlewares.validateAccessToken, canConfigure(), NotificationsController.deleteRule);

	router.post("/test-email", AuthMiddlewares.validateAccessToken, canConfigure(), NotificationsController.sendTestEmail);

	return router;
}
