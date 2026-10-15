import { and, count, databaseConnection, db, desc, drizzle, eq, sql } from "@repo/db";
import { ConnectionsModule, PaginationType, Paginator, snowflakeQuery } from "@repo/lib";
import EncryptionModule from "@repo/lib/encryption-module";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type {
	AddConnectionPayload,
	GetColumnsResponse,
	GetTablesResponse,
	TestConnectionPayload,
	TestConnectionResponse,
	UpdateConnectionPayload,
} from "@repo/types";
import { logger } from "../../../../logger/src/logger.js";
import { IdGenerationRepo } from "../common/id-generation.repo.js";

export class DbConnectionRepo {
	private idGenerationRepo: IdGenerationRepo;
	constructor(idGenerationRepo: IdGenerationRepo) {
		this.idGenerationRepo = idGenerationRepo;
	}

	/**
	 * -> checks uniqueness
	 * -> encrypts password
	 * -> stores connection
	 */
	async addConnection(payload: AddConnectionPayload, myUserId: string) {
		const { isValid, errorMessage } = await this.testConnection(payload);

		if (!isValid) {
			throw new ErrorResponse(errorMessage ?? "Invalid credentials", 400);
		}

		return await db.transaction(async (tx) => {
			const existing = await tx.query.databaseConnection.findFirst({
				where: and(eq(databaseConnection.connectionName, payload.connectionName), eq(databaseConnection.enabled, true)),
			});

			if (existing) {
				throw new ErrorResponse("Connection with this name already exists", 400);
			}

			const secretType = payload.secretType ?? "password";
			const encryptedSecret = EncryptionModule.encrypt(payload.secret);

			// dc-engine selects Snowflake auth from additional_params.auth_method, so the
			// column is mirrored there rather than asking the engine to learn a second
			// place to look. Written here only, so the two cannot drift.
			const additionalParams = { ...(payload.additionalParams ?? {}), auth_method: secretType };
			const connectionId = await this.idGenerationRepo.getNextId("database_connection", tx);

			const [connection] = await tx
				.insert(databaseConnection)
				.values({
					connectionName: payload.connectionName,
					databaseType: payload.databaseType,
					host: payload.host,
					port: payload.port,
					databaseName: payload.databaseName,
					username: payload.username,
					secret: encryptedSecret,
					secretType,
					dbSchema: payload.dbSchema,
					additionalParams,
					userId: myUserId,
					connectionId: connectionId,
				})
				.returning();

			if (!connection) {
				throw new ErrorResponse("Failed to create connection", 500);
			}

			// never return the secret
			const { secret, ...safeConnection } = connection;

			return safeConnection;
		});
	}

	/**
	 * -> finds connection
	 * -> updates fields
	 * -> encrypts password if provided
	 */
	async updateConnection(connectionId: string, payload: UpdateConnectionPayload) {
		const existing = await db.query.databaseConnection.findFirst({
			where: and(eq(databaseConnection.connectionId, connectionId), eq(databaseConnection.enabled, true)),
		});

		if (!existing) {
			throw new ErrorResponse("Connection not found", 404);
		}

		const existingSecret = EncryptionModule.decrypt(existing.secret);

		const testPayload: TestConnectionPayload = {
			databaseType: payload.databaseType ?? existing.databaseType,
			host: payload.host ?? existing.host,
			port: payload.port ?? existing.port,
			databaseName: payload.databaseName ?? existing.databaseName,
			username: payload.username ?? existing.username,
			secret: payload.secret ?? existingSecret,
			secretType: (payload.secretType ?? existing.secretType) as any,
			dbSchema: payload.dbSchema ?? existing.dbSchema,
			additionalParams: payload.additionalParams ?? (existing.additionalParams as any) ?? undefined,
		};

		const testResult = await this.testConnection(testPayload);

		if (!testResult.isValid) {
			throw new ErrorResponse(testResult.errorMessage || "Invalid connection config", 400);
		}

		const updateData: Partial<typeof databaseConnection.$inferInsert> = {};

		if (payload.connectionName !== undefined) updateData.connectionName = payload.connectionName;
		if (payload.databaseType !== undefined) updateData.databaseType = payload.databaseType;
		if (payload.host !== undefined) updateData.host = payload.host;
		if (payload.port !== undefined) updateData.port = payload.port;
		if (payload.databaseName !== undefined) updateData.databaseName = payload.databaseName;
		if (payload.username !== undefined) updateData.username = payload.username;
		if (payload.dbSchema !== undefined) updateData.dbSchema = payload.dbSchema;
		if (payload.additionalParams !== undefined) updateData.additionalParams = payload.additionalParams;
		// if (payload.ssl !== undefined) updateData.ssl = payload.ssl;

		// only encrypt if the secret changed
		if (payload.secret !== undefined) {
			const nextSecretType = payload.secretType ?? "password";

			updateData.secret = EncryptionModule.encrypt(payload.secret);
			updateData.secretType = nextSecretType;
			updateData.additionalParams = {
				...((payload.additionalParams ?? existing.additionalParams ?? {}) as Record<string, unknown>),
				auth_method: nextSecretType,
			};
		}

		const [updated] = await db
			.update(databaseConnection)
			.set(updateData)
			.where(eq(databaseConnection.connectionId, connectionId))
			.returning();

		if (!updated) {
			throw new ErrorResponse("Failed to update connection", 500);
		}

		const { secret, ...safeConnection } = updated;

		return safeConnection;
	}

	/**
	 * -> deletes connection
	 */
	async toggleConnection(connectionId: string) {
		const existing = await db.query.databaseConnection.findFirst({
			where: eq(databaseConnection.connectionId, connectionId),
		});

		if (!existing) {
			throw new ErrorResponse("Connection not found", 404);
		}

		const [updated] = await db
			.update(databaseConnection)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(databaseConnection.connectionId, connectionId))
			.returning();

		return updated;
	}

	/**
	 * -> paginated list
	 */
	async listConnections({ limit = 20, page = 1 }: PaginationType) {
		const offset = (page - 1) * limit;

		const [totalResult, connections] = await Promise.all([
			db.select({ total: count() }).from(databaseConnection),
			db
				.select({
					connectionId: databaseConnection.connectionId,
					connectionName: databaseConnection.connectionName,
					databaseType: databaseConnection.databaseType,
					host: databaseConnection.host,
					port: databaseConnection.port,
					databaseName: databaseConnection.databaseName,
					username: databaseConnection.username,
					dbSchema: databaseConnection.dbSchema,
					additionalParams: databaseConnection.additionalParams,
					enabled: databaseConnection.enabled,
					deactivatedAt: databaseConnection.deactivatedAt,
					createdAt: databaseConnection.createdAt,
					updatedAt: databaseConnection.updatedAt,
				})
				.from(databaseConnection)
				.orderBy(desc(databaseConnection.connectionId))
				.limit(limit)
				.offset(offset),
		]);

		const total = totalResult[0]?.total ?? 0;

		return Paginator.paginate(
			{
				limit: limit.toString(),
				page: page.toString(),
			},
			connections,
			total,
		);
	}

	/** Snowflake's own error codes, turned into something a person can act on. */
	private snowflakeMessage(error: any): string {
		const code = String(error?.code ?? "");
		const text = String(error?.message ?? "");

		if (code === "390100" || /incorrect username or password/i.test(text)) return "Invalid username or password.";
		if (code === "390144" || /jwt token is invalid|JWT/i.test(text)) {
			return "Snowflake rejected the key. Check that its public key is registered on this user.";
		}
		if (/DECODER|unsupported|bad decrypt|PEM/i.test(text)) {
			return "The private key could not be read. Check it is a complete PEM key, and the passphrase if it is encrypted.";
		}
		if (/ENOTFOUND|could not connect|250001|Failed to connect/i.test(text)) {
			return "Could not reach Snowflake. Check the account identifier and network access.";
		}
		if (/warehouse/i.test(text)) return "The warehouse does not exist or this user cannot use it.";
		if (/database .* does not exist|not authorized/i.test(text)) return "The database does not exist or this user cannot use it.";

		return "Invalid Snowflake configuration or insufficient access.";
	}

	async testConnection(payload: TestConnectionPayload): Promise<TestConnectionResponse> {
		if (payload.databaseType === "snowflake") {
			try {
				await snowflakeQuery(payload, "SELECT 1");
				return { isValid: true, error: null, errorMessage: null };
			} catch (err: any) {
				logger.error(err);
				return { isValid: false, error: null, errorMessage: this.snowflakeMessage(err) };
			}
		}

		const pool = ConnectionsModule.getPostgresInstance(payload);
		const db = drizzle(pool);

		try {
			// Connection Test
			await db.execute(`SELECT 1`);

			return {
				isValid: true,
				error: null,
				errorMessage: null,
			};
		} catch (err: any) {
			logger.error(err);
			let message = "Unable to connect to the database";

			switch (err.code) {
				case "ECONNREFUSED":
					message = "Database server is unreachable. Check host and port.";
					break;

				case "ENOTFOUND":
					message = "Invalid database host.";
					break;

				case "28P01":
					message = "Invalid username or password.";
					break;

				case "3D000":
					message = "Database does not exist.";
					break;

				case "ETIMEDOUT":
					message = "Connection timed out. Please check network access.";
					break;

				default:
					message = "Invalid database configuration or insufficient access.";
			}

			return {
				isValid: false,
				error: null,
				errorMessage: message,
			};
		} finally {
			await pool.end();
		}
	}

	async getTables(payload: TestConnectionPayload): Promise<GetTablesResponse> {
		if (payload.databaseType === "snowflake") {
			try {
				// Snowflake folds unquoted names to upper case, and so does information_schema.
				const schema = payload.dbSchema.toUpperCase();

				const exists = await snowflakeQuery(
					payload,
					"SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
					[schema],
				);

				if (exists.rows.length === 0) {
					return { tables: [], error: null, errorMessage: `Schema "${payload.dbSchema}" does not exist` };
				}

				const result = await snowflakeQuery(
					payload,
					"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
					[schema],
				);

				return { tables: result.rows.map(row => String(row.TABLE_NAME)), error: null, errorMessage: null };
			} catch (err: any) {
				return { tables: [], error: err, errorMessage: this.snowflakeMessage(err) };
			}
		}

		const pool = ConnectionsModule.getPostgresInstance(payload);

		const db = drizzle(pool);

		try {
			// Ensure connection works
			await db.execute(sql`SELECT 1`);

			// Check schema exists
			const schemaCheck = await db.execute(
				sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${payload.dbSchema}`,
			);

			if (!schemaCheck.rows || schemaCheck.rows.length === 0) {
				return {
					tables: [],
					error: null,
					errorMessage: `Schema "${payload.dbSchema}" does not exist`,
				};
			}

			const result = await db.execute(sql`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = ${payload.dbSchema}
				AND table_type = 'BASE TABLE'
				ORDER BY table_name;
			`);

			const tables = result.rows.map((row: any) => row.table_name);

			return {
				tables,
				error: null,
				errorMessage: null,
			};
		} catch (err: any) {
			return {
				tables: [],
				error: err,
				errorMessage: err?.message || "Failed to fetch tables",
			};
		} finally {
			await pool.end();
		}
	}

	async getColumns(payload: TestConnectionPayload, tableName: string): Promise<GetColumnsResponse> {
		if (payload.databaseType === "snowflake") {
			try {
				const result = await snowflakeQuery(
					payload,
					"SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
					[payload.dbSchema.toUpperCase(), tableName.toUpperCase()],
				);

				return {
					columns: result.rows.map(row => ({
						columnName: String(row.COLUMN_NAME),
						dataType: String(row.DATA_TYPE),
						isNullable: row.IS_NULLABLE === "YES",
					})),
					error: null,
					errorMessage: null,
				};
			} catch (err: any) {
				return { columns: [], error: err, errorMessage: this.snowflakeMessage(err) };
			}
		}

		const pool = ConnectionsModule.getPostgresInstance(payload);

		const db = drizzle(pool);

		try {
			await db.execute(sql`SELECT 1`);

			const result = await db.execute(sql`
			SELECT
				column_name,
				data_type,
				is_nullable
			FROM information_schema.columns
			WHERE table_schema = ${payload.dbSchema}
			AND table_name = ${tableName}
			ORDER BY ordinal_position;
		`);

			const columns = result.rows.map((row: any) => ({
				columnName: row.column_name,
				dataType: row.data_type,
				isNullable: row.is_nullable === "YES",
			}));

			return {
				columns,
				error: null,
				errorMessage: null,
			};
		} catch (err: any) {
			return {
				columns: [],
				error: err,
				errorMessage: err?.message || "Failed to fetch columns",
			};
		} finally {
			await pool.end();
		}
	}

	async getConnectionTables(connectionId: string) {
		const connection = await db.query.databaseConnection.findFirst({
			where: eq(databaseConnection.connectionId, connectionId),
		});

		if (!connection) {
			throw new ErrorResponse("Connection not found", 404);
		}

		if (!connection.enabled) {
			throw new ErrorResponse("Connection is deactivated", 400);
		}

		if (connection.databaseType !== "postgres" && connection.databaseType !== "snowflake") {
			throw new ErrorResponse(`${connection.databaseType} is not supported yet`, 400);
		}

		const decryptedSecret = EncryptionModule.decrypt(connection.secret);

		const result = await this.getTables({
			host: connection.host,
			port: connection.port,
			databaseName: connection.databaseName,
			username: connection.username,
			databaseType: connection.databaseType,
			secret: decryptedSecret,
			secretType: connection.secretType as any,
			dbSchema: connection.dbSchema,
			additionalParams: (connection.additionalParams as any) ?? undefined,
		});

		if (result.errorMessage) {
			throw new ErrorResponse(result.errorMessage, 400);
		}

		return result.tables;
	}

	async getConnectionColumns(connectionId: string, tableName: string) {
		const connection = await db.query.databaseConnection.findFirst({
			where: eq(databaseConnection.connectionId, connectionId),
		});

		if (!connection) {
			throw new ErrorResponse("Connection not found", 404);
		}
		if (!connection.enabled) {
			throw new ErrorResponse("Connection is deactivated", 400);
		}

		if (connection.databaseType !== "postgres" && connection.databaseType !== "snowflake") {
			throw new ErrorResponse(`${connection.databaseType} is not supported yet`, 400);
		}

		const decryptedSecret = EncryptionModule.decrypt(connection.secret);

		const result = await this.getColumns(
			{
				host: connection.host,
				port: connection.port,
				databaseName: connection.databaseName,
				username: connection.username,
				databaseType: connection.databaseType,
				secret: decryptedSecret,
				secretType: connection.secretType as any,
				dbSchema: connection.dbSchema,
				additionalParams: (connection.additionalParams as any) ?? undefined,
			},
			tableName,
		);

		if (result.errorMessage) {
			throw new ErrorResponse(result.errorMessage, 400);
		}

		return result.columns;
	}
}
