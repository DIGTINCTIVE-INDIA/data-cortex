import { Router } from "express";
import { SSOController } from "./sso.controller.js";

export function createSSORouter() {
	const router = Router();

	router.get("/url", SSOController.getUrl);
	router.post("/exchange-code", SSOController.exchangeCode);

	return router;
}
