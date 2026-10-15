import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { addUserValidator, updateUserValidator } from "./user.validator.js";

export class UserController {
	static addUser = catchAsync(async (req, res) => {
		const payload = await validate(addUserValidator, req.body);

		const user = await registry.userRepo.createUserByAdmin(payload, req.user.id);

		return res.json(
			jsonResponse("mutation", {
				data: {
					user,
				},
				toast: {
					message: "User created successfully",
				},
			}),
		);
	});

	static updateUser = catchAsync(async (req, res) => {
		const userId = req.query.userId as string;
		if (!userId) {
			throw new ErrorResponse("User id missing", 400);
		}
		const payload = await validate(updateUserValidator, req.body);

		const user = await registry.userRepo.updateUser(userId, payload);

		return res.json(
			jsonResponse("mutation", {
				data: {
					user,
				},
				toast: {
					message: "User updated successfully",
				},
			}),
		);
	});


	static toggleUser = catchAsync(async (req, res) => {
		const userId = req.query.userId as string;

		if (!userId) {
			throw new ErrorResponse("User id missing", 400);
		}

		const user = await registry.userRepo.toggleUser(userId);

		return res.json(
			jsonResponse("mutation", {
				data: {
					user,
				},
				toast: {
					message: "User status updated successfully",
				},
			}),
		);
	});

	static listUsers = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);

		const data = await registry.userRepo.listUsers(query);

		return res.json(
			jsonResponse("paginated", {
				items: data.data,
				pagination: data.pagination,
			}),
		);
	});
}
