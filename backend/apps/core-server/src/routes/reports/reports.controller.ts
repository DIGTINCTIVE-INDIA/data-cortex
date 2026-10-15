import { registry } from "@/container.js";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync } from "@repo/lib/error-handlers-module";
import { qcAlertStatusUpdateValidator, qcAlertsReportValidator, qcSummaryReportValidator } from "./reports.validator.js";

export class ReportsController {
	static getQcSummaryReport = catchAsync(async (req, res) => {
		const query = await validate(qcSummaryReportValidator, req.query as any);

		const workstream = query.workstream ? Number(query.workstream) : null;

		const data = await registry.reportsRepo.getQcSummaryReport({
			period: query.period ?? "current_batch",
			workstream,
		});

		return res.json(jsonResponse("query", data));
	});

	static getQcAlertsReport = catchAsync(async (req, res) => {
		const query = await validate(qcAlertsReportValidator, req.query as any);

		const data = await registry.reportsRepo.getQcAlertsReport({
			page: query.page ? Number(query.page) : 1,
			limit: query.limit ? Number(query.limit) : 10,
			search: query.search ?? null,
			criticality: query.criticality ?? null,
			status: query.status ?? "all",
			category: query.category ? Number(query.category) : null,
			period: query.period ?? "ltd",
			workstream: query.workstream ? Number(query.workstream) : null,
			impactedDownstream: query.impactedDownstream ? Number(query.impactedDownstream) : null,
		});

		return res.json(
			jsonResponse("paginated", {
				items: data.data,
				pagination: data.pagination,
			}),
		);
	});

	static getQcAlertsSummary = catchAsync(async (req, res) => {
		const query = await validate(qcAlertsReportValidator, req.query as any);

		const data = await registry.reportsRepo.getQcAlertsSummary({
			criticality: query.criticality ?? null,
			category: query.category ? Number(query.category) : null,
			period: query.period ?? "ltd",
			workstream: query.workstream ? Number(query.workstream) : null,
			impactedDownstream: query.impactedDownstream ? Number(query.impactedDownstream) : null,
		});

		return res.json(jsonResponse("query", data));
	});

	static updateQcAlertStatus = catchAsync(async (req, res) => {
		const body = await validate(qcAlertStatusUpdateValidator, req.body as any);

		const data = await registry.reportsRepo.updateQcAlertStatus({
			id: Number(req.params.id),
			status: body.status,
			reason: body.reason,
		});

		return res.json(
			jsonResponse("mutation", {
				data,
				toast: {
					showToast: true,
					type: "success",
					message: body.status === "resolved" ? "QC alert marked as resolved" : "QC alert discarded successfully",
				},
			}),
		);
	});
}
