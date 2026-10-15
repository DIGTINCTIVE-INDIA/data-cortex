import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { createSSORouter } from "./sso/sso.routes.js";

export function createAuthRouter() {
	const router = Router();

	router.use("/sso", createSSORouter());
	router.post("/logout", AuthController.logout);
	router.get("/token", AuthController.getToken);

	return router;
}
