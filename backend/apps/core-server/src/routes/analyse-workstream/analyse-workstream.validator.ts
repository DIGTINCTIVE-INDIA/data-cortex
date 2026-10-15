import vine from "@vinejs/vine";

export const workstreamPeriodEnum = [
	"ltd",
	"current_batch",
	"current_week",
	"current_month",
	"quarter_to_date",
	"year_to_date",
	"launch_to_date",
] as const;

export const workstreamBucketEnum = ["daily", "weekly", "monthly"] as const;

export const workstreamBaseValidator = vine.object({
	period: vine.enum(workstreamPeriodEnum).optional(),
	bucket: vine.enum(workstreamBucketEnum).optional(),

	workstream: vine.number().optional(),
	dataSource: vine.number().optional(),
	impactedDownstream: vine.number().optional(),
	category: vine.number().optional(),

	checkType: vine.string().optional(),
	configType: vine.enum(["all", "file", "db"]).optional(),
	fileOrTableName: vine.string().optional(),
});

export const workstreamCheckDetailsValidator = vine.object({
	id: vine.number(),
});

export const workstreamCheckDetailsQueryValidator = vine.object({
	view: vine
		.enum(["last10", "last20", "weekly", "monthly"] as const)
		.parse((value) => value ?? "last10")
		.optional(),
});

export const workstreamTopErrorsValidator = vine.object({
	id: vine.number(),
	limit: vine.number().optional(),
});
