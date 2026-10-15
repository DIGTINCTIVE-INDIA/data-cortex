import { AuthMiddlewares } from "@/middlewares/auth-middleware.js";
import { canConfigure } from "@/middlewares/role-middleware.js";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";
import { type NextFunction, type Request, type Response, Router } from "express";

import { NotificationsController } from "./notifications.controller.js";

/**
 * The engine callback cannot use the user session -- dc-engine acts as itself,
 * not as a person. A shared secret in a header is the minimum that stops anyone
 * on the network from forging "this check failed" and mailing your whole
 * distribution list.
 *
 * Read per request rather than at module load, so a deployment that has not set
 * it still boots; only this one route refuses.
 */
const engineOnly = () => (req: Request, _res: Response, next: NextFunction) => {
	const expected = process.env.DC_ENGINE_CALLBACK_SECRET;

	if (!expected) {
		logger.error("Engine callback rejected: DC_ENGINE_CALLBACK_SECRET is not set on the server");
		throw new ErrorResponse("Engine callback is not configured", 503);
	}

	const provided = req.header("x-dc-engine-secret");

	if (!provided || provided !== expected) {
		logger.warn("Engine callback rejected: bad or missing secret", { ip: req.ip });
		throw new ErrorResponse("Unauthorized", 401);
	}

	next();
};

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
