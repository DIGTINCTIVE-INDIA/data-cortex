import { and, count, customBusinessChecksConfig, databaseConnection, db, desc, eq } from "@repo/db";
import { PaginationType, Paginator, snowflakeQuery } from "@repo/lib";
import EncryptionModule from "@repo/lib/encryption-module";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type {
	CreateCustomSqlCheckPayload,
	SqlEditorColumn,
	SqlEditorSchema,
	UpdateCustomSqlCheckPayload,
	ValidateQueryPayload,
} from "@repo/types";
import pg from "pg";
import { IdGenerationRepo } from "../../common/id-generation.repo.js";

export class CustomSqlCheckRepo {
	private idGenerationRepo: IdGenerationRepo;

	constructor(idGenerationRepo: IdGenerationRepo) {
		this.idGenerationRepo = idGenerationRepo;
	}

	async validateQuery(payload: ValidateQueryPayload) {
		const normalizedSqlQuery = this.normalizeSqlQuery(payload.sqlQuery);

		this.assertOnlySelectQuery(normalizedSqlQuery);

		const connection = await db.query.databaseConnection.findFirst({
			where: and(eq(databaseConnection.connectionId, payload.sourceConnectionId), eq(databaseConnection.enabled, true)),
		});

		if (!connection) {
			throw new ErrorResponse("Invalid source DB connection", 404);
		}

		if (connection.databaseType === "snowflake") {
			try {
				const result = await snowflakeQuery(
					this.snowflakeConfig(connection),
					`SELECT * FROM (${normalizedSqlQuery}) AS custom_sql_check_validation LIMIT 1`,
					[],
					["ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = 15"],
				);

				return {
					valid: true,
					rowsReturned: result.rows.length,
					rows: result.rows.map(row => this.jsonSafe(row)),
				};
			} catch (error) {
				throw new ErrorResponse(this.snowflakeSqlMessage(error), 400);
			}
		}

		if (connection.databaseType !== "postgres") {
			throw new ErrorResponse(`${connection.databaseType} is not supported for custom SQL checks`, 400);
		}

		const client = new pg.Client({
			host: connection.host,
			port: Number(connection.port),
			database: connection.databaseName,
			user: connection.username,
			password: EncryptionModule.decrypt(connection.secret),
			ssl: { rejectUnauthorized: false },
			connectionTimeoutMillis: 10000,
			query_timeout: 15000,
		});

		try {
			await client.connect();

			const validationQuery = `
				SELECT *
				FROM (${normalizedSqlQuery}) AS custom_sql_check_validation
				LIMIT 1
			`;

			const result = await client.query(validationQuery);

			return {
				valid: true,
				rowsReturned: result.rowCount ?? 0,
				rows: result.rows,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid SQL query";

			throw new ErrorResponse(message, 400);
		} finally {
			await client.end().catch(() => undefined);
		}
	}

	async createCustomSqlCheckConfig(payload: CreateCustomSqlCheckPayload, userId: string) {
		this.assertOnlySelectQuery(payload.sqlQuery);

		await this.validateQuery({
			sourceConnectionId: payload.sourceConnectionId,
			sqlQuery: payload.sqlQuery,
		});

		return await db.transaction(async (tx) => {
			const checkId = await this.idGenerationRepo.getNextId("custom_business_checks_config", tx);

			const duplicate = await tx.query.customBusinessChecksConfig.findFirst({
				where: eq(customBusinessChecksConfig.checkName, payload.checkName),
			});

			if (duplicate) {
				throw new ErrorResponse("Custom SQL check with this name already exists", 409);
			}

			const [created] = await tx
				.insert(customBusinessChecksConfig)
				.values({
					checkId,
					userId,
					checkName: payload.checkName,
					checkDescription: payload.checkDescription ?? null,

					checkCategory: payload.categoryId,
					workstream: payload.workstreamId,
					impactedDownstream: payload.impactedDownstreamIds,
					dataSource: payload.dataSourceId,

					sourceConnectionId: payload.sourceConnectionId,
					targetConnectionId: payload.targetConnectionId,

					targetTablePrefix: payload.targetTablePrefix,
					sqlQuery: payload.sqlQuery,
					criticality: payload.criticality,
					errorMessage: payload.errorMessage,
				})
				.returning();

			if (!created) {
				throw new ErrorResponse("Failed to create custom SQL check configuration", 500);
			}

			return created;
		});
	}

	async updateCustomSqlCheckConfig(payload: UpdateCustomSqlCheckPayload, checkId: string) {
		const existing = await db.query.customBusinessChecksConfig.findFirst({
			where: eq(customBusinessChecksConfig.checkId, checkId),
		});

		if (!existing) {
			throw new ErrorResponse("Custom SQL check configuration not found", 404);
		}

		const finalSourceConnectionId = payload.sourceConnectionId ?? existing.sourceConnectionId;
		const finalSqlQuery = payload.sqlQuery ?? existing.sqlQuery;

		this.assertOnlySelectQuery(finalSqlQuery);

		await this.validateQuery({
			sourceConnectionId: finalSourceConnectionId,
			sqlQuery: finalSqlQuery,
		});

		if (payload.checkName && payload.checkName !== existing.checkName) {
			const duplicate = await db.query.customBusinessChecksConfig.findFirst({
				where: eq(customBusinessChecksConfig.checkName, payload.checkName),
			});

			if (duplicate && duplicate.checkId !== checkId) {
				throw new ErrorResponse("Custom SQL check with this name already exists", 409);
			}
		}

		const [updated] = await db
			.update(customBusinessChecksConfig)
			.set({
				checkName: payload.checkName ?? existing.checkName,
				checkDescription: payload.checkDescription ?? existing.checkDescription,

				checkCategory: payload.categoryId ?? existing.checkCategory,
				workstream: payload.workstreamId ?? existing.workstream,
				impactedDownstream: payload.impactedDownstreamIds ?? existing.impactedDownstream,
				dataSource: payload.dataSourceId ?? existing.dataSource,

				sourceConnectionId: finalSourceConnectionId,
				targetConnectionId: payload.targetConnectionId ?? existing.targetConnectionId,

				targetTablePrefix: payload.targetTablePrefix ?? existing.targetTablePrefix,
				sqlQuery: finalSqlQuery,
				criticality: payload.criticality ?? existing.criticality,
				errorMessage: payload.errorMessage ?? existing.errorMessage,
				updatedAt: new Date(),
			})
			.where(eq(customBusinessChecksConfig.checkId, checkId))
			.returning();

		if (!updated) {
			throw new ErrorResponse("Failed to update custom SQL check configuration", 500);
		}

		return updated;
	}

	async toggleCustomSqlCheckConfig(checkId: string) {
		const existing = await db.query.customBusinessChecksConfig.findFirst({
			where: eq(customBusinessChecksConfig.checkId, checkId),
		});

		if (!existing) {
			throw new ErrorResponse("Custom SQL check configuration not found", 404);
		}

		const [updated] = await db
			.update(customBusinessChecksConfig)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(customBusinessChecksConfig.checkId, checkId))
			.returning();

		return updated;
	}

	async listCustomSqlCheckConfigs({ page = 1, limit = 20 }: PaginationType, onlyEnabled = false) {
		const offset = (page - 1) * limit;

		// An analyst is shown only the checks that are switched on.
		const visible = onlyEnabled ? eq(customBusinessChecksConfig.enabled, true) : undefined;

		const [{ total }] = await db.select({ total: count() }).from(customBusinessChecksConfig).where(visible);

		const items = await db
			.select()
			.from(customBusinessChecksConfig)
			.where(visible)
			.orderBy(desc(customBusinessChecksConfig.checkId))
			.limit(limit)
			.offset(offset);

		return Paginator.paginate({ page: String(page), limit: String(limit) }, items, total);
	}

	private assertOnlySelectQuery(sqlQuery: string) {
		const normalized = this.normalizeSqlQuery(sqlQuery);
		const lowered = normalized.toLowerCase();

		if (!lowered.startsWith("select")) {
			throw new ErrorResponse("Only SELECT queries are allowed", 400);
		}

		if (normalized.includes(";")) {
			throw new ErrorResponse("Multiple SQL statements are not allowed", 400);
		}

		const blockedKeywords = ["insert", "update", "delete", "drop", "alter", "truncate", "create", "grant", "revoke"];

		for (const keyword of blockedKeywords) {
			if (new RegExp(`\\b${keyword}\\b`, "i").test(normalized)) {
				throw new ErrorResponse(`Keyword '${keyword}' is not allowed`, 400);
			}
		}
	}

	async getSqlEditorSchema(connectionId: string) {
		const connection = await db.query.databaseConnection.findFirst({
			where: eq(databaseConnection.connectionId, connectionId),
		});

		if (!connection) {
			throw new ErrorResponse("Invalid source DB connection", 404);
		}

		if (!connection.enabled) {
			throw new ErrorResponse("Connection is deactivated", 400);
		}

		if (connection.databaseType === "snowflake") {
			try {
				const result = await snowflakeQuery(
					this.snowflakeConfig(connection),
					`SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION
					 FROM INFORMATION_SCHEMA.COLUMNS
					 WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA'
					 ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
				);

				const schemaMap = new Map<string, Map<string, SqlEditorColumn[]>>();

				for (const row of result.rows as Record<string, any>[]) {
					const tables = schemaMap.get(row.TABLE_SCHEMA) ?? new Map<string, SqlEditorColumn[]>();
					schemaMap.set(row.TABLE_SCHEMA, tables);

					const columns = tables.get(row.TABLE_NAME) ?? [];
					tables.set(row.TABLE_NAME, columns);

					columns.push({
						columnName: row.COLUMN_NAME,
						dataType: String(row.DATA_TYPE).toLowerCase(),
						nullable: row.IS_NULLABLE === "YES",
						position: Number(row.ORDINAL_POSITION),
					});
				}

				return {
					connectionId,
					databaseName: connection.databaseName,
					schemas: Array.from(schemaMap.entries()).map(([schemaName, tablesMap]) => ({
						schemaName,
						tables: Array.from(tablesMap.entries()).map(([tableName, columns]) => ({ tableName, columns })),
					})) as SqlEditorSchema[],
				};
			} catch (error) {
				throw new ErrorResponse(this.snowflakeSqlMessage(error), 400);
			}
		}

		if (connection.databaseType !== "postgres") {
			throw new ErrorResponse(`${connection.databaseType} is not supported for the custom SQL editor schema`, 400);
		}

		const client = new pg.Client({
			host: connection.host,
			port: Number(connection.port),
			database: connection.databaseName,
			user: connection.username,
			password: EncryptionModule.decrypt(connection.secret),
			ssl: {
				rejectUnauthorized: false,
			},
			connectionTimeoutMillis: 10000,
			query_timeout: 15000,
		});

		try {
			await client.connect();

			const result = await client.query<{
				table_schema: string;
				table_name: string;
				column_name: string;
				data_type: string;
				is_nullable: string;
				ordinal_position: number;
			}>(`
			SELECT
				table_schema,
				table_name,
				column_name,
				data_type,
				is_nullable,
				ordinal_position
			FROM information_schema.columns
			WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
			ORDER BY table_schema, table_name, ordinal_position
		`);

			const schemaMap = new Map<string, Map<string, SqlEditorColumn[]>>();

			for (const row of result.rows) {
				if (!schemaMap.has(row.table_schema)) {
					schemaMap.set(row.table_schema, new Map());
				}

				const tableMap = schemaMap.get(row.table_schema);

				if (!tableMap) continue;

				if (!tableMap.has(row.table_name)) {
					tableMap.set(row.table_name, []);
				}

				tableMap.get(row.table_name)?.push({
					columnName: row.column_name,
					dataType: row.data_type,
					nullable: row.is_nullable === "YES",
					position: row.ordinal_position,
				});
			}

			const schemas: SqlEditorSchema[] = Array.from(schemaMap.entries()).map(([schemaName, tablesMap]) => ({
				schemaName,
				tables: Array.from(tablesMap.entries()).map(([tableName, columns]) => ({
					tableName,
					columns,
				})),
			}));

			return {
				connectionId,
				databaseName: connection.databaseName,
				schemas,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to fetch database schema";

			throw new ErrorResponse(message, 400);
		} finally {
			await client.end().catch(() => undefined);
		}
	}

	/** The stored connection, in the shape the Snowflake helper takes. */
	private snowflakeConfig(connection: typeof databaseConnection.$inferSelect) {
		return {
			databaseType: "snowflake" as const,
			host: connection.host,
			port: connection.port,
			databaseName: connection.databaseName,
			username: connection.username,
			dbSchema: connection.dbSchema,
			secret: EncryptionModule.decrypt(connection.secret),
			secretType: connection.secretType,
			additionalParams: connection.additionalParams,
		} as any;
	}

	/**
	 * Snowflake hands back BigInt, Date and Buffer, which JSON.stringify rejects or mangles.
	 */
	private jsonSafe(row: Record<string, unknown>) {
		const out: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(row)) {
			if (typeof value === "bigint") out[key] = value.toString();
			else if (value instanceof Date) out[key] = value.toISOString();
			else if (Buffer.isBuffer(value)) out[key] = value.toString("hex");
			else out[key] = value;
		}

		return out;
	}

	/** SQL mistakes are the author's to fix, so they are passed on; connection trouble is not. */
	private snowflakeSqlMessage(error: unknown) {
		const message = String((error as { message?: string })?.message ?? "");

		if (/SQL compilation error|SQL execution error|timeout/i.test(message)) {
			return message.replace(/^.*?SQL/i, "SQL").slice(0, 400);
		}

		return "Could not run the query on Snowflake. Check the connection and your permissions.";
	}

	private normalizeSqlQuery(sqlQuery: string) {
		return sqlQuery.trim().replace(/;+\s*$/g, "");
	}
}
