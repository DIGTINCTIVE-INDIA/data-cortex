import { registry } from "@/container.js";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync } from "@repo/lib/error-handlers-module";

import {
	createKeyValidator,
	createServiceUserValidator,
	keyIdValidator,
	serviceUserIdValidator,
} from "./service-users.validator.js";

export class ServiceUsersController {
	static list = catchAsync(async (_req, res) => {
		const serviceUsers = await registry.accessRepo.listServiceUsers();

		return res.json(jsonResponse("query", { serviceUsers }));
	});

	static create = catchAsync(async (req, res) => {
		const payload = await validate(createServiceUserValidator, req.body);

		const user = await registry.accessRepo.createServiceUser(payload.name, req.user.id);
		const key = await registry.accessRepo.createKey(user.id, "default", req.user.id, payload.expiresInDays);

		return res.json(
			jsonResponse("mutation", {
				// `key.key` is the plaintext, and this response is the only time it exists.
				data: { user, key },
				toast: { message: "Service user created. Copy the key now -- it will not be shown again." },
			}),
		);
	});

	static createKey = catchAsync(async (req, res) => {
		const { id } = await validate(serviceUserIdValidator, req.params as any);
		const payload = await validate(createKeyValidator, req.body);

		const key = await registry.accessRepo.createKey(id, payload.name, req.user.id, payload.expiresInDays);

		return res.json(
			jsonResponse("mutation", {
				data: { key },
				toast: { message: "API key created. Copy it now -- it will not be shown again." },
			}),
		);
	});

	static revokeKey = catchAsync(async (req, res) => {
		const { keyId } = await validate(keyIdValidator, req.params as any);

		await registry.accessRepo.revokeKey(keyId);

		return res.json(jsonResponse("mutation", { data: { keyId }, toast: { message: "API key revoked" } }));
	});
}
