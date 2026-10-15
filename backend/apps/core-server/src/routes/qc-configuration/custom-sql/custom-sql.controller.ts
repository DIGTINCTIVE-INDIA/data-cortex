import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";

import { registry } from "@/container.js";
import { createQcSqlCheckValidator, updateQcSqlCheckValidator, validateQueryBodyValidator } from "./custom-sql.validator.js";

export class QCConfCustomSqlController {
	static validateCustomSqlCheckQuery = catchAsync(async (req, res) => {
		const payload = await validate(validateQueryBodyValidator, req.body);

		const result = await registry.customSqlCheckRepo.validateQuery(payload);

		return res.status(200).json(
			jsonResponse("mutation", {
				data: result,
				toast: { message: "Query validated successfully" },
			}),
		);
	});

	static createCustomSqlCheckConfig = catchAsync(async (req, res) => {
		const payload = await validate(createQcSqlCheckValidator, req.body);

		const result = await registry.customSqlCheckRepo.createCustomSqlCheckConfig(payload, req.user.id);

		return res.status(201).json(
			jsonResponse("mutation", {
				data: result,
				toast: { message: "Custom SQL check configuration created successfully" },
			}),
		);
	});

	static updateCustomSqlCheckConfig = catchAsync(async (req, res, next) => {
		const checkId = req.query.checkId as string;

		if (!checkId) {
			return next(new ErrorResponse("CheckId is required", 400));
		}

		const payload = await validate(updateQcSqlCheckValidator, req.body);

		const result = await registry.customSqlCheckRepo.updateCustomSqlCheckConfig(payload, checkId);

		return res.status(200).json(
			jsonResponse("mutation", {
				data: result,
				toast: { message: "Custom SQL check configuration updated successfully" },
			}),
		);
	});

	static toggleCustomSqlCheckConfig = catchAsync(async (req, res, next) => {
		const checkId = req.query.checkId as string;

		if (!checkId) {
			return next(new ErrorResponse("CheckId is required", 400));
		}

		const result = await registry.customSqlCheckRepo.toggleCustomSqlCheckConfig(checkId);

		return res.status(200).json(
			jsonResponse("mutation", {
				data: result,
				toast: {
					message: "Custom SQL check status updated successfully",
				},
			}),
		);
	});

	static listCustomSqlCheckConfigs = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);

		const result = await registry.customSqlCheckRepo.listCustomSqlCheckConfigs(query);

		return res.status(200).json(
			jsonResponse("paginated", {
				items: result.data,
				pagination: result.pagination,
			}),
		);
	});
	static getCustomSqlEditorSchema = catchAsync(async (req, res, next) => {
		const payload = req.query.connectionId as string;

		if (!payload) {
			throw next(new ErrorResponse("Connection ID is required", 400));
		}

		const result = await registry.customSqlCheckRepo.getSqlEditorSchema(payload);

		return res.status(200).json(
			jsonResponse("query", {
				result,
			}),
		);
	});
}
