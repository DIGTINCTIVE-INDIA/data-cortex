import { canView } from "@/middlewares/role-middleware.js";
import { Router } from "express";
import { AnalyseWorkstreamController } from "./analyse-workstream.controller.js";

export function createAnalyseWorkstreamRouter() {
	const router = Router();

	router.get("/distinct-check-types", canView(), AnalyseWorkstreamController.getDistinctCheckTypes);
	router.get("/distinct-file-table-names", canView(), AnalyseWorkstreamController.getDistinctFileOrTableNames);
	router.get("/check-cards", canView(), AnalyseWorkstreamController.getCheckCards);
	router.get("/failed-trend", canView(), AnalyseWorkstreamController.getFailedTrend);
	router.get("/failed-checks-table", canView(), AnalyseWorkstreamController.getFailedChecksTable);
	router.get("/checks/:id/details", canView(), AnalyseWorkstreamController.getCheckDetails);
	router.get("/checks/:id/top-error-records", canView(), AnalyseWorkstreamController.getTopErrorRecords);

	return router;
}
