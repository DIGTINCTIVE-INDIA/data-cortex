import { Router } from "express";
import { ReportsController } from "./reports.controller.js";
import { canView, onlyAdmin } from "@/middlewares/role-middleware.js";

export function createReportsRouter() {
	const router = Router();

	router.get("/qc-summary", canView(), ReportsController.getQcSummaryReport);

	router.get("/qc-alerts", canView(), ReportsController.getQcAlertsReport);
	router.get("/qc-alerts/summary", canView(), ReportsController.getQcAlertsSummary);
	router.patch("/qc-alerts/:id/status", onlyAdmin(), ReportsController.updateQcAlertStatus);

	return router;
}
