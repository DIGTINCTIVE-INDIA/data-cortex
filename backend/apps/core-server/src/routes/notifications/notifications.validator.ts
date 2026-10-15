import vine from "@vinejs/vine";

const criticalityValues = ["low", "medium", "high"] as const;

const ruleFields = {
	name: vine.string().trim().minLength(3).maxLength(100),
	impactedDownstreamIds: vine.array(vine.number().positive()).minLength(1),
	criticality: vine.array(vine.enum(criticalityValues)).minLength(1),
	recipients: vine.array(vine.string().trim().email()).minLength(1),
};

export const createNotificationRuleValidator = vine.object(ruleFields);

export const updateNotificationRuleValidator = vine.object({
	name: ruleFields.name.optional(),
	impactedDownstreamIds: ruleFields.impactedDownstreamIds.optional(),
	criticality: ruleFields.criticality.optional(),
	recipients: ruleFields.recipients.optional(),
});

export const testEmailValidator = vine.object({
	to: vine.string().trim().email(),
});

/** One failed check inside a run. */
const failureFields = {
	checkExecutionId: vine.number().positive(),
	checkName: vine.string().trim().minLength(1),
	criticality: vine.enum(criticalityValues),
	impactedDownstreamIds: vine.array(vine.number().positive()),
	failureReason: vine.string().trim().optional(),
	issueRows: vine.string().trim().optional(),
	field: vine.string().trim().optional(),
};

/**
 * What dc-engine posts when a run finishes with failures.
 *
 * One call per run carrying every failure, rather than one call per failed check:
 * a config fans out into many field-level checks, so runs routinely fail several
 * at once. The controller also accepts a bare single-failure body and wraps it,
 * so a caller that only has one failure does not have to build the envelope.
 */
export const runFailuresEventValidator = vine.object({
	configId: vine.string().trim().minLength(1),
	configName: vine.string().trim().optional(),
	jobId: vine.string().trim().optional(),
	runId: vine.string().trim().optional(),
	failures: vine.array(vine.object(failureFields)).minLength(1),
});
