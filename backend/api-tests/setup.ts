/**
 * One-click test setup, driven ONLY through the HTTP API (no database access, no internal code).
 *
 *   pnpm api:setup
 *
 * Reads api-tests/.env (all values are TEST_* variables) and creates, against a running core-server:
 *   - 2 Postgres, 2 Snowflake and 1 S3 file connection
 *   - database checks   SF->SF, PG->PG, SF->PG, PG->SF   (field rules included)
 *   - custom SQL checks SF->SF, PG->PG, SF->PG, PG->SF
 *   - file checks       S3->PG, S3->SF
 *   - an engineer user, an analyst user, and a service user that fires one check with its key
 *
 * It does not check results. It prints what it created so you can look at it yourself.
 * Snowflake steps are skipped while TEST_SF_PRIVATE_KEY is empty.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const env = (name: string, fallback = "") => (process.env[name] ?? "").trim() || fallback;
const BASE = env("TEST_API_URL", "http://127.0.0.1:3000");
const STAMP = Date.now().toString(36).slice(-5);

// ------------------------------------------------------------------ auth + http

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** HS256 token with the same payload the backend signs, so the API treats this script as the admin. */
function adminToken() {
	if (env("TEST_ADMIN_TOKEN")) return env("TEST_ADMIN_TOKEN");
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		id: env("TEST_ADMIN_ID"),
		email: env("TEST_ADMIN_EMAIL"),
		fullName: env("TEST_ADMIN_NAME", "Test Admin"),
		role: "admin",
		iat: now,
		exp: now + 24 * 3600,
	};
	const unsigned = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify(payload))}`;
	return `${unsigned}.${crypto.createHmac("sha256", env("TEST_ACCESS_TOKEN_SECRET")).update(unsigned).digest("base64url")}`;
}

const adminHeaders = { authorization: `Bearer ${adminToken()}`, "content-type": "application/json" };

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = adminHeaders) {
	const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
	return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

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

/** Every check that can be run; all of them are fired together at the end. */
type Fire = {
	configId: string;
	source: "db" | "custom-sql" | "file";
	label: string;
	srcConn: string; // connection the data is read from
	srcWhat: string; // table, query or file
	tgtConn: string; // connection the results are written to
	tgtWhat: string; // table name prefix
};
const toFire: Fire[] = [];
const runIds: Record<string, string | undefined> = {};

/** What was created, printed at the end. */
const created: [string, string][] = [];
const note = (what: string, id: string | undefined, res: { status: number; body: any }) => {
	if (id) {
		created.push([what, id]);
		console.log(`  ok    ${what}  ->  ${id}`);
	} else {
		console.log(`  FAIL  ${what}  (${res.status}) ${JSON.stringify(res.body).slice(0, 220)}`);
	}
	return id;
};

// ------------------------------------------------------------------ connections

const pg = (name: string, database: string) => ({
	connectionName: `${name} ${STAMP}`,
	databaseType: "postgres",
	host: env("TEST_PG_HOST"),
	port: Number(env("TEST_PG_PORT", "5432")),
	databaseName: database,
	username: env("TEST_PG_USER"),
	secret: env("TEST_PG_PASSWORD"),
	secretType: "password",
	dbSchema: env("TEST_PG_SCHEMA", "public"),
	additionalParams: { ssl: true },
});

const snowflake = (name: string, database: string, schema: string) => ({
	connectionName: `${name} ${STAMP}`,
	databaseType: "snowflake",
	host: env("TEST_SF_ACCOUNT"),
	port: 443,
	databaseName: database,
	username: env("TEST_SF_USER"),
	secret: env("TEST_SF_PRIVATE_KEY").split(String.fromCharCode(92) + "n").join("\n"),
	secretType: "key_pair",
	dbSchema: schema,
	additionalParams: { warehouse: env("TEST_SF_WAREHOUSE"), account: env("TEST_SF_ACCOUNT"), ...(env("TEST_SF_ROLE") ? { role: env("TEST_SF_ROLE") } : {}) },
});

// ------------------------------------------------------------------ check payloads

type Rule = Record<string, unknown>;
const M = "medium";
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

const PG_TABLE = env("TEST_PG_SOURCE_TABLE", "hcp_sales");
const SF_TABLE = env("TEST_SF_SOURCE_TABLE", "CUSTOMERS");

const pgRules = (connection: string) => [
	rule("sale_id", "string", 1, { primaryKeyCheck: true, primaryKeyCheckCriticality: M, duplicateCheck: true, duplicateCheckCriticality: M, lengthCheck: true, minLength: 8, maxLength: 8, lengthCheckCriticality: M }),
	rule("hcp_id", "string", 2, { nullCheck: true, nullCheckCriticality: M, riCheck: true, riConnectionId: connection, riReferenceTable: env("TEST_PG_PARENT_TABLE", "hcp_master"), riFieldName: "hcp_id", riCheckCriticality: M }),
	rule("product", "string", 3, { lovCheck: true, lovs: "Cardiozen,Onvexa,Neurolyn,Dermaclear", lovCheckCriticality: M, formatCheck: true, formatRegex: "^[A-Z][a-z]+$", formatCheckCriticality: M }),
	rule("units", "integer", 4, { nullCheck: true, nullCheckCriticality: M }),
	rule("territory", "string", 5, { lovCheck: true, lovs: "East,West,Central,South", lovCheckCriticality: M }),
];

const sfRules = () => [
	rule("CUSTOMER_ID", "integer", 1, { primaryKeyCheck: true, primaryKeyCheckCriticality: M, duplicateCheck: true, duplicateCheckCriticality: M }),
	rule("FULL_NAME", "string", 2, { nullCheck: true, nullCheckCriticality: M }),
	rule("EMAIL", "string", 3, { nullCheck: true, nullCheckCriticality: M, formatCheck: true, formatRegex: "^[^@]+@[^@]+[.][a-z]+$", formatCheckCriticality: M }),
	rule("COUNTRY", "string", 4, { lovCheck: true, lovs: "IN,US,GB,DE,FR", lovCheckCriticality: M, lengthCheck: true, minLength: 2, maxLength: 2, lengthCheckCriticality: M }),
	rule("AGE", "integer", 5, { nullCheck: true, nullCheckCriticality: M }),
	rule("STATUS", "string", 6, { lovCheck: true, lovs: "ACTIVE,TRIAL,CLOSED", lovCheckCriticality: M }),
];

const fileRules = () => [
	rule("npi", "string", 1, { duplicateCheck: true, duplicateCheckCriticality: M }),
	rule("product", "string", 2, { lovCheck: true, lovs: "ALPHA,BETA,GAMMA", lovCheckCriticality: M }),
	rule("sale_date", "string", 3),
	rule("volume", "integer", 4, { nullCheck: true, nullCheckCriticality: M }),
	rule("sales_usd", "float", 5),
	rule("geo_id", "string", 6, { formatCheck: true, formatRegex: "^US-(NY|CA|IL|FL)$", formatCheckCriticality: M }),
];

// ------------------------------------------------------------------ main

async function main() {
	console.log(`API ${BASE}   run ${STAMP}\n`);

	const libs = (await call("GET", "/api/libraries/qc-tags/all")).body?.data ?? {};
	if (!libs.workstream) {
		console.log("Could not read the libraries (is the server up, and is the admin token valid?). Stopping.");
		return;
	}
	const first = (list: any[]) => list?.[0]?.id as number;
	const LIB = {
		workstreamId: first(libs.workstream),
		categoryId: first(libs.category),
		dataSourceId: first(libs.dataSource),
		impactedDownstreamIds: [first(libs.impactedDownstream)],
	};

	// ---- connections
	console.log("Connections");
	// Snowflake is a PRODUCTION account. Two ways in, nothing destructive either way:
	//   - TEST_SF_SOURCE_CONNECTION_ID / TEST_SF_TARGET_CONNECTION_ID: reuse connections that already exist
	//   - TEST_SF_PRIVATE_KEY: create two new ones through the API
	// Checks only write tables whose names start with "apitest_"; the one run this script fires is Postgres only.
	const existingSource = env("TEST_SF_SOURCE_CONNECTION_ID");
	const existingTarget = env("TEST_SF_TARGET_CONNECTION_ID", existingSource);
	const withSnowflake = Boolean(env("TEST_SF_PRIVATE_KEY")) || Boolean(existingSource);
	if (withSnowflake) console.log(env("TEST_FIRE_CHECKS").toLowerCase() === "true" ? "  note  Snowflake is production: the checks fired below write apitest_* tables to it" : "  note  Snowflake is production: only configuration is created (TEST_FIRE_CHECKS is not true)");
	else console.log("  skip  Snowflake (set TEST_SF_SOURCE_CONNECTION_ID to reuse a connection, or TEST_SF_PRIVATE_KEY to create new ones)");

	const addDb = async (label: string, payload: object) => {
		const res = await call("POST", "/api/db/connections/add", payload);
		return note(label, findId(res.body, /^DC\d+$/), res);
	};
	const pgSource = await addDb("Postgres source", pg("api-test pg source", env("TEST_PG_SOURCE_DB", "demo_crm")));
	const pgTarget = await addDb("Postgres target", pg("api-test pg target", env("TEST_PG_TARGET_DB", "testing_data_cortex")));

	const useSfConnection = async (label: string, existing: string, create: () => object) => {
		if (existing) {
			created.push([label + " (existing)", existing]);
			console.log(`  ok    ${label}  ->  ${existing}  (existing connection reused)`);
			return existing;
		}
		return withSnowflake ? addDb(label, create()) : undefined;
	};
	const sfSource = await useSfConnection("Snowflake source", existingSource, () => snowflake("api-test sf source", env("TEST_SF_SOURCE_DATABASE"), env("TEST_SF_SOURCE_SCHEMA", "PUBLIC")));
	const sfTarget = await useSfConnection("Snowflake target", existingTarget, () => snowflake("api-test sf target", env("TEST_SF_TARGET_DATABASE", env("TEST_SF_SOURCE_DATABASE")), env("TEST_SF_TARGET_SCHEMA", "PUBLIC")));

	const fileRes = await call("POST", "/api/file-storage/connections/add", {
		connectionName: `api-test s3 ${STAMP}`,
		storageType: "s3",
		bucketOrContainerName: env("TEST_S3_BUCKET"),
		region: env("TEST_S3_REGION"),
		accessKeyId: env("TEST_S3_ACCESS_KEY"),
		secretAccessKey: env("TEST_S3_SECRET_KEY"),
	});
	const fileConn = note("S3 file connection", findId(fileRes.body, /^FC\d+$/), fileRes);

	// ---- the four source -> target pairs (Snowflake ones only when Snowflake is set up)
	type Side = { kind: "pg" | "sf"; src?: string; tgt?: string };
	const pairs = [
		{ source: "sf", target: "sf", src: sfSource, tgt: sfTarget },
		{ source: "pg", target: "pg", src: pgSource, tgt: pgTarget },
		{ source: "sf", target: "pg", src: sfSource, tgt: pgTarget },
		{ source: "pg", target: "sf", src: pgSource, tgt: sfTarget },
	].filter(p => p.src && p.tgt) as { source: "pg" | "sf"; target: "pg" | "sf"; src: string; tgt: string }[];
	void ({} as Side);

	// ---- database checks
	console.log("\nDatabase checks");
	const dbConfigs: string[] = [];
	for (const p of pairs) {
		const label = `${p.source.toUpperCase()} -> ${p.target.toUpperCase()}`;
		const create = await call("POST", "/api/qc-configuration/db/create-check", {
			checkName: `api-test ${STAMP} db ${label}`,
			...LIB,
			sourceDbId: p.src,
			sourceTableName: p.source === "pg" ? PG_TABLE : SF_TABLE,
			targetConnectionId: p.tgt,
			targetTableNamePrefix: `apitest_${STAMP}_db_${p.source}${p.target}`,
			createLanding: false,
		});
		const configId = create.body?.data?.config?.configId as string | undefined;
		if (!note(`db check ${label}`, configId, create)) continue;
		dbConfigs.push(configId!);
		toFire.push({ configId: configId!, source: "db", label: `db check ${label}`, srcConn: p.src, srcWhat: `table ${p.source === "pg" ? PG_TABLE : SF_TABLE}`, tgtConn: p.tgt, tgtWhat: `prefix apitest_${STAMP}_db_${p.source}${p.target}` });
		const rules = await call("POST", "/api/qc-configuration/db/set-columns", { configId, columns: p.source === "pg" ? pgRules(p.src) : sfRules() });
		if (rules.status !== 200) console.log(`  FAIL  field rules for ${configId} (${rules.status}) ${JSON.stringify(rules.body).slice(0, 200)}`);
	}

	// ---- custom SQL checks
	console.log("\nCustom SQL checks");
	const pgQuery = env("TEST_PG_CUSTOM_SQL", `SELECT * FROM ${PG_TABLE} WHERE territory = 'Central'`);
	const sfQuery = env("TEST_SF_CUSTOM_SQL", `SELECT * FROM ${SF_TABLE} WHERE AGE <> DATEDIFF('year', DATE_OF_BIRTH, CURRENT_DATE())`);
	for (const p of pairs) {
		const label = `${p.source.toUpperCase()} -> ${p.target.toUpperCase()}`;
		const create = await call("POST", "/api/qc-configuration/custom-sql/create-check", {
			checkName: `api-test ${STAMP} sql ${label}`,
			...LIB,
			sourceConnectionId: p.src,
			targetConnectionId: p.tgt,
			targetTablePrefix: `apitest_${STAMP}_cs_${p.source}${p.target}`,
			sqlQuery: p.source === "pg" ? pgQuery : sfQuery,
			criticality: "medium",
			errorMessage: "Rows matched the custom rule",
		});
		const customId = note(`custom SQL ${label}`, findId(create.body, /^CB\d+$/), create);
		if (customId) toFire.push({ configId: customId, source: "custom-sql", label: `custom SQL ${label}`, srcConn: p.src, srcWhat: `query ${p.source === "pg" ? pgQuery : sfQuery}`, tgtConn: p.tgt, tgtWhat: `prefix apitest_${STAMP}_cs_${p.source}${p.target}` });
	}

	// ---- file checks
	console.log("\nFile checks");
	const fileTargets = [
		{ kind: "pg", id: pgTarget },
		{ kind: "sf", id: sfTarget },
	].filter(t => t.id) as { kind: string; id: string }[];
	for (const t of fileTargets) {
		if (!fileConn) break;
		const create = await call("POST", "/api/qc-configuration/file-storage/create-check", {
			config: {
				checkName: `api-test ${STAMP} file S3->${t.kind.toUpperCase()}`,
				...LIB,
				sourceConnectionId: fileConn,
				sourceFileType: env("TEST_S3_FILE_TYPE", "csv"),
				sourceFileName: env("TEST_S3_FILE_NAME", "hcp_sales"),
				sourceFilePath: env("TEST_S3_FILE_PATH", "Data_Cortex/"),
				sourceFileDelimiter: "comma",
				targetConnectionId: t.id,
				targetTableNamePrefix: `apitest_${STAMP}_fb_${t.kind}`,
				createLanding: false,
				fileAvailableOn: "s3",
			},
			columns: fileRules(),
		});
		const fileId = note(`file check S3 -> ${t.kind.toUpperCase()}`, findId(create.body, /^FBC\d+$/), create);
		if (fileId) toFire.push({ configId: fileId, source: "file", label: `file check S3 -> ${t.kind.toUpperCase()}`, srcConn: fileConn, srcWhat: `file ${env("TEST_S3_FILE_PATH", "Data_Cortex/")}${env("TEST_S3_FILE_NAME", "hcp_sales")}.${env("TEST_S3_FILE_TYPE", "csv")}`, tgtConn: t.id, tgtWhat: `prefix apitest_${STAMP}_fb_${t.kind}` });
	}

	// ---- users
	console.log("\nUsers");
	for (const [role, label] of [["engineer", "ENGINEER"], ["analyst", "ANALYST"]] as const) {
		const email = env(`TEST_${label}_EMAIL`);
		if (!email) {
			console.log(`  skip  ${role} (TEST_${label}_EMAIL is empty)`);
			continue;
		}
		const res = await call("POST", "/api/user/add-user", { fullName: env(`TEST_${label}_NAME`, `Test ${role}`), email, role });
		if (res.status === 400 && /already exists/i.test(JSON.stringify(res.body))) {
			console.log(`  ok    ${role} user  ->  ${email}  (already exists)`);
			continue;
		}
		note(`${role} user`, res.status < 300 ? email : undefined, res);
	}

	// ---- service user, and a check fired with its key
	console.log("\nService user");
	const svc = await call("POST", "/api/service-users", { name: `api-test-${STAMP}` });
	const key = findId(svc.body, /^dck_/);
	note("service user", key ? `api-test-${STAMP}` : undefined, svc);
	if (key) {
		fs.writeFileSync(path.join(path.dirname(process.argv[1]!), "service-key.txt"), key);
		console.log("        key saved to api-tests/service-key.txt");
		// Firing is opt-in (TEST_FIRE_CHECKS=true). With it off, everything above is only created.
		if (env("TEST_FIRE_CHECKS").toLowerCase() !== "true") {
			console.log("\nNot firing the checks (TEST_FIRE_CHECKS is not true). Set TEST_FIRE_CHECKS=true to fire them all at once.");
		} else {
		// Everything is created; now fire every check at the same moment, with the service key.
		console.log(`\nFiring ${toFire.length} checks at once`);
		const keyHeaders = { "x-api-key": key, "content-type": "application/json" };
		const runs = await Promise.all(
			toFire.map(async c => ({
				c,
				run: await call("POST", "/api/qc-configuration/run", { configId: c.configId, source: c.source, idempotencyKey: `api-test-${STAMP}-${c.configId}` }, keyHeaders),
			})),
		);
		for (const { c, run } of runs) {
			runIds[c.configId] = run.body?.data?.runId;
			note(`run ${c.label}  [${c.configId}]`, run.body?.data?.runId, run);
		}
		}
	}

	await printDetails();
}

/** Connection details as the app has them, so database, schema and host are exact. */
async function printDetails() {
	const items = (body: any): any[] => {
		if (Array.isArray(body)) return body;
		if (body && typeof body === "object") for (const inner of Object.values(body)) { const found = items(inner); if (found.length && found[0] && "connectionId" in found[0]) return found; }
		return [];
	};
	const dbList = items((await call("GET", "/api/db/connections/list?limit=200&pageSize=200")).body);
	const fileList = items((await call("GET", "/api/file-storage/connections/list?limit=200&pageSize=200")).body);
	const byId = new Map<string, any>([...dbList, ...fileList].map(c => [c.connectionId, c]));

	const describe = (id: string) => {
		const c = byId.get(id);
		if (!c) return `${id}  (details not returned by the list)`;
		if (c.storageType) return `${id}  ${c.storageType} bucket ${c.bucketOrContainerName} (${c.region})  "${c.connectionName}"`;
		return `${id}  ${c.databaseType} ${c.databaseName}.${c.dbSchema}  host ${c.host}  user ${c.username}  "${c.connectionName}"`;
	};

	const used = new Set<string>();
	for (const f of toFire) { used.add(f.srcConn); used.add(f.tgtConn); }
	for (const [what, id] of created) if (/^(DC|FC)\d+$/.test(id)) used.add(id);

	console.log("\n==================== CONNECTIONS ====================");
	for (const id of [...used].sort()) console.log(`  ${describe(id)}`);

	console.log("\n==================== CONFIGURATIONS (what belongs to what) ====================");
	for (const f of toFire) {
		console.log(`\n  ${f.configId}   ${f.label}   [${f.source}]`);
		console.log(`      reads from   ${describe(f.srcConn)}`);
		console.log(`                   ${f.srcWhat}`);
		console.log(`      writes to    ${describe(f.tgtConn)}`);
		console.log(`                   ${f.tgtWhat}   (tables ..._err, ..._valid)`);
		console.log(`      run          ${runIds[f.configId] ?? "not fired"}`);
	}

	console.log("\n==================== USERS ====================");
	for (const [what, id] of created) if (/user$/.test(what) || what === "service user") console.log(`  ${what.padEnd(16)} ${id}`);
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
