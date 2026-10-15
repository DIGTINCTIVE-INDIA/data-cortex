import { and, databaseConnection, db, eq } from "@repo/db";
import { ConnectionsModule, snowflakeQuery } from "@repo/lib";
import EncryptionModule from "@repo/lib/encryption-module";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { DBExplorerColumn, DBExplorerConnection, DBExplorerQueryResult, ExecuteDbExplorerQueryPayload } from "@repo/types";
import { type FieldDef } from "pg";

type QueryExecutor = (connection: DBExplorerConnection, payload: ExecuteDbExplorerQueryPayload) => Promise<DBExplorerQueryResult>;

type SafePagination = {
	page: number;
	pageSize: number;
	offset: number;
	fetchLimit: number;
	maxPageSize: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 10_000;
const MAX_STATEMENT_TIMEOUT_MS = 30_000;

export class DBExplorerRepo {
	private readonly executors: Record<string, QueryExecutor>;

	constructor() {
		this.executors = {
			postgres: this.executePostgreQuery.bind(this),
			snowflake: this.executeSnowflakeQuery.bind(this),
		};
	}

	async executeQuery(connectionId: string, payload: ExecuteDbExplorerQueryPayload) {
		const connection = await this.getConnectionOrThrow(connectionId);

		const executor = this.executors[connection.databaseType];

		if (!executor) {
			throw new ErrorResponse(`${connection.databaseType} is not supported for DB explorer yet`, 400);
		}

		this.validateReadOnlySql(payload.sqlQuery);

		return executor(connection, payload);
	}

	private async getConnectionOrThrow(connectionId: string): Promise<DBExplorerConnection> {
		// const connection = await db.query.databaseConnection.findFirst({
		// 	where: eq(databaseConnection.connectionId, connectionId),
		// });

		const connection = await db.query.databaseConnection.findFirst({
			where: and(eq(databaseConnection.connectionId, connectionId), eq(databaseConnection.enabled, true)),
		});
		
		if (!connection) {
			throw new ErrorResponse("Connection not found", 404);
		}

		return connection as DBExplorerConnection;
	}

	private async executePostgreQuery(
		connection: DBExplorerConnection,
		payload: ExecuteDbExplorerQueryPayload,
	): Promise<DBExplorerQueryResult> {
		const pagination = this.getSafePagination(payload);
		const userSql = this.normalizeUserSql(payload.sqlQuery);

		const decryptedSecret = EncryptionModule.decrypt(connection.secret);

		const pool = ConnectionsModule.getPostgresInstance({ ...connection, secret: decryptedSecret });

		const client = await pool.connect();

		try {
			await client.query("BEGIN READ ONLY");
			await client.query(`SET LOCAL statement_timeout = '${MAX_STATEMENT_TIMEOUT_MS}ms'`);
			await client.query(`SET LOCAL search_path TO ${this.quotePostgresIdentifier(connection.dbSchema)}`);

			const paginatedSql = `
				SELECT *
				FROM (
				${userSql}
				) AS db_explorer_user_query
				LIMIT $1
				OFFSET $2
     		`;

			/**
			 * We fetch one extra row to know whether the next page exists.
			 * We still return only pageSize rows to the frontend.
			 */
			const result = await client.query(paginatedSql, [pagination.fetchLimit, pagination.offset]);

			await client.query("COMMIT");

			const rawRows = result.rows ?? [];
			const hasMore = rawRows.length > pagination.pageSize;
			const rows = hasMore ? rawRows.slice(0, pagination.pageSize) : rawRows;

			return {
				rows,
				columns: this.mapPostgresColumns(result.fields),
				pagination: {
					page: pagination.page,
					pageSize: pagination.pageSize,
					returnedRows: rows.length,
					offset: pagination.offset,
					hasMore,
					maxPageSize: pagination.maxPageSize,
				},
				executedAt: new Date().toISOString(),
			};
		} catch (error: unknown) {
			try {
				await client.query("ROLLBACK");
			} catch {
				// Ignore rollback failure.
			}

			throw new ErrorResponse(this.getPostgresErrorMessage(error), 400);
		} finally {
			client.release();
			await pool.end();
		}
	}

	private async executeSnowflakeQuery(
		connection: DBExplorerConnection,
		payload: ExecuteDbExplorerQueryPayload,
	): Promise<DBExplorerQueryResult> {
		const pagination = this.getSafePagination(payload);
		const userSql = this.normalizeUserSql(payload.sqlQuery);

		const config = {
			databaseType: "snowflake" as const,
			host: connection.host,
			port: connection.port,
			databaseName: connection.databaseName,
			username: connection.username,
			dbSchema: connection.dbSchema,
			secret: EncryptionModule.decrypt(connection.secret),
			secretType: connection.secretType,
			additionalParams: connection.additionalParams,
		};

		try {
			// Snowflake has no read-only transaction to fall back on, so the guarantee here is
			// validateReadOnlySql plus whatever the connection's role is granted. The timeout
			// stops one careless query holding a warehouse open.
			const result = await snowflakeQuery(
				config,
				`SELECT * FROM (${userSql}) AS db_explorer_user_query LIMIT ? OFFSET ?`,
				[pagination.fetchLimit, pagination.offset],
				[
					`ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${Math.floor(MAX_STATEMENT_TIMEOUT_MS / 1000)}`,
					"ALTER SESSION SET QUERY_TAG = 'datacortex-db-explorer'",
				],
			);

			const hasMore = result.rows.length > pagination.pageSize;
			const rows = (hasMore ? result.rows.slice(0, pagination.pageSize) : result.rows).map(row => this.jsonSafeRow(row));

			return {
				rows,
				columns: result.columns.map(column => ({
					key: column.name,
					label: column.name,
					type: this.mapSnowflakeType(column.type),
				})),
				pagination: {
					page: pagination.page,
					pageSize: pagination.pageSize,
					returnedRows: rows.length,
					offset: pagination.offset,
					hasMore,
					maxPageSize: pagination.maxPageSize,
				},
				executedAt: new Date().toISOString(),
			};
		} catch (error: unknown) {
			const message = String((error as { message?: string })?.message ?? "");

			// Snowflake's SQL errors say exactly what is wrong ("invalid identifier 'X'"), which
			// is what someone writing a query needs, so they are passed through. Anything that
			// is about the connection itself is not the query author's business.
			if (/SQL compilation error|SQL execution error|Statement reached its statement or warehouse timeout/i.test(message)) {
				throw new ErrorResponse(message.replace(/^.*?SQL/i, "SQL").slice(0, 400), 400);
			}

			throw new ErrorResponse("Could not run the query on Snowflake. Check the connection and your permissions.", 400);
		}
	}

	/** The SDK reports Snowflake's internal names: NUMBER is "fixed" and FLOAT is "real". */
	private mapSnowflakeType(type?: string) {
		const names: Record<string, string> = { fixed: "number", real: "float", text: "varchar" };
		const key = (type ?? "").toLowerCase();

		return names[key] ?? key;
	}

	/**
	 * Snowflake hands back BigInt, Date, Buffer and objects; JSON.stringify rejects BigInt
	 * outright and would turn the rest into noise. Numbers that are safe stay numbers.
	 */
	private jsonSafeRow(row: Record<string, unknown>) {
		const out: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(row)) {
			if (typeof value === "bigint") out[key] = value.toString();
			else if (value instanceof Date) out[key] = value.toISOString();
			else if (Buffer.isBuffer(value)) out[key] = value.toString("hex");
			else out[key] = value;
		}

		return out;
	}

	private getSafePagination(payload: ExecuteDbExplorerQueryPayload): SafePagination {
		const rawPage = Number(payload.page ?? DEFAULT_PAGE);
		const rawPageSize = Number(payload.pageSize ?? DEFAULT_PAGE_SIZE);

		const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : DEFAULT_PAGE;

		const pageSize = Number.isFinite(rawPageSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawPageSize))) : DEFAULT_PAGE_SIZE;

		const offset = (page - 1) * pageSize;

		return {
			page,
			pageSize,
			offset,
			fetchLimit: pageSize + 1,
			maxPageSize: MAX_PAGE_SIZE,
		};
	}

	private normalizeUserSql(sqlQuery: string) {
		return sqlQuery.trim().replace(/;+\s*$/, "");
	}

	private validateReadOnlySql(sqlQuery: string) {
		const normalized = sqlQuery.trim();

		if (!normalized) {
			throw new ErrorResponse("SQL query is required", 400);
		}

		const withoutTrailingSemicolon = normalized.replace(/;\s*$/, "");

		if (withoutTrailingSemicolon.includes(";")) {
			throw new ErrorResponse("Only one SQL statement is allowed", 400);
		}

		const compactSql = withoutTrailingSemicolon
			.replace(/--.*$/gm, "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.trim()
			.toLowerCase();

		const isReadOnlyQuery = compactSql.startsWith("select") || compactSql.startsWith("with");

		if (!isReadOnlyQuery) {
			throw new ErrorResponse("Only SELECT queries are allowed", 400);
		}

		const blockedKeywords = [
			"insert",
			"update",
			"delete",
			"drop",
			"alter",
			"truncate",
			"create",
			"replace",
			"grant",
			"revoke",
			"merge",
			"call",
			"execute",
			"do",
			"copy",
			"vacuum",
			"analyze",
			"refresh",
			"reindex",
			"attach",
			"detach",
			"comment",
			"lock",
		];

		const blockedPattern = new RegExp(`\\b(${blockedKeywords.join("|")})\\b`, "i");

		if (blockedPattern.test(compactSql)) {
			throw new ErrorResponse("Only read-only SELECT queries are allowed", 400);
		}
	}

	private mapPostgresColumns(fields: FieldDef[] = []): DBExplorerColumn[] {
		return fields.map((field) => ({
			key: field.name,
			label: field.name,
			type: this.mapPostgresType(field.dataTypeID),
		}));
	}

	private mapPostgresType(dataTypeId?: number) {
		const typeMap: Record<number, string> = {
			16: "boolean",
			20: "bigint",
			21: "smallint",
			23: "integer",
			25: "text",
			700: "real",
			701: "double",
			1043: "varchar",
			1082: "date",
			1114: "timestamp",
			1184: "timestamptz",
			1700: "numeric",
			2950: "uuid",
			3802: "jsonb",
		};

		if (!dataTypeId) return "unknown";

		return typeMap[dataTypeId] ?? "unknown";
	}

	private quotePostgresIdentifier(identifier: string) {
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
			throw new ErrorResponse("Invalid database schema name", 400);
		}

		return `"${identifier.replace(/"/g, '""')}"`;
	}

	private getPostgresErrorMessage(error: unknown) {
		const pgError = error as { code?: string; message?: string };

		switch (pgError?.code) {
			case "42601":
				return "Invalid SQL syntax";

			case "42P01":
				return "Table does not exist";

			case "42703":
				return "Column does not exist";

			case "42501":
				return "Insufficient database permissions";

			case "57014":
				return "Query timeout. Please optimize the query or reduce the result size";

			case "28P01":
				return "Invalid database username or password";

			case "3D000":
				return "Database does not exist";

			default:
				return pgError?.message || "Failed to execute query";
		}
	}
}
