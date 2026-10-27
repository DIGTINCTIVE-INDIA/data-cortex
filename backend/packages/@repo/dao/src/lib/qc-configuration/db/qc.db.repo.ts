import { and, count, db, dbBasedChecksConfig, desc, eq, traditionalConfigDetails } from "@repo/db";
import { PaginationType, Paginator } from "@repo/lib";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { TraditionalColumnCheckPayload } from "@repo/types";
import { IdGenerationRepo } from "../../common/id-generation.repo.js";
export class QCDBConfigurationRepo {
	private idGenerationRepo: IdGenerationRepo;
	constructor(idGenerationRepo: IdGenerationRepo) {
		this.idGenerationRepo = idGenerationRepo;
	}
	async createDbConfig(payload: any, myUserId: string) {
		return await db.transaction(async (tx) => {
			const configId = await this.idGenerationRepo.getNextId("db_based_checks_config", tx);

			const existing = await tx.query.dbBasedChecksConfig.findFirst({
				where: eq(dbBasedChecksConfig.configName, payload.checkName),
			});

			if (existing) {
				throw new ErrorResponse("Configuration with this name already exists", 409);
			}

			const [created] = await tx
				.insert(dbBasedChecksConfig)
				.values({
					userId: myUserId,
					configId: configId,

					configName: payload.checkName,
					checkCategory: payload.categoryId,
					workstream: payload.workstreamId,
					impactedDownstream: payload.impactedDownstreamIds,
					dataSource: payload.dataSourceId,

					sourceConnectionId: payload.sourceDbId,
					sourceTableName: payload.sourceTableName,

					targetConnectionId: payload.targetConnectionId,
					targetTablePrefix: payload.targetTableNamePrefix,

					landingTable: payload.createLanding,
					landingTableName: payload.landingTable ?? null,
					// schemaTableName: "public",
				})
				.returning();

			if (!created) {
				throw new ErrorResponse("Failed to create config", 500);
			}

			return created;
		});
	}

	/**
	 * Sets the per-field rules for an existing db-based check.
	 *
	 * traditional_config_details is shared with file-based checks and carries no
	 * foreign key -- PostgreSQL cannot reference two parent tables from one column
	 * -- so the parent is verified here before anything is written.
	 *
	 * Replaces rather than appends: the existing rows for this config are deleted
	 * and the supplied set inserted, both inside one transaction. Without that,
	 * re-sending a corrected set would duplicate every field (there is no unique
	 * constraint on (config_id, field)) and there is no other way to correct a
	 * mistake, since nothing deletes detail rows today.
	 */
	async setDbConfigColumns(configId: string, columns: TraditionalColumnCheckPayload[], myUserId: string) {
		if (!columns.length) {
			throw new ErrorResponse("At least one column configuration is required", 400);
		}

		const duplicateFields = columns.map(column => column.field).filter((field, index, all) => all.indexOf(field) !== index);

		if (duplicateFields.length) {
			throw new ErrorResponse(`Duplicate field(s) in payload: ${[...new Set(duplicateFields)].join(", ")}`, 400);
		}

		return await db.transaction(async tx => {
			// Stands in for the foreign key this table cannot have.
			const config = await tx.query.dbBasedChecksConfig.findFirst({
				where: and(eq(dbBasedChecksConfig.configId, configId), eq(dbBasedChecksConfig.enabled, true)),
			});

			if (!config) {
				throw new ErrorResponse("DB based check configuration not found", 404);
			}

			const replaced = await tx.delete(traditionalConfigDetails).where(eq(traditionalConfigDetails.configId, configId)).returning();

			for (const column of columns) {
				if (column.lengthCheck && column.minLength != null && column.maxLength != null && column.maxLength < column.minLength) {
					throw new ErrorResponse(`"${column.field}": the maximum length cannot be below the minimum length`, 400);
				}
			}

			const detailsPayload: (typeof traditionalConfigDetails.$inferInsert)[] = columns.map(column => ({
				configId,
				userId: myUserId,

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

			const createdDetails = await tx.insert(traditionalConfigDetails).values(detailsPayload).returning();

			return {
				configId,
				replacedCount: replaced.length,
				columns: createdDetails,
			};
		});
	}

	/** Field rules for a db-based check, in UI column order. */
	async listDbConfigColumns(configId: string, onlyEnabled = false) {
		const config = await db.query.dbBasedChecksConfig.findFirst({
			where: eq(dbBasedChecksConfig.configId, configId),
		});

		// Switched-off checks do not exist as far as an analyst is concerned.
		if (!config || (onlyEnabled && !config.enabled)) {
			throw new ErrorResponse("DB based check configuration not found", 404);
		}

		return await db
			.select()
			.from(traditionalConfigDetails)
			.where(eq(traditionalConfigDetails.configId, configId))
			.orderBy(traditionalConfigDetails.columnOrder);
	}

	async updateDbConfig(configId: string, payload: any) {
		const existing = await db.query.dbBasedChecksConfig.findFirst({
			where: eq(dbBasedChecksConfig.configId, configId),
		});

		if (!existing) {
			throw new ErrorResponse("Config not found", 404);
		}

		// Check duplicate config name
		if (payload.checkName) {
			const duplicate = await db.query.dbBasedChecksConfig.findFirst({
				where: eq(dbBasedChecksConfig.configName, payload.checkName),
			});

			if (duplicate && duplicate.configId !== configId) {
				throw new ErrorResponse("Configuration with this name already exists", 409);
			}
		}

		const updateData: Partial<typeof dbBasedChecksConfig.$inferInsert> = {};

		if (payload.checkName !== undefined) {
			updateData.configName = payload.checkName;
		}

		if (payload.categoryId !== undefined) {
			updateData.checkCategory = payload.categoryId;
		}

		if (payload.workstreamId !== undefined) {
			updateData.workstream = payload.workstreamId;
		}

		if (payload.impactedDownstreamIds !== undefined) {
			updateData.impactedDownstream = payload.impactedDownstreamIds;
		}

		if (payload.dataSourceId !== undefined) {
			updateData.dataSource = payload.dataSourceId;
		}

		if (payload.sourceDbId !== undefined) {
			updateData.sourceConnectionId = payload.sourceDbId;
		}

		if (payload.sourceTableName !== undefined) {
			updateData.sourceTableName = payload.sourceTableName;
		}

		if (payload.targetConnectionId !== undefined) {
			updateData.targetConnectionId = payload.targetConnectionId;
		}

		if (payload.targetTableNamePrefix !== undefined) {
			updateData.targetTablePrefix = payload.targetTableNamePrefix;
		}

		if (payload.createLanding !== undefined) {
			updateData.landingTable = payload.createLanding;
		}

		if (payload.landingTable !== undefined) {
			updateData.landingTableName = payload.landingTable;
		}

		updateData.updatedAt = new Date();

		const [updated] = await db.update(dbBasedChecksConfig).set(updateData).where(eq(dbBasedChecksConfig.configId, configId)).returning();

		if (!updated) {
			throw new ErrorResponse("Update failed", 500);
		}

		return updated;
	}

	async toggleDbConfig(configId: string) {
		const existing = await db.query.dbBasedChecksConfig.findFirst({
			where: eq(dbBasedChecksConfig.configId, configId),
		});

		if (!existing) {
			throw new ErrorResponse("Config not found", 404);
		}

		const [updated] = await db
			.update(dbBasedChecksConfig)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(dbBasedChecksConfig.configId, configId))
			.returning();

		return updated;
	}

	async listDbConfigs({ page = 1, limit = 20 }: PaginationType, onlyEnabled = false) {
		const offset = (page - 1) * limit;

		// const [{ total }] = await db.select({ total: count() }).from(dbBasedChecksConfig);
		// An analyst is shown only the checks that are switched on; a switched-off check is hidden from them entirely.
		const visible = onlyEnabled ? eq(dbBasedChecksConfig.enabled, true) : undefined;

		const [{ total }] = await db.select({ total: count() }).from(dbBasedChecksConfig).where(visible);
		// const items = await db.select().from(dbBasedChecksConfig).orderBy(desc(dbBasedChecksConfig.configId)).limit(limit).offset(offset);
		const items = await db.select().from(dbBasedChecksConfig).where(visible).orderBy(desc(dbBasedChecksConfig.configId)).limit(limit).offset(offset);

		return Paginator.paginate({ page: String(page), limit: String(limit) }, items, total);
	}
}
