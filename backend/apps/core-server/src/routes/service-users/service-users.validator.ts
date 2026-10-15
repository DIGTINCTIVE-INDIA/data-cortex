import vine from "@vinejs/vine";

const keyFields = {
	name: vine.string().trim().minLength(3).maxLength(100),
	// Omitted = never expires. Offering an expiry at all is the point: a key handed to
	// an external system is exactly the credential worth rotating on a schedule.
	expiresInDays: vine.number().min(1).max(3650).optional(),
};

/** Creates the identity and its first key in one step, since an identity with no key does nothing. */
export const createServiceUserValidator = vine.object({
	name: vine.string().trim().minLength(3).maxLength(60),
	// Only the expiry is taken from the key fields: the first key is always named
	// "default", and spreading all of keyFields here would overwrite this name's limits.
	expiresInDays: keyFields.expiresInDays,
});

export const createKeyValidator = vine.object(keyFields);

export const keyIdValidator = vine.object({ keyId: vine.string().uuid() });

export const serviceUserIdValidator = vine.object({ id: vine.string().uuid() });
