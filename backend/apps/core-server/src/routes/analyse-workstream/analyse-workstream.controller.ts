import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync } from "@repo/lib/error-handlers-module";
import {
	workstreamBaseValidator,
	workstreamCheckDetailsQueryValidator,
	workstreamCheckDetailsValidator,
	workstreamTopErrorsValidator,
} from "./analyse-workstream.validator.js";

const toNumberOrNull = (v: unknown) => {
	if (v === undefined || v === null || String(v).trim() === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

const toStringOrNull = (v: unknown) => {
	if (v === undefined || v === null || String(v).trim() === "") return null;
	return String(v);
};

const mapQuery = (query: any) => ({
	period: query.period ?? "ltd",
	bucket: query.bucket ?? "monthly",

	page: toNumberOrNull(query.page) ?? 1,
	limit: toNumberOrNull(query.limit) ?? 25,

	workstream: toNumberOrNull(query.workstream),
	dataSource: toNumberOrNull(query.dataSource),
	impactedDownstream: toNumberOrNull(query.impactedDownstream),
	category: toNumberOrNull(query.category),

	checkType: toStringOrNull(query.checkType),
	fileOrTableName: toStringOrNull(query.fileOrTableName),
	configType: query.configType ?? "all",
});

export class AnalyseWorkstreamController {
	static getDistinctCheckTypes = catchAsync(async (req, res) => {
		const query = await validate(workstreamBaseValidator, req.query as any);
		const data = await registry.analyseWorkstreamRepo.getDistinctCheckTypes(mapQuery(query));
		return res.json(jsonResponse("query", data));
	});

	static getDistinctFileOrTableNames = catchAsync(async (req, res) => {
		const query = await validate(workstreamBaseValidator, req.query as any);
		const data = await registry.analyseWorkstreamRepo.getDistinctFileOrTableNames(mapQuery(query));
		return res.json(jsonResponse("query", data));
	});

	static getCheckCards = catchAsync(async (req, res) => {
		const query = await validate(workstreamBaseValidator, req.query as any);
		const data = await registry.analyseWorkstreamRepo.getCheckCards(mapQuery(query));
		return res.json(jsonResponse("query", data));
	});

	static getFailedTrend = catchAsync(async (req, res) => {
		const query = await validate(workstreamBaseValidator, req.query as any);
		const data = await registry.analyseWorkstreamRepo.getFailedTrend(mapQuery(query));
		return res.json(jsonResponse("query", data));
	});

	static getFailedChecksTable = catchAsync(async (req, res) => {
		const query = await validate(workstreamBaseValidator, req.query as any);
		const paginatedQuery = await validate(paginationValidator, req.query);
		const data = await registry.analyseWorkstreamRepo.getFailedChecksTable(mapQuery(query), paginatedQuery);
		return res.json(jsonResponse("paginated", { items: data.data, pagination: data.pagination }));
	});

	static getCheckDetails = catchAsync(async (req, res) => {
		const params = await validate(workstreamCheckDetailsValidator, req.params as any);
		const query = await validate(workstreamCheckDetailsQueryValidator, req.query as any);
		const data = await registry.analyseWorkstreamRepo.getCheckDetails(params.id, query.view ?? "last10");
		return res.json(jsonResponse("query", data));
	});

	static getTopErrorRecords = catchAsync(async (req, res) => {
		const data = await validate(workstreamTopErrorsValidator, {
			...req.params,
			...req.query,
		} as any);

		const result = await registry.analyseWorkstreamRepo.getTopErrorRecords(data.id, data.limit ?? 100);
		return res.json(jsonResponse("query", result));
	});
}
