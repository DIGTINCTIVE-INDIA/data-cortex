import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import {
	createFileStorageCheckConfigValidator,
	getFileStorageCheckSchemaValidator,
	updateFileStorageCheckConfigValidator,
} from "./file-storage.validator.js";

export class QCConfFileStorageController {
	static listFileStorageCheckColumns = catchAsync(async (req, res) => {
		const configId = req.query.configId as string;

		if (!configId) {
			throw new ErrorResponse("configId missing", 400);
		}

		const columns = await registry.qcFileConfigRepo.listFileConfigColumns(configId, req.user.role === "analyst");

		return res.json(jsonResponse("query", { data: { columns } }));
	});

	static getFileStorageCheckSchema = catchAsync(async (req, res) => {
		const payload = await validate(getFileStorageCheckSchemaValidator, req.body);

		const schema = await registry.qcFileConfigRepo.getFileStorageCheckSchema(payload);

		return res.json(
			jsonResponse("mutation", {
				data: {
					schema,
				},
			}),
		);
	});

	static createFileStorageCheckConfig = catchAsync(async (req, res) => {
		const payload = await validate(createFileStorageCheckConfigValidator, req.body);

		const result = await registry.qcFileConfigRepo.createFileStorageCheckConfig({
			...payload,
			userId: req.user.id,
		});

		return res.status(201).json(
			jsonResponse("mutation", {
				data: result,
				toast: {
					message: "File based check configuration created successfully",
				},
			}),
		);
	});

	static updateFileStorageCheckConfig = catchAsync(async (req, res) => {
		const configId = req.query.configId as string;

		if (!configId) {
			throw new ErrorResponse("configId missing", 400);
		}
		const payload = await validate(updateFileStorageCheckConfigValidator, req.body);

		const result = await registry.qcFileConfigRepo.updateFileStorageCheckConfig(configId, payload);

		return res.status(200).json(
			jsonResponse("mutation", {
				data: result,
				toast: {
					message: "File based check configuration updated successfully",
				},
			}),
		);
	});

	static toggleFileStorageCheckConfig = catchAsync(async (req, res) => {
		const configId = req.query.configId as string;

		if (!configId) {
			throw new ErrorResponse("configId missing", 400);
		}

		const result = await registry.qcFileConfigRepo.toggleFileStorageCheckConfig(configId);

		return res.json(
			jsonResponse("mutation", {
				data: result,
				toast: {
					message: "Configuration status updated successfully",
				},
			}),
		);
	});

	static listFileStorageCheckConfigs = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);

		const result = await registry.qcFileConfigRepo.listFileStorageCheckConfigs(query, req.user.role === "analyst");

		return res.status(200).json(
			jsonResponse("paginated", {
				items: result.data,
				pagination: result.pagination,
			}),
		);
	});
}
