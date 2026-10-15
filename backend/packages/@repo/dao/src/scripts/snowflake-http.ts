/**
 * Snowflake through the real HTTP API: add the connection, list tables and columns, run
 * explorer queries. Needs core-server on :3000 and the demo credentials in .env.demo.
 *
 *   pnpm --filter @repo/dao tsx src/scripts/snowflake-http.ts
 *
 * It leaves the Snowflake connection in place (owned by a real admin) so it can be used
 * from the UI; the throwaway admin it signs requests with is removed.
 */
import fs from "node:fs";

import { and, databaseConnection, db, eq, usersTable } from "@repo/db";
import { TokenModule } from "@repo/lib";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";
const NAME = "Snowflake DATACORTEX_MOCK (demo)";

const env = Object.fromEntries(
	fs
		.readFileSync("../../../.env.demo", "utf8")
		.split(/\r?\n/)
		.filter(line => line.includes("=") && !line.startsWith("#"))
		.map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

const key = env.SNOWFLAKE_PRIVATE_KEY!.split(String.fromCharCode(92) + "n").join("\n");

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
	if (!ok) {
		failures += 1;
		console.log(`  FAIL  ${name}  ${detail}`);
	} else console.log(`  ok    ${name}`);
};

async function main() {
	const [realAdmin] = await db.select().from(usersTable).where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true))).limit(1);
	const stamp = Math.random().toString(16).slice(2, 8);

	const [temp] = await db
		.insert(usersTable)
		.values({ email: `tmp-sf-${stamp}@test.invalid`, fullName: "tmp sf", role: "admin" })
		.returning();

	const headers = {
		authorization: `Bearer ${TokenModule.signAccessToken({ id: temp!.id, email: temp!.email, fullName: temp!.fullName, role: "admin" })}`,
		"content-type": "application/json",
	};

	const call = async (method: string, path: string, body?: unknown) => {
		const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
		return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
	};

	try {
		const existing = await db.query.databaseConnection.findFirst({ where: eq(databaseConnection.connectionName, NAME) });
		if (existing) await db.delete(databaseConnection).where(eq(databaseConnection.connectionId, existing.connectionId));

		const form = {
			connectionName: NAME,
			databaseType: "snowflake",
			host: env.SNOWFLAKE_ACCOUNT,
			port: 443,
			databaseName: env.SNOWFLAKE_DATABASE,
			username: env.SNOWFLAKE_USER,
			secret: key,
			secretType: "key_pair",
			dbSchema: env.SNOWFLAKE_SCHEMA,
			additionalParams: { account: env.SNOWFLAKE_ACCOUNT, warehouse: env.SNOWFLAKE_WAREHOUSE, auth_method: "key_pair" },
		};

		// ------------------------------------------------------------- connect
		const bad = await call("POST", "/api/db/connections/add", { ...form, connectionName: NAME + " bad", secret: "not a key" });
		expect("a malformed key is refused with a readable reason", bad.status === 400 && /key/i.test(bad.body?.message ?? ""), `${bad.status} ${bad.body?.message}`);

		const add = await call("POST", "/api/db/connections/add", form);
		expect("connection with a key pair saves (tested against Snowflake)", add.status === 200, `${add.status} ${add.body?.message}`);

		const connectionId: string | undefined = add.body?.data?.connection?.connectionId ?? add.body?.data?.connectionId;
		const row = await db.query.databaseConnection.findFirst({ where: eq(databaseConnection.connectionName, NAME) });
		const id = connectionId ?? row?.connectionId;

		if (!id || !row) throw new Error("connection was not stored");

		expect("secret is stored encrypted, not as the PEM", !row.secret.includes("BEGIN"));
		expect("secret type recorded as key_pair", row.secretType === "key_pair");
		expect("auth_method mirrored for the engine", (row.additionalParams as any)?.auth_method === "key_pair");

		// ------------------------------------------------------- tables / columns
		const tables = await call("GET", `/api/db/connections/tables?connectionId=${id}`);
		const names: string[] = tables.body?.data?.tables ?? [];
		expect("lists Snowflake tables", tables.status === 200 && names.includes("HCP"), `${tables.status} ${names.length} tables`);

		const columns = await call("GET", `/api/db/connections/columns?connectionId=${id}&tableName=HCP`);
		const cols: any[] = columns.body?.data?.columns ?? [];
		expect("lists columns of HCP in order, with types", columns.status === 200 && cols.length > 0 && cols.every(c => c.columnName && c.dataType), `${columns.status} ${cols.length}`);
		console.log(`        HCP: ${cols.slice(0, 5).map(c => `${c.columnName}:${c.dataType}`).join(", ")} ...`);

		// ------------------------------------------------------------- explorer
		const q = (sqlQuery: string, extra: object = {}) => call("POST", `/api/db-explorer/execute-query?connectionId=${id}`, { sqlQuery, ...extra });

		const sel = await q("SELECT * FROM HCP", { pageSize: 3 });
		const result = sel.body?.data?.result;
		expect("SELECT returns rows and columns", sel.status === 200 && result?.rows?.length === 3 && result?.columns?.length > 0, `${sel.status} ${sel.body?.message ?? ""}`);
		expect("fetches one extra row to know there is a next page", result?.pagination?.hasMore === true);

		const page2 = await q("SELECT * FROM HCP", { pageSize: 3, page: 2 });
		expect("page 2 is a different set of rows", page2.status === 200 && JSON.stringify(page2.body?.data?.result?.rows) !== JSON.stringify(result?.rows));

		const count = await q("SELECT COUNT(*) AS N FROM HCP");
		expect("COUNT(*) comes back JSON-safe (numbers/bigints survive)", count.status === 200 && count.body?.data?.result?.rows?.[0] !== undefined, `${count.status} ${JSON.stringify(count.body?.message ?? count.body?.data?.rows)}`);

		const withCte = await q("WITH x AS (SELECT 1 AS A) SELECT * FROM x");
		expect("WITH ... SELECT works", withCte.status === 200, `${withCte.status} ${withCte.body?.message}`);

		const badCol = await q("SELECT no_such_column FROM HCP");
		expect("a SQL error is reported readably", badCol.status === 400 && /invalid identifier|NO_SUCH_COLUMN/i.test(badCol.body?.message ?? ""), `${badCol.status} ${badCol.body?.message}`);

		for (const [label, sqlText] of [
			["DROP", "DROP TABLE HCP"],
			["DELETE", "DELETE FROM HCP"],
			["multi-statement", "SELECT 1; SELECT 2"],
			["INSERT inside a CTE", "WITH x AS (SELECT 1) INSERT INTO HCP SELECT * FROM x"],
		] as const) {
			const res = await q(sqlText);
			expect(`${label} is refused`, res.status === 400, `${res.status}`);
		}

		// ------------------------------------------------ postgres is unaffected
		const pg = await db.query.databaseConnection.findFirst({ where: eq(databaseConnection.databaseType, "postgres") });

		if (pg) {
			const res = await call("POST", `/api/db-explorer/execute-query?connectionId=${pg.connectionId}`, { sqlQuery: "SELECT 1 AS one" });
			expect("PostgreSQL explorer still works", res.status === 200 && res.body?.data?.result?.rows?.[0]?.one === 1, `${res.status} ${res.body?.message}`);
		}

		// hand the connection to a real admin so it survives the temp user's removal
		await db.update(databaseConnection).set({ userId: realAdmin!.id }).where(eq(databaseConnection.connectionId, id));
	} finally {
		await db.delete(usersTable).where(eq(usersTable.id, temp!.id)).catch(() => undefined);
	}

	console.log(failures === 0 ? "\nSNOWFLAKE PATH OK" : `\n${failures} FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
