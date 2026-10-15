import vine from "@vinejs/vine";

export const runCheckValidator = vine.object({
	configId: vine.string().trim().minLength(1),

	// Kept for logging only -- the engine infers the check family from the config id
	// prefix (DBC/FBC/CB), so no check_type is sent downstream.
	source: vine.enum(["db", "file", "custom-sql"]),

	// Page-scoped de-duplication. The browser generates one token per page load and
	// combines it with the config id, so clicking Run twice without reloading is the
	// same run, while a refresh deliberately allows a fresh one.
	idempotencyKey: vine.string().trim().minLength(1).maxLength(200).optional(),
});
