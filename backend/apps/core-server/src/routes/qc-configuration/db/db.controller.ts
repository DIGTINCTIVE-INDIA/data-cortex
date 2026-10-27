// qc-configuration.controller.ts
import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { createQcDbCheckValidator, setQcDbCheckColumnsValidator, updateQcDbCheckValidator } from "./db.validator.js";

export class QCConfDBController {
	static createDBCheckConfig = catchAsync(async (req, res) => {
		const payload = await validate(createQcDbCheckValidator, req.body);

		const config = await registry.qcDBConfigRepo.createDbConfig(payload, req.user.id);

		return res.json(
			jsonResponse("mutation", {
				data: { config },
				toast: { message: "DB Check created successfully" },
			}),
		);
	});

	static setDBCheckColumns = catchAsync(async (req, res) => {
		const { configId, columns } = await validate(setQcDbCheckColumnsValidator, req.body);

		const result = await registry.qcDBConfigRepo.setDbConfigColumns(configId, columns, req.user.id);

		return res.json(
			jsonResponse("mutation", {
				data: { columns: result.columns },
				toast: {
					message: result.replacedCount
						? `Field rules updated (${result.columns.length} column(s), ${result.replacedCount} replaced)`
						: `Field rules saved (${result.columns.length} column(s))`,
				},
			}),
		);
	});

	static listDBCheckColumns = catchAsync(async (req, res) => {
		const configId = req.query.configId as string;

		if (!configId) {
			throw new ErrorResponse("configId missing", 400);
		}

		const columns = await registry.qcDBConfigRepo.listDbConfigColumns(configId, req.user.role === "analyst");

		return res.json(jsonResponse("query", { data: { columns } }));
	});

	static updateDBCheckConfig = catchAsync(async (req, res) => {
		const configId = req.query.configId as string;

		if (!configId) {
			throw new ErrorResponse("configId missing", 400);
		}

		const payload = await validate(updateQcDbCheckValidator, req.body);

		const config = await registry.qcDBConfigRepo.updateDbConfig(configId, payload);

		return res.json(
			jsonResponse("mutation", {
				data: { config },
				toast: { message: "DB Check updated successfully" },
			}),
		);
	});

	static toggleDBCheckConfig = catchAsync(async (req, res) => {
		const configId = req.query.configId as string;

		if (!configId) {
			throw new ErrorResponse("configId missing", 400);
		}

		const config = await registry.qcDBConfigRepo.toggleDbConfig(configId);

		return res.json(
			jsonResponse("mutation", {
				data: { config },
				toast: {
					message: "DB Check status updated successfully",
				},
			}),
		);
	});

	static listDBCheckConfigs = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);

		const data = await registry.qcDBConfigRepo.listDbConfigs(query, req.user.role === "analyst");

		return res.json(
			jsonResponse("paginated", {
				items: data.data,
				pagination: data.pagination,
			}),
		);
	});
}
