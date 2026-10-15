import vine from "@vinejs/vine";

/**
 * Per-field rules for a traditional check.
 *
 * Shared by both config families -- file-based and db-based checks write the same
 * traditional_config_details rows. It lives here rather than in either route's own
 * validator because file-storage.validator.ts already imports DB_ID_REGEX from
 * db.validator.ts; importing back the other way would be a circular import.
 */

export const criticalityTypes = ["low", "medium", "high"] as const;

export const traditionalDataTypes = ["string", "integer", "float", "date", "datetime", "boolean", "varchar"] as const;

export const traditionalColumnCheckValidator = vine.object({
	field: vine.string().trim().minLength(1),
	dataType: vine.enum(traditionalDataTypes),
	columnOrder: vine.number(),

	primaryKeyCheck: vine.boolean(),
	primaryKeyCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("primaryKeyCheck", "=", true),

	nullCheck: vine.boolean(),
	nullCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("nullCheck", "=", true),

	duplicateCheck: vine.boolean(),
	duplicateCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("duplicateCheck", "=", true),

	lengthCheck: vine.boolean(),
	expectedLength: vine.number().optional().requiredWhen("lengthCheck", "=", true),
	lengthCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("lengthCheck", "=", true),

	formatCheck: vine.boolean(),
	formatRegex: vine.string().trim().optional().requiredWhen("formatCheck", "=", true),
	formatCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("formatCheck", "=", true),

	lovCheck: vine.boolean(),
	lovs: vine.string().trim().optional().requiredWhen("lovCheck", "=", true),
	lovCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("lovCheck", "=", true),

	riCheck: vine.boolean(),
	riConnectionId: vine.string().trim().optional().requiredWhen("riCheck", "=", true),
	riReferenceTable: vine.string().trim().optional().requiredWhen("riCheck", "=", true),
	riFieldName: vine.string().trim().optional().requiredWhen("riCheck", "=", true),
	riCheckCriticality: vine.enum(criticalityTypes).optional().requiredWhen("riCheck", "=", true),
});
