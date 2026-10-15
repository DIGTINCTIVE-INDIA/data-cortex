/**
 * Removes everything e2e-matrix.ts leaves behind if it was interrupted: configs named
 * "e2e <stamp> ...", the runs and results of those configs, and the e2e_* tables it wrote
 * into the Postgres and Snowflake targets.
 *
 *   pnpm --filter @repo/dao exec tsx src/scripts/e2e-cleanup.ts
 */
import fs from "node:fs";

import {
	checkRuns,
	customBusinessChecksConfig,
	db,
	dbBasedChecksConfig,
	fileBasedChecksConfig,
	fileConnection,
	inArray,
	like,
	results,
	traditionalConfigDetails,
} from "@repo/db";
import { snowflakeQuery } from "@repo/lib";
import pg from "pg";

const demo = Object.fromEntries(
	fs.readFileSync("../../../.env.demo", "utf8").split(/\r?\n/).filter(l => l.includes("=") && !l.startsWith("#"))
		.map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const SF = {
	databaseType: "snowflake" as const, host: demo.SNOWFLAKE_ACCOUNT!, port: 443, databaseName: demo.SNOWFLAKE_DATABASE!,
	username: demo.SNOWFLAKE_USER!, secret: demo.SNOWFLAKE_PRIVATE_KEY!.split(String.fromCharCode(92) + "n").join("\n"),
	secretType: "key_pair" as const, dbSchema: "PUBLIC", additionalParams: { warehouse: demo.SNOWFLAKE_WAREHOUSE, account: demo.SNOWFLAKE_ACCOUNT },
} as any;

const line = fs.readFileSync("../../../.env", "utf8").split(/\r?\n/).find(l => l.startsWith("DATABASE_URL="))!;
const url = new URL(line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, ""));

const dbIds = (await db.select({ id: dbBasedChecksConfig.configId }).from(dbBasedChecksConfig).where(like(dbBasedChecksConfig.configName, "e2e %"))).map(r => r.id);
const fileIds = (await db.select({ id: fileBasedChecksConfig.configId }).from(fileBasedChecksConfig).where(like(fileBasedChecksConfig.configName, "e2e %"))).map(r => r.id);
const customIds = (await db.select({ id: customBusinessChecksConfig.checkId }).from(customBusinessChecksConfig).where(like(customBusinessChecksConfig.checkName, "e2e %"))).map(r => r.id);
const all = [...dbIds, ...fileIds, ...customIds];
console.log("configs:", all.join(" ") || "none");

if (all.length) {
	const runs = await db.select({ id: checkRuns.runId }).from(checkRuns).where(inArray(checkRuns.configId, all));
	if (runs.length) {
		await db.delete(results).where(inArray(results.jobId, runs.map(r => `JOB_${r.id}`)));
		await db.delete(checkRuns).where(inArray(checkRuns.runId, runs.map(r => r.id)));
	}
	console.log("runs removed:", runs.length);
}
if (dbIds.length || fileIds.length) await db.delete(traditionalConfigDetails).where(inArray(traditionalConfigDetails.configId, [...dbIds, ...fileIds]));
if (dbIds.length) await db.delete(dbBasedChecksConfig).where(inArray(dbBasedChecksConfig.configId, dbIds));
if (fileIds.length) await db.delete(fileBasedChecksConfig).where(inArray(fileBasedChecksConfig.configId, fileIds));
await db.delete(fileConnection).where(like(fileConnection.connectionName, "e2e %"));
if (customIds.length) await db.delete(customBusinessChecksConfig).where(inArray(customBusinessChecksConfig.checkId, customIds));

for (const database of ["testing_data_cortex", "demo_crm", "demo_analytics"]) {
	url.pathname = "/" + database;
	const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
	await client.connect();
	const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE 'e2e\\_%'")).rows;
	for (const t of tables) await client.query(`DROP TABLE IF EXISTS public."${t.table_name}"`);
	console.log(`postgres ${database}: dropped ${tables.length} table(s)`);
	await client.end();
}

const sfTables = (await snowflakeQuery(SF, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC' AND TABLE_NAME LIKE 'E2E\\_%'")).rows as any[];
for (const t of sfTables) await snowflakeQuery(SF, `DROP TABLE IF EXISTS "${t.TABLE_NAME}"`);
console.log(`snowflake: dropped ${sfTables.length} table(s)`);

process.exit(0);
