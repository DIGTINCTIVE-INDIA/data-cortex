import vine from "@vinejs/vine";

export const dashboardPeriodEnum = [
	"current_batch",
	"current_week",
	"current_month",
	"quarter_to_date",
	"year_to_date",
	"launch_to_date",
] as const;

export const dashboardBaseValidator = vine.object({
	period: vine.enum(dashboardPeriodEnum).optional(),
	workstream: vine.number().optional(),
	dataSource: vine.number().optional(),
	impactedDownstream: vine.number().optional(),
});

export const dashboardIssuesStatusValidator = dashboardBaseValidator;

export const dashboardTrendValidator = vine.object({
	bucket: vine.enum(["weekly", "monthly"]).optional(),
	period: vine.enum(dashboardPeriodEnum).optional(),
	groupBy: vine.enum(["criticality", "workstream"]).optional(),
	workstream: vine.number().optional(),
	dataSource: vine.number().optional(),
	impactedDownstream: vine.number().optional(),
});
