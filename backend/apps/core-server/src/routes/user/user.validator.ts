import { userRoleEnum } from "@repo/db";
import vine from "@vinejs/vine";

// Service users are made through /api/service-users, which also issues their key. Letting
// add-user create one would produce a service identity with no key and a made-up address.
const humanRoles = userRoleEnum.enumValues.filter(role => role !== "service");

export const addUserValidator = vine.object({
	fullName: vine.string().minLength(1),
	email: vine.string().email(),
	role: vine.enum(humanRoles),
});

export const updateUserValidator = vine.object({
	fullName: vine.string().minLength(1).optional(),
	email: vine.string().email().optional(),
	role: vine.enum(humanRoles).optional(),
});
