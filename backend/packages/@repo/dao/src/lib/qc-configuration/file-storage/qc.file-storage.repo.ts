import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, count, db, desc, eq, fileBasedChecksConfig, fileConnection, traditionalConfigDetails } from "@repo/db";
import { PaginationType, Paginator } from "@repo/lib";
import EncryptionModule from "@repo/lib/encryption-module";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type {
	CreateFileStorageCheckConfigPayload,
	FileStorageCheckSchemaResult,
	GetFileStorageCheckSchemaPayload,
	UpdateFileStorageCheckConfigPayload,
} from "@repo/types";
import { Readable } from "node:stream";
import { IdGenerationRepo } from "../../common/id-generation.repo.js";
import { QCFileSchemaRepo } from "./qc-file-schema.repo.js";

const MAX_SCHEMA_ROWS = 1000;

export class QCFileConfigurationRepo {
	private idGenerationRepo: IdGenerationRepo;

	constructor(idGenerationRepo: IdGenerationRepo) {
		this.idGenerationRepo = idGenerationRepo;
	}

	async getFileStorageCheckSchema(payload: GetFileStorageCheckSchemaPayload): Promise<FileStorageCheckSchemaResult> {
		const connection = await db.query.fileConnection.findFirst({
			where: and(eq(fileConnection.connectionId, payload.sourceConnectionId), eq(fileConnection.enabled, true)),
		});
		if (!connection) {
			throw new ErrorResponse("Invalid File connection", 404);
		}

		if (connection.storageType !== "s3") {
			throw new ErrorResponse("Only AWS S3 is supported for now", 400);
		}

		const bucket = String(connection.bucketOrContainerName || "").trim();
		const key = QCFileSchemaRepo.buildFileKey(payload.sourceFilePath, payload.sourceFileName, payload.sourceFileType);
		const region = connection.region || "ap-south-1";

		const s3 = new S3Client({
			region,
			// endpoint: connection.endpointUrl || `https://s3.${region}.amazonaws.com`,
			// forcePathStyle: Boolean(connection.endpointUrl),
			credentials: {
				accessKeyId: connection.accessKeyId,
				secretAccessKey: EncryptionModule.decrypt(connection.secretAccessKey),
			},
		});

		const result = await s3.send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);

		if (!result.Body) {
			throw new ErrorResponse("Unable to read file from S3", 400);
		}

		let stream = result.Body as Readable;

		// A csv's delimiter is whatever was chosen, or else what its header line uses.
		let delimiter = payload.sourceFileDelimiter ?? "comma";

		if (payload.sourceFileType === "csv" && !payload.sourceFileDelimiter) {
			const detected = await QCFileSchemaRepo.detectDelimiter(stream, result.ContentLength);

			stream = detected.stream;
			delimiter = detected.delimiter;
		}

		const rows = await QCFileSchemaRepo.readRowsByFileType(stream, payload.sourceFileType, MAX_SCHEMA_ROWS, delimiter);

		if (!rows.length) {
			throw new ErrorResponse("No records found in file", 400);
		}

		const columns = QCFileSchemaRepo.inferColumns(rows);

		if (payload.sourceFileType === "csv") QCFileSchemaRepo.assertDelimiterFits(columns, delimiter);

		return {
			fileName: QCFileSchemaRepo.buildFileName(payload.sourceFileName, payload.sourceFileType),
			sourceFileType: payload.sourceFileType,
			sourceConnectionId: payload.sourceConnectionId,
			rowsScanned: rows.length,
			columns,
			sourceFileDelimiter: payload.sourceFileType === "csv" ? delimiter : undefined,
		};
	}

	async createFileStorageCheckConfig(payload: CreateFileStorageCheckConfigPayload) {
		const { config, columns } = payload;

		if (!columns.length) {
			throw new ErrorResponse("At least one column configuration is required", 400);
		}

		const existing = await db.query.fileBasedChecksConfig.findFirst({
			where: eq(fileBasedChecksConfig.configName, config.checkName),
		});

		if (existing) {
			throw new ErrorResponse("File based check configuration with this name already exists", 409);
		}

		const result = await db.transaction(async (tx) => {
			const configId = await this.idGenerationRepo.getNextId("file_based_checks_config", tx);

			const [createdConfig] = await tx
				.insert(fileBasedChecksConfig)
				.values({
					configId,
					configName: config.checkName,

					checkCategory: config.categoryId,
					workstream: config.workstreamId,
					impactedDownstream: config.impactedDownstreamIds,
					dataSource: config.dataSourceId,

					sourceConnectionId: config.sourceConnectionId,
					sourceFileType: config.sourceFileType,
					sourceFileName: config.sourceFileName,
					sourceFilePath: config.sourceFilePath || "/",
					sourceFileDelimiter: config.sourceFileDelimiter ?? null,

					targetConnectionId: config.targetConnectionId,
					targetTablePrefix: config.targetTableNamePrefix,

					landingTable: config.createLanding,
					landingTableName: config.createLanding ? config.landingTable : null,

					// schemaFileName: "",
					enabled: true,
					userId: payload.userId,
				})
				.returning();

			for (const column of columns) {
				if (column.lengthCheck && column.minLength != null && column.maxLength != null && column.maxLength < column.minLength) {
					throw new ErrorResponse(`"${column.field}": the maximum length cannot be below the minimum length`, 400);
				}
			}

			const detailsPayload: (typeof traditionalConfigDetails.$inferInsert)[] = columns.map((column) => ({
				configId,
				userId: payload.userId,

				field: column.field,
				dataType: column.dataType,
				columnOrder: column.columnOrder,

				primaryKeyCheck: Boolean(column.primaryKeyCheck),
				primaryKeyCheckCriticality: column.primaryKeyCheckCriticality || null,

				nullCheck: Boolean(column.nullCheck),
				nullCheckCriticality: column.nullCheckCriticality || null,

				duplicateCheck: Boolean(column.duplicateCheck),
				duplicateCheckCriticality: column.duplicateCheckCriticality || null,

				lengthCheck: Boolean(column.lengthCheck),
				minLength: column.minLength ?? null,
				maxLength: column.maxLength ?? null,
				lengthCheckCriticality: column.lengthCheckCriticality || null,

				formatCheck: Boolean(column.formatCheck),
				formatRegex: column.formatRegex || null,
				formatCheckCriticality: column.formatCheckCriticality || null,

				lovCheck: Boolean(column.lovCheck),
				lovs: column.lovs || null,
				lovCheckCriticality: column.lovCheckCriticality || null,

				riCheck: Boolean(column.riCheck),
				riConnectionId: column.riConnectionId || null,
				riReferenceTable: column.riReferenceTable || null,
				riFieldName: column.riFieldName || null,
				riCheckCriticality: column.riCheckCriticality || null,
			}));

			// console.log("DETAILS PAYLOAD ✅✅✅✅✅✅✅=>", JSON.stringify(detailsPayload, null, 2));

			const createdDetails = await tx.insert(traditionalConfigDetails).values(detailsPayload).returning();

			return {
				config: createdConfig,
				columns: createdDetails,
			};
		});

		return result;
	}

	async updateFileStorageCheckConfig(configId: string, payload: UpdateFileStorageCheckConfigPayload) {
		const existing = await db.query.fileBasedChecksConfig.findFirst({
			where: and(eq(fileBasedChecksConfig.configId, configId), eq(fileBasedChecksConfig.enabled, true)),
		});
		if (!existing) {
			throw new ErrorResponse("File based check configuration not found", 404);
		}

		if (payload.checkName && payload.checkName !== existing.configName) {
			const duplicate = await db.query.fileBasedChecksConfig.findFirst({
				where: eq(fileBasedChecksConfig.configName, payload.checkName),
			});

			if (duplicate) {
				throw new ErrorResponse("File based check configuration with this name already exists", 409);
			}
		}

		const updateData: Partial<typeof fileBasedChecksConfig.$inferInsert> = {};

		if (payload.checkName !== undefined) updateData.configName = payload.checkName;
		if (payload.categoryId !== undefined) updateData.checkCategory = payload.categoryId;
		if (payload.workstreamId !== undefined) updateData.workstream = payload.workstreamId;
		if (payload.impactedDownstreamIds !== undefined) updateData.impactedDownstream = payload.impactedDownstreamIds;
		if (payload.dataSourceId !== undefined) updateData.dataSource = payload.dataSourceId;

		if (payload.sourceConnectionId !== undefined) updateData.sourceConnectionId = payload.sourceConnectionId;
		if (payload.sourceFileType !== undefined) updateData.sourceFileType = payload.sourceFileType;
		if (payload.sourceFileName !== undefined) updateData.sourceFileName = payload.sourceFileName;
		if (payload.sourceFilePath !== undefined) updateData.sourceFilePath = payload.sourceFilePath || "/";
		if (payload.sourceFileDelimiter !== undefined) {
			updateData.sourceFileDelimiter = payload.sourceFileDelimiter;
		}

		if (payload.targetConnectionId !== undefined) updateData.targetConnectionId = payload.targetConnectionId;
		if (payload.targetTableNamePrefix !== undefined) updateData.targetTablePrefix = payload.targetTableNamePrefix;

		if (payload.createLanding !== undefined) {
			updateData.landingTable = payload.createLanding;
			updateData.landingTableName = payload.createLanding ? payload.landingTable || existing.landingTableName : null;
		}

		if (payload.landingTable !== undefined && (payload.createLanding ?? existing.landingTable)) {
			updateData.landingTableName = payload.landingTable;
		}

		updateData.updatedAt = new Date();

		const [updated] = await db
			.update(fileBasedChecksConfig)
			.set(updateData)
			.where(eq(fileBasedChecksConfig.configId, configId))
			.returning();

		if (!updated) {
			throw new ErrorResponse("Update failed", 500);
		}

		return updated;
	}

	async listFileConfigColumns(configId: string, onlyEnabled = false) {
		const config = await db.query.fileBasedChecksConfig.findFirst({
			where: eq(fileBasedChecksConfig.configId, configId),
		});

		// Switched-off checks do not exist as far as an analyst is concerned.
		if (!config || (onlyEnabled && !config.enabled)) {
			throw new ErrorResponse("File based check configuration not found", 404);
		}

		return await db
			.select()
			.from(traditionalConfigDetails)
			.where(eq(traditionalConfigDetails.configId, configId))
			.orderBy(traditionalConfigDetails.columnOrder);
	}

	async toggleFileStorageCheckConfig(configId: string) {
		const existing = await db.query.fileBasedChecksConfig.findFirst({
			where: eq(fileBasedChecksConfig.configId, configId),
		});

		if (!existing) {
			throw new ErrorResponse("File based check configuration not found", 404);
		}

		const [updated] = await db
			.update(fileBasedChecksConfig)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(fileBasedChecksConfig.configId, configId))
			.returning();

		return updated;
	}

	async listFileStorageCheckConfigs({ page = 1, limit = 20 }: PaginationType, onlyEnabled = false) {
		const offset = (page - 1) * limit;

		// An analyst is shown only the checks that are switched on.
		const visible = onlyEnabled ? eq(fileBasedChecksConfig.enabled, true) : undefined;

		const [{ value: total }] = await db.select({ value: count() }).from(fileBasedChecksConfig).where(visible);

		const rows = await db.select().from(fileBasedChecksConfig).where(visible).orderBy(desc(fileBasedChecksConfig.configId)).limit(limit).offset(offset);

		return Paginator.paginate(
			{
				limit: limit.toString(),
				page: page.toString(),
			},
			rows,
			total,
		);
	}
}
