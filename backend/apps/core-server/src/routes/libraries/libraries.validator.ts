import vine from "@vinejs/vine";

export const qcTagTypeValues = ["impacted_downstream", "workstream", "data_source", "category"] as const;

export const addQcTagValidator = vine.object({
	type: vine.enum(qcTagTypeValues),
	title: vine.string().minLength(2).maxLength(100),
	description: vine.string().optional().nullable(),
});

export const updateQcTagValidator = vine.object({
	type: vine.enum(qcTagTypeValues).optional(),
	title: vine.string().minLength(2).maxLength(100).optional(),
	description: vine.string().optional().nullable(),
});
