import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { QCTagType } from "@repo/types";
import { addQcTagValidator, updateQcTagValidator } from "./libraries.validator.js";

export class LibrariesController {
	static addQcTag = catchAsync(async (req, res) => {
		const payload = await validate(addQcTagValidator, req.body);

		const item = await registry.librariesRepo.addQcTag(payload, req.user.id);

		return res.json(
			jsonResponse("mutation", {
				data: { item },
				toast: { message: "QC tag added successfully" },
			}),
		);
	});

	static updateQcTag = catchAsync(async (req, res) => {
		const id = Number(req.query.id);

		if (!id) {
			throw new ErrorResponse("Id missing", 400);
		}

		const payload = await validate(updateQcTagValidator, req.body);

		const item = await registry.librariesRepo.updateQcTag(id, payload);

		return res.json(
			jsonResponse("mutation", {
				data: { item },
				toast: { message: "QC tag updated successfully" },
			}),
		);
	});

	static toggleQcTag = catchAsync(async (req, res) => {
		const id = Number(req.query.id);

		if (!id) {
			throw new ErrorResponse("Id missing", 400);
		}

		const item = await registry.librariesRepo.toggleQcTag(id);

		return res.json(
			jsonResponse("mutation", {
				data: { item },
				toast: { message: "QC tag status updated successfully" },
			}),
		);
	});

	static getAllQcTags = catchAsync(async (_, res) => {
		const data = await registry.librariesRepo.getAllQcTags();

		return res.json(
			jsonResponse("query", {
				...data,
			}),
		);
	});

	static getQcTagsByType = catchAsync(async (req, res, next) => {
		const query = await validate(paginationValidator, req.query);
		const type = req.params.type as QCTagType;
		if (!type) {
			return next(new ErrorResponse("Enter a valid tag type", 404));
		}

		const data = await registry.librariesRepo.getQcTagsByType(type, {
			limit: query.limit ?? 20,
			page: query.page ?? 1,
		});

		return res.json(
			jsonResponse("paginated", {
				items: data.data,
				pagination: data.pagination,
			}),
		);
	});

	static getDqCheckSources = catchAsync(async (_req, res) => {
		const sources = await registry.librariesRepo.getDqCheckSources();

		return res.json(jsonResponse("query", { sources }));
	});
}
