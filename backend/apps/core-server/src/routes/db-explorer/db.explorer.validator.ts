import vine from "@vinejs/vine";

export const executeDbExplorerQueryValidator = vine.object({
	sqlQuery: vine.string().trim().minLength(3),

	page: vine.number().withoutDecimals().min(1).optional(),

	pageSize: vine.number().withoutDecimals().min(1).max(10_000).optional(),
});
