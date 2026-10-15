import { canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { DashboardController } from "./dashboard.controller.js";

export function createDashboardRouter() {
	const router = Router();
	router.get("/summary", canView(), DashboardController.getDashboardSummary);
	router.get("/issues-status", canView(), DashboardController.getDashboardIssuesStatus);
	router.get("/issues-by-source", canView(), DashboardController.getDashboardIssuesBySource);
	router.get("/issues-trend", canView(), DashboardController.getDashboardIssuesTrend);
	router.get("/issues-table", canView(), DashboardController.getDashboardIssuesTable);

	return router;
}
