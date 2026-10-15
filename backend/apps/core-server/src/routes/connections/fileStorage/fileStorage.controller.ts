import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { addFileConnectionValidator, updateFileConnectionValidator } from "./fileStorage.validator.js";

export class FileStorageController {
	static getConnectionsList = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);

		const data = await registry.fileConnectionRepo.listConnections(query);

		return res.json(
			jsonResponse("paginated", {
				items: data.data,
				pagination: data.pagination,
			}),
		);
	});

	static addConnection = catchAsync(async (req, res) => {
		const payload = await validate(addFileConnectionValidator, req.body);
		const userId = req.user.id;

		const connection = await registry.fileConnectionRepo.addConnection(payload, userId);

		return res.json(
			jsonResponse("mutation", {
				data: { connection },
				toast: { message: "File connection added successfully" },
			}),
		);
	});

	static updateConnection = catchAsync(async (req, res) => {
		const connectionId = req.query.connectionId as string;

		if (!connectionId) {
			throw new ErrorResponse("Connection id missing", 400);
		}

		const payload = await validate(updateFileConnectionValidator, req.body);

		const connection = await registry.fileConnectionRepo.updateConnection(connectionId, payload);

		return res.json(
			jsonResponse("mutation", {
				data: { connection },
				toast: { message: "File connection updated successfully" },
			}),
		);
	});

	static toggleConnection = catchAsync(async (req, res) => {
		const connectionId = req.query.connectionId as string;

		if (!connectionId) {
			throw new ErrorResponse("Connection id missing", 400);
		}

		const connection = await registry.fileConnectionRepo.toggleConnection(connectionId);

		return res.json(
			jsonResponse("mutation", {
				data: { connection },
				toast: {
					message: "File connection status updated successfully",
				},
			}),
		);
	});
}
