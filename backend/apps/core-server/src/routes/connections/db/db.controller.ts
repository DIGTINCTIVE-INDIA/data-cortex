import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { addDatabaseConnectionValidator, updateDatabaseConnectionValidator } from "./db.validator.js";

export class DBController {
	static getConnectionsList = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);

		const data = await registry.dbConnectionRepo.listConnections(query);

		return res.json(
			jsonResponse("paginated", {
				items: data.data,
				pagination: data.pagination,
			}),
		);
	});

	static addConnection = catchAsync(async (req, res) => {
		const payload = await validate(addDatabaseConnectionValidator, req.body);

		const connection = await registry.dbConnectionRepo.addConnection(payload, req.user.id);

		return res.json(
			jsonResponse("mutation", {
				data: {
					connection,
				},
				toast: {
					message: "Connection added successfully",
				},
			}),
		);
	});

	static updateConnection = catchAsync(async (req, res) => {
		const connectionId = req.query.connectionId as string;

		if (!connectionId) {
			throw new ErrorResponse("Connection id missing", 400);
		}

		const payload = await validate(updateDatabaseConnectionValidator, req.body);

		const connection = await registry.dbConnectionRepo.updateConnection(connectionId, payload);

		return res.json(
			jsonResponse("mutation", {
				data: {
					connection,
				},
				toast: {
					message: "Connection updated successfully",
				},
			}),
		);
	});

	static toggleConnection = catchAsync(async (req, res) => {
		const connectionId = req.query.connectionId as string;

		if (!connectionId) {
			throw new ErrorResponse("Connection id missing", 400);
		}

		const connection = await registry.dbConnectionRepo.toggleConnection(connectionId);

		return res.json(
			jsonResponse("mutation", {
				data: {
					connection,
				},
				toast: {
					message: "Connection status updated successfully",
				},
			}),
		);
	});

	static getConnectionTables = catchAsync(async (req, res) => {
		const connectionId = req.query.connectionId as string;

		if (!connectionId) {
			throw new ErrorResponse("Connection id missing", 400);
		}

		const tables = await registry.dbConnectionRepo.getConnectionTables(connectionId);

		return res.json(
			jsonResponse("query", {
				tables,
			}),
		);
	});

	static getConnectionColumns = catchAsync(async (req, res) => {
		const connectionId = req.query.connectionId as string;
		const tableName = req.query.tableName as string;

		if (!connectionId) {
			throw new ErrorResponse("Connection id missing", 400);
		}

		if (!tableName) {
			throw new ErrorResponse("Table name missing", 400);
		}

		const columns = await registry.dbConnectionRepo.getConnectionColumns(connectionId, tableName);

		return res.json(
			jsonResponse("query", {
				columns,
			}),
		);
	});
}
