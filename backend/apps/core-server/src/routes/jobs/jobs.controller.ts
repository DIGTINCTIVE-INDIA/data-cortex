import { registry } from "@/container.js";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync } from "@repo/lib/error-handlers-module";

import { jobIdValidator, listJobsValidator } from "./jobs.validator.js";

export class JobsController {
	static list = catchAsync(async (req, res) => {
		const query = await validate(listJobsValidator, req.query as any);
		const data = await registry.jobsRepo.list({ id: req.user.id, role: req.user.role }, query);

		return res.json(jsonResponse("paginated", { items: data.data, pagination: data.pagination }));
	});

	static get = catchAsync(async (req, res) => {
		const { runId } = await validate(jobIdValidator, req.params as any);
		const job = await registry.jobsRepo.get({ id: req.user.id, role: req.user.role }, runId);

		return res.json(jsonResponse("query", { job }));
	});
}
