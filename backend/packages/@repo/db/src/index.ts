import { defineEnv } from "@repo/env";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { type PgTransaction } from "drizzle-orm/pg-core";
import Pg from "pg";
import z from "zod";

import * as schema from "./schema/index.js";

export const env = defineEnv({
	DATABASE_URL: z.string(),
});
export const client = new Pg.Pool({
	connectionString: env.DATABASE_URL,
	max: 10,
	// node-postgres closes an idle connection after 10 seconds by default. The database is
	// a network hop away, so opening a new one (TCP, TLS, auth) costs a couple of seconds,
	// and every request after a short pause paid it. Keep them for minutes instead, and
	// keepalive so a firewall does not silently drop one that is merely quiet.
	idleTimeoutMillis: 5 * 60_000,
	keepAlive: true,
	keepAliveInitialDelayMillis: 30_000,
	// Fail a request that cannot get a connection rather than hanging forever behind a
	// stuck query, and stop a runaway query from holding one indefinitely.
	connectionTimeoutMillis: 15_000,
	statement_timeout: 60_000,
});

/**
 * Opens the pool's connections ahead of the first request, so nobody's first page load
 * after a restart is the one that pays for them.
 */
export async function warmPool(connections = 4) {
	await Promise.all(Array.from({ length: connections }, () => client.query("select 1"))).catch(() => undefined);
}
const db = drizzle({ client, schema });
export type DrizzleTransaction = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type DrizzleDB = typeof db;
export * from "drizzle-orm";
export * from "./functions.js";
export * from "./schema/index.js";
export { db, drizzle };
