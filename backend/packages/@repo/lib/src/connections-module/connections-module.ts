import { TestConnectionPayload } from "@repo/types";
import { Pool } from "pg";

type PostgresConnectionConfig = {
	idleTimeoutMillis?: number;
	connectionTimeoutMillis?: number;
	max?: number;
} & TestConnectionPayload;

export class ConnectionsModule {
	constructor() {
		// Initialize the connections module
	}

	static getPostgresInstance(payload: PostgresConnectionConfig) {
		const pool = new Pool({
			host: payload.host,
			port: payload.port,
			database: payload.databaseName,
			user: payload.username,
			// node-postgres speaks `password`; the app speaks `secret`. This is the
			// one place the two meet.
			password: payload.secret,
			max: payload.max || 1,
			idleTimeoutMillis: payload.idleTimeoutMillis || 5000,
			connectionTimeoutMillis: payload.connectionTimeoutMillis || 5000,
			// `ssl: true` in node-postgres means "encrypt AND verify the certificate".
			// Managed providers (AWS RDS, Neon, Supabase) sign with their own CA, which
			// is not in Node's default trust store, so verification fails even though the
			// connection is fine. Encrypt without verifying instead -- the same thing the
			// app's own DATABASE_URL does (`sslmode=no-verify`) and what the custom-SQL
			// path already does. SSL stays on unless explicitly disabled.
			ssl: payload.additionalParams?.ssl === false ? false : { rejectUnauthorized: false },
		});

		return pool;
	}
}
