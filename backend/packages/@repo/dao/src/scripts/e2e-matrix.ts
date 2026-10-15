/**
 * End to end, through the real HTTP API, the real engine and the real databases.
 *
 *   pnpm --filter @repo/dao exec tsx src/scripts/e2e-matrix.ts [only]
 *
 * Every combination of source and target that the product supports is configured with
 * the same calls the UI makes, run on the engine, and the outcome is compared with
 * numbers worked out BY HAND from the seeded data -- not computed by the engine's own
 * logic, so a shared mistake cannot hide:
 *
 *   database checks   Postgres | Snowflake  ->  Postgres | Snowflake     (4)
 *   custom SQL        Postgres | Snowflake  ->  Postgres | Snowflake     (4)
 *   file based        S3 file               ->  Postgres | Snowflake     (2)
 *   plus referential integrity across two connections
 *
 * Needs core-server on :3000 and the engine on :8000. It cleans up after itself: its
 * configs, runs, result rows and target tables are removed at the end.
 */
import fs from "node:fs";

import {
	and,
	customBusinessChecksConfig,
	databaseConnection,
	db,
	dbBasedChecksConfig,
	eq,
	fileBasedChecksConfig,
	fileConnection,
	inArray,
	checkRuns,
	results,
	sql,
	traditionalConfigDetails,
	usersTable,
} from "@repo/db";
import { TokenModule, snowflakeQuery } from "@repo/lib";
import pg from "pg";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";
const ONLY = process.argv[2];
const STAMP = Math.random().toString(16).slice(2, 6);

// ------------------------------------------------------------------ plumbing

const demoEnv = Object.fromEntries(
	fs
		.readFileSync("../../../.env.demo", "utf8")
		.split(/\r?\n/)
		.filter(l => l.includes("=") && !l.startsWith("#"))
		.map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const SF = {
	databaseType: "snowflake" as const,
	host: demoEnv.SNOWFLAKE_ACCOUNT!,
	port: 443,
	databaseName: demoEnv.SNOWFLAKE_DATABASE!,
	username: demoEnv.SNOWFLAKE_USER!,
	secret: demoEnv.SNOWFLAKE_PRIVATE_KEY!.split(String.fromCharCode(92) + "n").join("\n"),
	secretType: "key_pair" as const,
	dbSchema: "PUBLIC",
	additionalParams: { warehouse: demoEnv.SNOWFLAKE_WAREHOUSE, account: demoEnv.SNOWFLAKE_ACCOUNT },
} as any;

const pgUrl = (database: string) => {
	const line = fs.readFileSync("../../../.env", "utf8").split(/\r?\n/).find(l => l.startsWith("DATABASE_URL="))!;
	const url = new URL(line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, ""));
	url.pathname = "/" + database;
	return url.toString();
};

const pgQuery = async (database: string, text: string) => {
	const client = new pg.Client({ connectionString: pgUrl(database), ssl: { rejectUnauthorized: false } });
	await client.connect();
	try {
		return (await client.query(text)).rows as any[];
	} finally {
		await client.end();
	}
};

let failures = 0;
let checks = 0;
const ok = (name: string, pass: boolean, detail = "") => {
	checks += 1;
	if (!pass) failures += 1;
	console.log(`    ${pass ? "ok  " : "FAIL"}  ${name}${pass ? "" : `   ${detail}`}`);
};

const [admin] = await db
	.select()
	.from(usersTable)
	.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true)))
	.limit(1);

const headers = {
	authorization: `Bearer ${TokenModule.signAccessToken({ id: admin!.id, email: admin!.email, fullName: admin!.fullName, role: "admin" })}`,
	"content-type": "application/json",
};

const call = async (method: string, path: string, body?: unknown) => {
	const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};

const findId = (value: any, pattern: RegExp): string | undefined => {
	if (typeof value === "string") return pattern.test(value) ? value : undefined;
	if (value && typeof value === "object") {
		for (const inner of Object.values(value)) {
			const found = findId(inner, pattern);
			if (found) return found;
		}
	}
	return undefined;
};

// ------------------------------------------------------------------ the world

const PG_SRC = "DC0001"; // demo_crm       (hcp_sales, hcp_master)
const PG_TGT = "DC0003"; // testing_data_cortex
const SF_ID = "DC0006"; // DATACORTEX_MOCK.PUBLIC
// FC0001 points at a bucket that does not hold the sample file, so the run makes its own
// connection to the bucket in .env.demo that does, through the same endpoint the UI uses.
let FILE_CONN = "FC0001";

const libs = (await call("GET", "/api/libraries/qc-tags/all")).body?.data ?? {};
const first = (list: any[]) => list?.[0]?.id as number;
const LIB = {
	workstreamId: first(libs.workstream),
	categoryId: first(libs.category),
	dataSourceId: first(libs.dataSource),
	impactedDownstreamIds: [first(libs.impactedDownstream)],
};

const created = { fileConnections: [] as string[], db: [] as string[], file: [] as string[], custom: [] as string[], runs: [] as string[], prefixes: [] as { target: "pg" | "sf"; prefix: string }[] };

type Rule = Record<string, unknown>;
const rule = (field: string, dataType: string, columnOrder: number, extra: Rule = {}): Rule => ({
	field,
	dataType,
	columnOrder,
	primaryKeyCheck: false,
	nullCheck: false,
	duplicateCheck: false,
	lengthCheck: false,
	formatCheck: false,
	lovCheck: false,
	riCheck: false,
	...extra,
});
const M = "medium";

async function runAndWait(configId: string, source: "db" | "file" | "custom-sql") {
	const started = await call("POST", "/api/qc-configuration/run", { configId, source, idempotencyKey: `e2e-${STAMP}-${configId}-${Date.now()}` });
	const runId: string | undefined = started.body?.data?.runId;
	if (!runId) throw new Error(`run not accepted: ${started.status} ${JSON.stringify(started.body)}`);
	created.runs.push(runId);

	const deadline = Date.now() + 240_000;
	let job: any;
	while (Date.now() < deadline) {
		job = (await call("GET", `/api/jobs/${runId}`)).body?.data?.job;
		if (job && (job.status === "completed" || job.status === "failed")) break;
		await new Promise(r => setTimeout(r, 3000));
	}
	return { runId, job };
}

const resultRows = async (runId: string) =>
	db.select().from(results).where(eq(results.jobId, `JOB_${runId}`));

const keyOf = (row: { checkId: string; field: string | null }) => `${row.checkId}:${(row.field ?? "").toString().toLowerCase()}`;

/** expected: "TC005:sale_id" -> issue rows (number), or "passed". */
function assertResults(rows: Awaited<ReturnType<typeof resultRows>>, expected: Record<string, number>, structural: string[]) {
	const byKey = new Map(rows.map(r => [keyOf(r), r]));

	for (const id of structural) {
		const row = rows.find(r => r.checkId === id);
		ok(`${id} (structural) passes`, row?.checkStatus === "passed", `${row?.checkStatus} ${row?.failureReason ?? ""}`);
	}

	for (const [key, want] of Object.entries(expected)) {
		const row = byKey.get(key);
		const got = row ? Number(row.issueRows) : NaN;
		ok(`${key} -> ${want} row(s)`, Boolean(row) && got === want, `got ${row ? `${row.checkStatus} ${row.issueRows}` : "no row"}  ${row?.failureReason ?? ""}`);
	}

	const total = structural.length + Object.keys(expected).length;
	ok(`every check produced a row (${rows.length}/${total})`, rows.length === total, `rows=${rows.length}`);
	ok("no check was skipped as upstream_failed", !rows.some(r => r.checkStatus === "upstream_failed"));
	ok("only TC001-TC003 may abort", rows.every(r => !r.abort || ["TC001", "TC002", "TC003"].includes(r.checkId)));
	ok("no engine plumbing in failure text", rows.every(r => !/check_mapping_name|Traceback|psycopg2|__err|__valid|snapshot/i.test(r.failureReason ?? "")));
}

async function targetCount(target: "pg" | "sf", prefix: string) {
	if (target === "pg") {
		const tables = await pgQuery("testing_data_cortex", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '${prefix}%'`);
		const counts: Record<string, number> = {};
		for (const t of tables) counts[t.table_name] = Number((await pgQuery("testing_data_cortex", `SELECT count(*) n FROM public."${t.table_name}"`))[0].n);
		return counts;
	}
	const tables = await snowflakeQuery(SF, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC' AND UPPER(TABLE_NAME) LIKE ?", [prefix.toUpperCase() + "%"]);
	const counts: Record<string, number> = {};
	for (const t of tables.rows as any[]) {
		counts[t.TABLE_NAME] = Number(((await snowflakeQuery(SF, `SELECT COUNT(*) N FROM "${t.TABLE_NAME}"`)).rows[0] as any).N);
	}
	return counts;
}

const pick = (counts: Record<string, number>, suffix: RegExp) => Object.entries(counts).find(([name]) => suffix.test(name.toLowerCase()))?.[1];

// ------------------------------------------------------------- DB-based checks

type Side = { kind: "pg" | "sf"; connection: string };
const PG_SIDE: Side = { kind: "pg", connection: PG_SRC };
const SF_SIDE: Side = { kind: "sf", connection: SF_ID };
const PG_TARGET: Side = { kind: "pg", connection: PG_TGT };
const SF_TARGET: Side = { kind: "sf", connection: SF_ID };

// Worked out by hand from the seeded rows.
const PG_SOURCE = {
	table: "hcp_sales",
	columns: (riParent: { connection: string; table: string }) => [
		rule("sale_id", "string", 1, { primaryKeyCheck: true, primaryKeyCheckCriticality: M, duplicateCheck: true, duplicateCheckCriticality: M, lengthCheck: true, expectedLength: 8, lengthCheckCriticality: M }),
		rule("hcp_id", "string", 2, { nullCheck: true, nullCheckCriticality: M, riCheck: true, riConnectionId: riParent.connection, riReferenceTable: riParent.table, riFieldName: "hcp_id", riCheckCriticality: M }),
		rule("product", "string", 3, { lovCheck: true, lovs: "Cardiozen,Onvexa,Neurolyn,Dermaclear", lovCheckCriticality: M, formatCheck: true, formatRegex: "^[A-Z][a-z]+$", formatCheckCriticality: M }),
		rule("units", "integer", 4, { nullCheck: true, nullCheckCriticality: M }),
		rule("territory", "string", 5, { lovCheck: true, lovs: "East,West,Central,South", lovCheckCriticality: M }),
	],
	expected: {
		"TC005:sale_id": 2, // SALE1010 twice
		"TC008:sale_id": 2,
		"TC011:sale_id": 0, // every id is 8 characters
		"TC007:hcp_id": 1, // SALE1024
		"TC006:hcp_id": 1, // HCP0099 has no parent; the null is NOT a broken reference
		"TC009:product": 1, // CardioZen
		"TC010:product": 1, // CardioZen
		"TC007:units": 1, // SALE1005
		"TC009:territory": 1, // SALE1022 is null
	} as Record<string, number>,
	total: 25,
	failingRows: 7, // 1010 x2, 1024, 1005, 1022, 1019, 1003
};

const SF_SOURCE = {
	table: "CUSTOMERS",
	columns: () => [
		rule("CUSTOMER_ID", "integer", 1, { primaryKeyCheck: true, primaryKeyCheckCriticality: M }),
		rule("EMAIL", "string", 2, { nullCheck: true, nullCheckCriticality: M, duplicateCheck: true, duplicateCheckCriticality: M, formatCheck: true, formatRegex: "^[^@]+@[^@]+[.][a-z]+$", formatCheckCriticality: M }),
		rule("REGION", "string", 3, { lovCheck: true, lovs: "US,EU", lovCheckCriticality: M, lengthCheck: true, expectedLength: 2, lengthCheckCriticality: M }),
	],
	expected: {
		"TC005:customer_id": 6, // ids 1, 5 and 8 each appear twice
		"TC007:email": 2, // ids 3 and 6
		"TC008:email": 5, // alice x2 and frank x3
		"TC010:email": 2, // the two nulls
		"TC009:region": 2, // MARS, PLUTO
		"TC011:region": 2, // MARS (4 chars), PLUTO (5)
	} as Record<string, number>,
	total: 12,
	failingRows: 11, // everything except bob (id 2)
};

async function dbCombo(source: Side, target: Side) {
	const label = `database check   ${source.kind.toUpperCase()} -> ${target.kind.toUpperCase()}`;
	if (ONLY && !label.toLowerCase().includes(ONLY.toLowerCase())) return;
	console.log(`\n${label}`);

	const spec = source.kind === "pg" ? PG_SOURCE : SF_SOURCE;
	const prefix = `e2e_${STAMP}_db_${source.kind}${target.kind}`;
	created.prefixes.push({ target: target.kind, prefix });

	const create = await call("POST", "/api/qc-configuration/db/create-check", {
		checkName: `e2e ${STAMP} db ${source.kind}->${target.kind}`,
		...LIB,
		sourceDbId: source.connection,
		sourceTableName: spec.table,
		targetConnectionId: target.connection,
		targetTableNamePrefix: prefix,
		createLanding: false,
	});
	const configId = create.body?.data?.config?.configId as string | undefined;
	ok("config created", Boolean(configId), `${create.status} ${JSON.stringify(create.body).slice(0, 200)}`);
	if (!configId) return;
	created.db.push(configId);

	const columns = source.kind === "pg" ? PG_SOURCE.columns({ connection: PG_SRC, table: "hcp_master" }) : SF_SOURCE.columns();
	const set = await call("POST", "/api/qc-configuration/db/set-columns", { configId, columns });
	ok("field rules saved", set.status === 200, `${set.status} ${JSON.stringify(set.body).slice(0, 300)}`);

	const { runId, job } = await runAndWait(configId, "db");
	ok("job completed", job?.status === "completed", `${job?.status} ${job?.error ?? ""}`);
	if (!runId || job?.status !== "completed") return;

	assertResults(await resultRows(runId), spec.expected, ["TC001", "TC002", "TC003", "TC004"]);

	const counts = await targetCount(target.kind, prefix);
	const valid = pick(counts, /valid$/);
	const err = pick(counts, /err$/);
	ok(`target tables written (${Object.keys(counts).join(", ") || "none"})`, valid !== undefined && err !== undefined);
	ok(`target _err has ${spec.failingRows} failing rows`, err === spec.failingRows, `got ${err}`);
	ok(`target _valid has ${spec.total - spec.failingRows} passing rows`, valid === spec.total - spec.failingRows, `got ${valid}`);
}

// ---------------------------------------------------------------- custom SQL

async function customCombo(source: Side, target: Side) {
	const label = `custom SQL       ${source.kind.toUpperCase()} -> ${target.kind.toUpperCase()}`;
	if (ONLY && !label.toLowerCase().includes(ONLY.toLowerCase())) return;
	console.log(`\n${label}`);

	const prefix = `e2e_${STAMP}_cs_${source.kind}${target.kind}`;
	created.prefixes.push({ target: target.kind, prefix });

	const query = source.kind === "pg" ? "SELECT * FROM hcp_sales WHERE territory = 'Central'" : "SELECT * FROM CUSTOMERS WHERE REGION = 'EU'";
	const wantFail = source.kind === "pg" ? 6 : 4;
	const total = source.kind === "pg" ? 25 : 12;

	const create = await call("POST", "/api/qc-configuration/custom-sql/create-check", {
		checkName: `e2e ${STAMP} sql ${source.kind}->${target.kind}`,
		...LIB,
		sourceConnectionId: source.connection,
		targetConnectionId: target.connection,
		targetTablePrefix: prefix,
		sqlQuery: query,
		criticality: "medium",
		errorMessage: "Rows in the excluded region",
	});
	const checkId = findId(create.body, /^CB\d+$/);
	ok("check created", Boolean(checkId), `${create.status} ${JSON.stringify(create.body).slice(0, 200)}`);
	if (!checkId) return;
	created.custom.push(checkId);

	const { runId, job } = await runAndWait(checkId, "custom-sql");
	ok("job completed", job?.status === "completed", `${job?.status} ${job?.error ?? ""}`);
	if (!runId || job?.status !== "completed") return;

	const rows = await resultRows(runId);
	ok("one result row", rows.length === 1, `${rows.length}`);
	const row = rows[0];
	ok(`${wantFail} failing / ${total - wantFail} passing`, Number(row?.issueRows) === wantFail && Number(row?.passedRows) === total - wantFail, `${row?.issueRows}/${row?.passedRows}`);
	ok("recorded as custom_sql and failed", row?.checkType === "custom_sql" && row?.checkStatus === "failed");
	ok("the configured message leads the failure text", (row?.failureReason ?? "").startsWith("Rows in the excluded region"), row?.failureReason ?? "");

	const counts = await targetCount(target.kind, prefix);
	ok(`target _err has ${wantFail} rows`, pick(counts, /err$/) === wantFail, JSON.stringify(counts));
	ok(`target _valid has ${total - wantFail} rows`, pick(counts, /valid$/) === total - wantFail, JSON.stringify(counts));
}

// ---------------------------------------------------------------- file based

const csv = fs
	.readFileSync("C:/Users/N9FB2~1.RAJ/AppData/Local/Temp/claude/C--Users-n-rajan-OneDrive---DIGTINCTIVE-India-Private-Limited-Desktop-Data-Cortex-DataCortex/5e265f05-6e66-4f4e-8379-c3935c358ac4/scratchpad/s3_hcp_sales.csv", "utf8")
	.trim()
	.split(/\r?\n/);
const header = csv[0]!.split(",");
const fileRows = csv.slice(1).map(line => Object.fromEntries(line.split(",").map((v, i) => [header[i]!, v])));

async function ensureFileConnection() {
	if (created.fileConnections.length) return;
	const res = await call("POST", "/api/file-storage/connections/add", {
		connectionName: `e2e ${STAMP} s3`,
		storageType: "s3",
		bucketOrContainerName: demoEnv.S3_BUCKET,
		region: demoEnv.S3_REGION,
		accessKeyId: demoEnv.S3_ACCESS_KEY,
		secretAccessKey: demoEnv.S3_SECRET_KEY,
	});
	const id = findId(res.body, /^FC\d+$/);
	ok("S3 connection created and tested through the API", Boolean(id), `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
	if (id) {
		FILE_CONN = id;
		created.fileConnections.push(id);
	}
}

async function fileCombo(target: Side) {
	const label = `file based       S3 -> ${target.kind.toUpperCase()}`;
	if (ONLY && !label.toLowerCase().includes(ONLY.toLowerCase())) return;
	console.log(`\n${label}`);
	await ensureFileConnection();

	const prefix = `e2e_${STAMP}_fb_${target.kind}`;
	created.prefixes.push({ target: target.kind, prefix });

	// Expected numbers come from the file itself, parsed here.
	const nulls = fileRows.filter(r => r.volume === "").length;
	const npiCount = new Map<string, number>();
	fileRows.forEach(r => npiCount.set(r.npi!, (npiCount.get(r.npi!) ?? 0) + 1));
	const dupRows = fileRows.filter(r => npiCount.get(r.npi!)! > 1).length;
	const badProduct = fileRows.filter(r => !["ALPHA", "BETA", "GAMMA"].includes(r.product!)).length;
	const badGeo = fileRows.filter(r => !/^US-(NY|CA|IL|FL)$/.test(r.geo_id!)).length;

	const columns = [
		rule("npi", "string", 1, { duplicateCheck: true, duplicateCheckCriticality: M }),
		rule("product", "string", 2, { lovCheck: true, lovs: "ALPHA,BETA,GAMMA", lovCheckCriticality: M }),
		rule("sale_date", "string", 3),
		rule("volume", "integer", 4, { nullCheck: true, nullCheckCriticality: M }),
		rule("sales_usd", "float", 5),
		rule("geo_id", "string", 6, { formatCheck: true, formatRegex: "^US-(NY|CA|IL|FL)$", formatCheckCriticality: M }),
	];

	const create = await call("POST", "/api/qc-configuration/file-storage/create-check", {
		config: {
			checkName: `e2e ${STAMP} file ->${target.kind}`,
			...LIB,
			sourceConnectionId: FILE_CONN,
			sourceFileType: "csv",
			sourceFileName: "hcp_sales",
			sourceFilePath: "Data_Cortex/",
			sourceFileDelimiter: "comma",
			targetConnectionId: target.connection,
			targetTableNamePrefix: prefix,
			createLanding: false,
			fileAvailableOn: "s3",
		},
		columns,
	});
	const configId = findId(create.body, /^FBC\d+$/);
	ok("config created", Boolean(configId), `${create.status} ${JSON.stringify(create.body).slice(0, 300)}`);
	if (!configId) return;
	created.file.push(configId);

	const { runId, job } = await runAndWait(configId, "file");
	ok("job completed", job?.status === "completed", `${job?.status} ${job?.error ?? ""}`);
	if (!runId || job?.status !== "completed") return;

	const expected: Record<string, number> = {
		"TC008:npi": dupRows,
		"TC009:product": badProduct,
		"TC007:volume": nulls,
		"TC010:geo_id": badGeo,
	};
	assertResults(await resultRows(runId), expected, ["TC001", "TC002", "TC003", "TC004"]);

	const failing = fileRows.filter(
		r => npiCount.get(r.npi!)! > 1 || !["ALPHA", "BETA", "GAMMA"].includes(r.product!) || r.volume === "" || !/^US-(NY|CA|IL|FL)$/.test(r.geo_id!),
	).length;
	const counts = await targetCount(target.kind, prefix);
	ok(`target _err has ${failing} failing rows`, pick(counts, /err$/) === failing, JSON.stringify(counts));
	// With no passing rows the engine writes no _valid table at all (it does not create an
	// empty one), so a missing table is read as zero rows.
	ok(`target _valid has ${fileRows.length - failing} passing rows`, (pick(counts, /valid$/) ?? 0) === fileRows.length - failing, JSON.stringify(counts));
}

// --------------------------------------------------- RI across two connections

async function crossConnectionRi() {
	const label = "referential integrity across two connections";
	if (ONLY && !label.toLowerCase().includes(ONLY.toLowerCase())) return;
	console.log(`\n${label}   (child in demo_crm, parent in testing_data_cortex)`);

	const parent = `e2e_${STAMP}_ri_parent`;
	await pgQuery("testing_data_cortex", `CREATE TABLE IF NOT EXISTS public."${parent}" (hcp_id text)`);
	const ids = (await pgQuery("demo_crm", "SELECT DISTINCT hcp_id FROM hcp_master WHERE hcp_id IS NOT NULL")).map(r => r.hcp_id);
	await pgQuery("testing_data_cortex", `INSERT INTO public."${parent}" VALUES ${ids.map(i => `('${i}')`).join(",")}`);

	const prefix = `e2e_${STAMP}_ri_xx`;
	created.prefixes.push({ target: "pg", prefix });

	const create = await call("POST", "/api/qc-configuration/db/create-check", {
		checkName: `e2e ${STAMP} cross ri`,
		...LIB,
		sourceDbId: PG_SRC,
		sourceTableName: "hcp_sales",
		targetConnectionId: PG_TGT,
		targetTableNamePrefix: prefix,
		createLanding: false,
	});
	const configId = create.body?.data?.config?.configId as string | undefined;
	ok("config created", Boolean(configId));
	if (!configId) return;
	created.db.push(configId);

	const columns = [
		rule("sale_id", "string", 1),
		rule("hcp_id", "string", 2, { riCheck: true, riConnectionId: PG_TGT, riReferenceTable: parent, riFieldName: "hcp_id", riCheckCriticality: M }),
		rule("product", "string", 3),
		rule("units", "integer", 4),
		rule("territory", "string", 5),
	];
	await call("POST", "/api/qc-configuration/db/set-columns", { configId, columns });

	const { runId, job } = await runAndWait(configId, "db");
	ok("job completed", job?.status === "completed", `${job?.status} ${job?.error ?? ""}`);
	if (!runId) return;

	const row = (await resultRows(runId)).find(r => r.checkId === "TC006");
	ok("RI finds the one orphan (HCP0099) when the parent is on another connection", row?.checkStatus === "failed" && Number(row?.issueRows) === 1, `${row?.checkStatus} ${row?.issueRows} ${row?.failureReason ?? ""}`);

	await pgQuery("testing_data_cortex", `DROP TABLE IF EXISTS public."${parent}"`);
}

// ----------------------------------------------------------------------- go

async function cleanup() {
	console.log("\ncleaning up");
	try {
		if (created.runs.length) {
			await db.delete(results).where(inArray(results.jobId, created.runs.map(id => `JOB_${id}`)));
			await db.delete(checkRuns).where(inArray(checkRuns.runId, created.runs));
		}
		if (created.db.length) {
			await db.delete(traditionalConfigDetails).where(inArray(traditionalConfigDetails.configId, created.db));
			await db.delete(dbBasedChecksConfig).where(inArray(dbBasedChecksConfig.configId, created.db));
		}
		if (created.file.length) {
			await db.delete(traditionalConfigDetails).where(inArray(traditionalConfigDetails.configId, created.file));
			await db.delete(fileBasedChecksConfig).where(inArray(fileBasedChecksConfig.configId, created.file));
		}
		if (created.fileConnections.length) await db.delete(fileConnection).where(inArray(fileConnection.connectionId, created.fileConnections));
		if (created.custom.length) await db.delete(customBusinessChecksConfig).where(inArray(customBusinessChecksConfig.checkId, created.custom));

		for (const { target, prefix } of created.prefixes) {
			if (target === "pg") {
				for (const t of await pgQuery("testing_data_cortex", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '${prefix}%'`)) {
					await pgQuery("testing_data_cortex", `DROP TABLE IF EXISTS public."${t.table_name}"`);
				}
			} else {
				const tables = await snowflakeQuery(SF, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC' AND UPPER(TABLE_NAME) LIKE ?", [prefix.toUpperCase() + "%"]);
				for (const t of tables.rows as any[]) await snowflakeQuery(SF, `DROP TABLE IF EXISTS "${t.TABLE_NAME}"`);
			}
		}
		console.log("  done");
	} catch (error) {
		console.log("  cleanup problem:", (error as Error).message);
	}
}

try {
	await dbCombo(PG_SIDE, PG_TARGET);
	await dbCombo(PG_SIDE, SF_TARGET);
	await dbCombo(SF_SIDE, PG_TARGET);
	await dbCombo(SF_SIDE, SF_TARGET);

	await customCombo(PG_SIDE, PG_TARGET);
	await customCombo(PG_SIDE, SF_TARGET);
	await customCombo(SF_SIDE, PG_TARGET);
	await customCombo(SF_SIDE, SF_TARGET);

	await fileCombo(PG_TARGET);
	await fileCombo(SF_TARGET);

	await crossConnectionRi();
} finally {
	await cleanup();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log(failures === 0 ? "E2E MATRIX OK" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
void sql;
void databaseConnection;
