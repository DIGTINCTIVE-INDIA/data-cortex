/**
 * Proves the access model over HTTP, against a running core-server.
 *
 *   pnpm --filter @repo/dao tsx src/scripts/access-matrix.ts   (server on :3000)
 *
 * Creates throwaway users (one per role plus a service user with real API keys),
 * walks every protected route as each of them, then deletes everything it made.
 *
 * "Allowed" means the request got PAST authorisation: any status except 401/403.
 * The bodies are empty on purpose, so allowed writes fail validation (4xx) instead
 * of changing data. "Denied" means exactly 403.
 */
import { and, checkRuns, db, eq, inArray, serviceApiKeys, usersTable } from "@repo/db";
import { TokenModule } from "@repo/lib";

import { AccessRepo } from "../lib/access/access.repo.js";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";
const access = new AccessRepo();

type Role = "admin" | "engineer" | "analyst";
const A: Role[] = ["admin"];
const AE: Role[] = ["admin", "engineer"];
const AEN: Role[] = ["admin", "engineer", "analyst"];

// [method, path, roles allowed]
const MATRIX: [string, string, Role[]][] = [
	["GET", "/api/user/list-users", A],
	["POST", "/api/user/add-user", A],
	["POST", "/api/user/update-user", A],
	["PATCH", "/api/user/toggle-user", A],

	["GET", "/api/db/connections/list", AEN],
	["POST", "/api/db/connections/add", AE],
	["PATCH", "/api/db/connections/update", AE],
	["PATCH", "/api/db/connections/toggle", AE],
	["GET", "/api/db/connections/tables", AE],
	["GET", "/api/db/connections/columns", AE],
	["GET", "/api/file-storage/connections/list", AEN],
	["POST", "/api/file-storage/connections/add", AE],
	["PATCH", "/api/file-storage/connections/update", AE],
	["PATCH", "/api/file-storage/connections/toggle", AE],

	["GET", "/api/libraries/qc-tags/all", AEN],
	["GET", "/api/libraries/dq-checks/sources", AEN],
	["POST", "/api/libraries/qc-tags/create", A],
	["PATCH", "/api/libraries/qc-tags/update", A],
	["PATCH", "/api/libraries/qc-tags/toggle", A],

	["POST", "/api/qc-configuration/db/create-check", AE],
	["PATCH", "/api/qc-configuration/db/update-check", AE],
	["PATCH", "/api/qc-configuration/db/toggle-check", AE],
	["POST", "/api/qc-configuration/db/set-columns", AE],
	["GET", "/api/qc-configuration/db/list-checks", AEN],
	["GET", "/api/qc-configuration/db/list-columns", AEN],
	["POST", "/api/qc-configuration/file-storage/get-schema", AE],
	["POST", "/api/qc-configuration/file-storage/create-check", AE],
	["GET", "/api/qc-configuration/file-storage/list-checks", AEN],
	["POST", "/api/qc-configuration/custom-sql/validate-query", AE],
	["POST", "/api/qc-configuration/custom-sql/create-check", AE],
	["GET", "/api/qc-configuration/custom-sql/list-checks", AEN],
	["GET", "/api/qc-configuration/custom-sql/schema", AEN],
	["POST", "/api/qc-configuration/run", AEN],

	["POST", "/api/db-explorer/execute-query", AEN],

	["GET", "/api/reports/qc-summary", AEN],
	["GET", "/api/reports/qc-alerts", AEN],
	["GET", "/api/reports/qc-alerts/summary", AEN],
	["PATCH", "/api/reports/qc-alerts/1/status", A],
	["GET", "/api/dashboard/summary", AEN],
	["GET", "/api/dashboard/issues-table", AEN],
	["GET", "/api/analyse-workstreams/check-cards", AEN],
	["GET", "/api/analyse-workstreams/failed-checks-table", AEN],

	["GET", "/api/notifications/rules", AE],
	["POST", "/api/notifications/test-email", AE],
	["GET", "/api/service-users", A],
	["POST", "/api/service-users", A],

	["GET", "/api/jobs", AEN],
];

let failures = 0;
let checks = 0;

function expect(name: string, ok: boolean, detail = "") {
	checks += 1;

	if (!ok) {
		failures += 1;
		console.log(`  FAIL  ${name}  ${detail}`);
	}
}

async function call(method: string, path: string, headers: Record<string, string> = {}) {
	const res = await fetch(BASE + path, {
		method,
		headers: { "content-type": "application/json", ...headers },
		body: method === "GET" ? undefined : "{}",
	});

	return res.status;
}

async function main() {
	const stamp = Math.random().toString(16).slice(2, 8);
	const created: string[] = [];
	const jobMarker = `TJ${stamp}`;

	const person = async (role: Role) => {
		const [row] = await db
			.insert(usersTable)
			.values({ email: `tmp-access-${role}-${stamp}@test.invalid`, fullName: `tmp ${role}`, role })
			.returning();

		created.push(row!.id);

		return {
			id: row!.id,
			token: TokenModule.signAccessToken({ id: row!.id, email: row!.email, fullName: row!.fullName, role }),
		};
	};

	try {
		const users = { admin: await person("admin"), engineer: await person("engineer"), analyst: await person("analyst") };
		const bearer = (role: Role) => ({ authorization: `Bearer ${users[role].token}` });

		// ------------------------------------------------------------ the matrix
		for (const [method, path, allowed] of MATRIX) {
			for (const role of ["admin", "engineer", "analyst"] as Role[]) {
				const status = await call(method, path, bearer(role));
				const shouldPass = allowed.includes(role);

				expect(
					`${role.padEnd(8)} ${method.padEnd(6)} ${path}`,
					shouldPass ? status !== 401 && status !== 403 : status === 403,
					`got ${status}, expected ${shouldPass ? "allowed" : "403"}`,
				);
			}
		}

		// -------------------------------------------------------- unauthenticated
		for (const path of ["/api/analyse-workstreams/check-cards", "/api/dashboard/summary", "/files/x"]) {
			expect(`anonymous GET ${path}`, (await call("GET", path)) === 401, "expected 401");
		}

		// ---------------------------------------------------------- service users
		const svc = await access.createServiceUser(`tmp svc ${stamp}`, users.admin.id);
		created.push(svc.id);

		const good = await access.createKey(svc.id, "good", users.admin.id);
		const toRevoke = await access.createKey(svc.id, "to-revoke", users.admin.id);
		const expired = await access.createKey(svc.id, "expired", users.admin.id, 1);

		await db
			.update(serviceApiKeys)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(serviceApiKeys.id, expired.id));

		const key = (value: string) => ({ "x-api-key": value });
		const runPath = "/api/qc-configuration/run";

		const goodStatus = await call("POST", runPath, key(good.key));
		expect("service key can reach the run route", goodStatus !== 401 && goodStatus !== 403, `got ${goodStatus}`);

		// A key authenticates on ONE route. Everything else must refuse it.
		for (const [method, path] of [
			["GET", "/api/dashboard/summary"],
			["GET", "/api/libraries/qc-tags/all"],
			["GET", "/api/service-users"],
			["POST", "/api/db-explorer/execute-query"],
			["GET", "/api/user/list-users"],
		] as const) {
			expect(`service key refused on ${method} ${path}`, (await call(method, path, key(good.key))) === 401, "expected 401");
		}

		// Change the last character to something DIFFERENT. Replacing it with a fixed "0" is a
		// no-op one time in sixteen, which made this check fail at random.
		const last = good.key.slice(-1);
		const tampered = good.key.slice(0, -1) + (last === "0" ? "1" : "0");
		expect("tampered key rejected", tampered !== good.key && (await call("POST", runPath, key(tampered))) === 401);
		expect("garbage key rejected", (await call("POST", runPath, key("dck_nope"))) === 401);
		expect("expired key rejected", (await call("POST", runPath, key(expired.key))) === 401);

		await access.revokeKey(toRevoke.id);
		expect("revoked key rejected", (await call("POST", runPath, key(toRevoke.key))) === 401);
		expect("other keys survive a revoke", (await call("POST", runPath, key(good.key))) !== 401);

		// A JWT naming a service user must be refused even though it is validly signed.
		const forged = TokenModule.signAccessToken({ id: svc.id, email: svc.email, fullName: svc.fullName, role: "analyst" });
		expect(
			"JWT for a service user rejected",
			(await call("GET", "/api/dashboard/summary", { authorization: `Bearer ${forged}` })) === 401,
		);

		// Hashes never come back.
		const listRes = await fetch(BASE + "/api/service-users", { headers: bearer("admin") });
		const listText = await listRes.text();
		expect("key list never exposes hashes or plaintext", !/keyHash|key_hash|dck_[0-9a-f]{10}_[0-9a-f]{64}/.test(listText));
		expect("key list shows the service user", listText.includes(svc.id));

		// ------------------------------------------------------------------- jobs
		// Admins see every run; everyone else only the ones they started. Another person's
		// run answers 404, not 403, so its existence is not disclosed.
		const owners: [string, string][] = [
			["admin", users.admin.id],
			["engineer", users.engineer.id],
			["analyst", users.analyst.id],
			["service", svc.id],
		];

		const runIds: Record<string, string> = {};

		for (const [who, userId] of owners) {
			const runId = crypto.randomUUID();
			runIds[who] = runId;

			// "completed" so listing never goes to the engine to ask about it.
			await db.insert(checkRuns).values({
				runId,
				configId: jobMarker,
				source: "db",
				userId,
				status: "completed",
				engineState: "SUCCESS",
			});
		}

		const listJobs = async (headers: Record<string, string>) => {
			const res = await fetch(`${BASE}/api/jobs?configId=${jobMarker}&limit=50`, { headers });
			const body: any = await res.json().catch(() => ({}));

			return { status: res.status, ids: ((body?.data?.items ?? []) as any[]).map(item => item.runId as string) };
		};

		const adminList = await listJobs(bearer("admin"));
		expect("admin sees all four jobs", adminList.ids.length === 4, `saw ${adminList.ids.length}`);

		for (const role of ["engineer", "analyst"] as Role[]) {
			const mine = await listJobs(bearer(role));
			expect(`${role} sees only their own job`, mine.ids.length === 1 && mine.ids[0] === runIds[role], `saw ${mine.ids.length}`);
			expect(`${role} cannot see the service user's job`, !mine.ids.includes(runIds.service!));
		}

		expect("service key cannot list jobs", (await call("GET", `/api/jobs?configId=${jobMarker}`, key(good.key))) === 403);

		const detail = (runId: string, headers: Record<string, string>) => call("GET", `/api/jobs/${runId}`, headers);

		expect("owner can open their job", (await detail(runIds.analyst!, bearer("analyst"))) === 200);
		expect("admin can open anyone's job", (await detail(runIds.analyst!, bearer("admin"))) === 200);
		expect("engineer opening an analyst's job gets 404", (await detail(runIds.analyst!, bearer("engineer"))) === 404);
		expect("analyst opening the service user's job gets 404", (await detail(runIds.service!, bearer("analyst"))) === 404);
		expect("service key can poll its OWN run", (await detail(runIds.service!, key(good.key))) === 200);
		expect("service key cannot read a person's run", (await detail(runIds.engineer!, key(good.key))) === 404);
		expect("a non-uuid run id is refused", (await detail("not-a-uuid", bearer("admin"))) >= 400);
		expect("anonymous cannot read jobs", (await call("GET", `/api/jobs/${runIds.admin}`)) === 401);

		// ------------------------------------------------- authorisation is current
		// Role comes from the database, not the token: demote through the API and the
		// SAME token must lose access on its very next request.
		const before = await call("POST", "/api/db/connections/add", bearer("engineer"));
		expect("engineer allowed before demotion", before !== 403 && before !== 401, `got ${before}`);

		const demote = await fetch(`${BASE}/api/user/update-user?userId=${users.engineer.id}`, {
			method: "POST",
			headers: { ...bearer("admin"), "content-type": "application/json" },
			body: JSON.stringify({ role: "analyst" }),
		});

		expect("admin can demote through the API", demote.ok, `got ${demote.status}`);

		const after = await call("POST", "/api/db/connections/add", bearer("engineer"));
		expect("demoted engineer loses write access with the SAME token", after === 403, `got ${after}`);

		const stillReads = await call("GET", "/api/db/connections/list", bearer("engineer"));
		expect("...and keeps the read access an analyst has", stillReads !== 401 && stillReads !== 403, `got ${stillReads}`);

		const disable = await fetch(`${BASE}/api/user/toggle-user?userId=${users.analyst.id}`, {
			method: "PATCH",
			headers: bearer("admin"),
		});

		expect("admin can disable through the API", disable.ok, `got ${disable.status}`);

		const disabled = await call("GET", "/api/dashboard/summary", bearer("analyst"));
		expect("disabled user is locked out with the SAME token", disabled === 401, `got ${disabled}`);

		// A service user is disabled the same way, and its keys stop working at once.
		await fetch(`${BASE}/api/user/toggle-user?userId=${svc.id}`, { method: "PATCH", headers: bearer("admin") });
		expect("disabling a service user kills its keys", (await call("POST", runPath, key(good.key))) === 401);
	} finally {
		// Runs reference users with no cascade, so they have to go first.
		await db.delete(checkRuns).where(eq(checkRuns.configId, jobMarker));

		// service keys cascade with their user; delete service users first (created_by FK).
		const rows = created.length ? await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(inArray(usersTable.id, created)) : [];
		const order = [...rows.filter(r => r.role === "service"), ...rows.filter(r => r.role !== "service")];

		for (const row of order) await db.delete(usersTable).where(and(eq(usersTable.id, row.id)));

		console.log(`\ncleaned up ${order.length} temporary users`);
	}

	console.log(`\n${checks} checks, ${failures} failed`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
