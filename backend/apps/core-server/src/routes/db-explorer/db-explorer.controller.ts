import { registry } from "@/container.js";
import { jsonResponse, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { executeDbExplorerQueryValidator } from "./db.explorer.validator.js";

export class DBExplorerController {
	static executeQuery = catchAsync(async (req, res, next) => {
		const connectionId = req.query.connectionId as string | undefined;

		if (!connectionId) {
			return next(new ErrorResponse("ConnectionId is required", 400));
		}

		const payload = await validate(executeDbExplorerQueryValidator, req.body);

		const result = await registry.dbExplorerRepo.executeQuery(connectionId, payload);

		return res.status(200).json(
			jsonResponse("mutation", {
				data: {
					result,
				},
				toast: {
					message: "Query Executed Successfully!",
				},
			}),
		);
	});
}
