import vine from "@vinejs/vine";

export const listJobsValidator = vine.object({
	page: vine.number().min(1).optional(),
	limit: vine.number().min(1).max(500).optional(),
	status: vine.enum(["queued", "running", "completed", "failed"]).optional(),
	configId: vine.string().trim().minLength(1).optional(),
});

export const jobIdValidator = vine.object({
	// The engine's task id: a uuid. Anything else cannot be a run, so refuse it before it
	// reaches a query.
	runId: vine.string().trim().uuid(),
});
