import { registry } from "@/container.js";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync } from "@repo/lib/error-handlers-module";
import { dashboardBaseValidator, dashboardIssuesStatusValidator, dashboardTrendValidator } from "./dashboard.validator.js";

const toNumberOrNull = (v: unknown) => {
	if (v === undefined || v === null || String(v).trim() === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

export class DashboardController {
	static getDashboardSummary = catchAsync(async (req, res) => {
		const query = await validate(dashboardBaseValidator, req.query as any);

		const data = await registry.dashboardRepo.getDashboardSummary({
			period: query.period ?? "current_batch",
			workstream: toNumberOrNull(query.workstream),
			dataSource: toNumberOrNull(query.dataSource),
			impactedDownstream: toNumberOrNull(query.impactedDownstream),
		});

		return res.json(jsonResponse("query", data));
	});

	static getDashboardIssuesStatus = catchAsync(async (req, res) => {
		const query = await validate(dashboardIssuesStatusValidator, req.query as any);

		const data = await registry.dashboardRepo.getDashboardIssuesStatus({
			period: query.period ?? "current_batch",
			workstream: toNumberOrNull(query.workstream),
			dataSource: toNumberOrNull(query.dataSource),
			impactedDownstream: toNumberOrNull(query.impactedDownstream),
		});

		return res.json(jsonResponse("query", data));
	});

	static getDashboardIssuesBySource = catchAsync(async (req, res) => {
		const query = await validate(dashboardBaseValidator, req.query as any);

		const data = await registry.dashboardRepo.getDashboardIssuesBySource({
			period: query.period ?? "current_batch",
			workstream: toNumberOrNull(query.workstream),
			dataSource: toNumberOrNull(query.dataSource),
			impactedDownstream: toNumberOrNull(query.impactedDownstream),
		});

		return res.json(jsonResponse("query", data));
	});

	static getDashboardIssuesTrend = catchAsync(async (req, res) => {
		const query = await validate(dashboardTrendValidator, req.query as any);

		const data = await registry.dashboardRepo.getDashboardIssuesTrend({
			period: query.period ?? "year_to_date",
			bucket: query.bucket ?? "weekly",
			groupBy: query.groupBy ?? "criticality",
			workstream: toNumberOrNull(query.workstream),
			dataSource: toNumberOrNull(query.dataSource),
			impactedDownstream: toNumberOrNull(query.impactedDownstream),
		});

		return res.json(jsonResponse("query", data));
	});

	static getDashboardIssuesTable = catchAsync(async (req, res) => {
		const query = await validate(dashboardBaseValidator, req.query as any);

		const data = await registry.dashboardRepo.getDashboardIssuesTable({
			period: query.period ?? "current_batch",
			workstream: toNumberOrNull(query.workstream),
			dataSource: toNumberOrNull(query.dataSource),
			impactedDownstream: toNumberOrNull(query.impactedDownstream),
		});

		return res.json(jsonResponse("query", data));
	});
}
