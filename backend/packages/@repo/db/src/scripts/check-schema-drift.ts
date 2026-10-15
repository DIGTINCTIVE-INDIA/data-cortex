/**
 * Compares every table the Drizzle schema declares against the live database.
 *
 * The engine-side check only covers the 12 tables dc-engine maps, so it is blind
 * to the rest of the application (notifications, id_sequences, the libraries).
 * This one walks the whole schema, which is the actual source of truth.
 *
 *   pnpm --filter @repo/db tsx src/scripts/check-schema-drift.ts
 *
 * Exit 0 = schema and database agree. Exit 1 = drift, listed.
 */
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { Pool } from "pg";

import * as schema from "../schema/index.js";

type LiveColumn = { table_name: string; column_name: string };

async function main() {
	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		console.error("DATABASE_URL is not set");
		process.exit(1);
	}

	// A throwaway local Postgres (the deploy test) has no TLS; the dev RDS requires it.
	const pool = new Pool({
		connectionString,
		ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
	});

	const { rows } = await pool.query<LiveColumn>(
		`select table_name, column_name
		 from information_schema.columns
		 where table_schema = 'public'`,
	);

	const live = new Map<string, Set<string>>();

	for (const row of rows) {
		if (!live.has(row.table_name)) live.set(row.table_name, new Set());
		live.get(row.table_name)!.add(row.column_name);
	}

	const problems: string[] = [];
	const declared = new Set<string>();

	for (const value of Object.values(schema)) {
		if (!is(value, PgTable)) continue;

		const config = getTableConfig(value);
		declared.add(config.name);

		const liveColumns = live.get(config.name);

		if (!liveColumns) {
			problems.push(`${config.name}: table missing from database`);
			continue;
		}

		const missing = config.columns.map(c => c.name).filter(name => !liveColumns.has(name));

		if (missing.length) {
			problems.push(`${config.name}: declared but not in database -> ${missing.join(", ")}`);
		}
	}

	// A table in the database that no longer appears in the schema is drift too --
	// usually a rename that only went one way.
	const orphans = [...live.keys()].filter(name => !declared.has(name) && !name.startsWith("drizzle"));

	console.log(`drizzle tables declared : ${declared.size}`);
	console.log(`public tables in database: ${live.size}`);

	if (orphans.length) console.log(`in database, not in schema: ${orphans.join(", ")}`);

	if (problems.length) {
		console.log("\nDRIFT:");
		for (const problem of problems) console.log(`  ${problem}`);
	} else {
		console.log("\nOK - every declared table and column exists");
	}

	await pool.end();
	process.exit(problems.length ? 1 : 0);
}

void main();
