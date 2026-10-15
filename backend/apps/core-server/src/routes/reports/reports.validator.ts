import vine from "@vinejs/vine";

export const qcSummaryReportValidator = vine.object({
	period: vine.enum(["current_batch", "current_week", "current_month", "quarter_to_date", "year_to_date"]).optional(),

	workstream: vine.number().optional(),
});

export const qcAlertsReportValidator = vine.object({
	page: vine.number().optional(),
	limit: vine.number().optional(),

	search: vine.string().optional(),

	criticality: vine.enum(["low", "medium", "high"]).optional(),

	status: vine.enum(["all", "open", "resolved", "discarded"]).optional(),

	category: vine.number().optional(),

	period: vine.enum(["ltd", "current_week", "current_month", "quarter_to_date", "year_to_date"]).optional(),

	workstream: vine.number().optional(),

	impactedDownstream: vine.number().optional(),
});

/**
 * Discarding an alert needs a reason; resolving may carry one.
 *
 * A discard is someone saying "this failure does not matter", which is the one
 * outcome that leaves bad data in place -- it has to be accountable. Enforced
 * here rather than only in the dialog so the API cannot be used to bypass it.
 *
 * A resolve is optional because the fix is usually self-evident, but "corrected
 * at source, reloaded 14 Oct" is worth keeping when someone bothers to write it.
 * The same length rules apply to both, so a note is never a single stray letter.
 */
export const qcAlertStatusUpdateValidator = vine.object({
	status: vine.enum(["resolved", "discarded"]),
	reason: vine
		.string()
		.trim()
		.minLength(3)
		.maxLength(500)
		.optional()
		.requiredWhen("status", "=", "discarded"),
});
