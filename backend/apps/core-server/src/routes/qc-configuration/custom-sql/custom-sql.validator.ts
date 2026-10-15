import vine from "@vinejs/vine";

export const validateQueryBodyValidator = vine.object({
	sourceConnectionId: vine.string().trim().minLength(1),
	sqlQuery: vine.string().trim().minLength(1).maxLength(5000),
});

export const createQcSqlCheckValidator = vine.object({
	checkName: vine.string().trim().minLength(1).maxLength(255),
	checkDescription: vine.string().trim().optional(),

	categoryId: vine.number(),
	workstreamId: vine.number().nonNegative(),
	impactedDownstreamIds: vine.array(vine.number().nonNegative()).minLength(1),

	dataSourceId: vine.number().nonNegative(),

	sourceConnectionId: vine.string().trim().minLength(1),
	targetConnectionId: vine.string().trim().minLength(1),

	targetTablePrefix: vine.string().trim().minLength(1).maxLength(255),
	sqlQuery: vine.string().trim().minLength(1).maxLength(5000),
	criticality: vine.enum(["low", "medium", "high"]),
	// error_message is NOT NULL in the schema and in the approved ERD, so it is
	// required here. It used to be optional, which let an API caller send nothing
	// into a NOT NULL column.
	errorMessage: vine.string().trim().minLength(3).maxLength(255),
});

export const updateQcSqlCheckValidator = vine.object({
	checkName: vine.string().trim().minLength(1).maxLength(255).optional(),
	checkDescription: vine.string().trim().optional(),

	categoryId: vine.number().nonNegative().optional(),

	workstreamId: vine.number().nonNegative().optional(),

	impactedDownstreamIds: vine.array(vine.number().nonNegative()).minLength(1).optional(),

	dataSourceId: vine.number().nonNegative().optional(),

	sourceConnectionId: vine.string().trim().minLength(1).optional(),
	targetConnectionId: vine.string().trim().minLength(1).optional(),

	targetTablePrefix: vine.string().trim().minLength(1).maxLength(255).optional(),
	sqlQuery: vine.string().trim().minLength(1).maxLength(5000).optional(),
	criticality: vine.enum(["low", "medium", "high"]).optional(),
	// Optional like every other field here -- this is a PATCH. It was the only
	// required one, so changing just the check name was rejected for not
	// resending the error message.
	errorMessage: vine.string().trim().minLength(3).maxLength(255).optional(),
});
