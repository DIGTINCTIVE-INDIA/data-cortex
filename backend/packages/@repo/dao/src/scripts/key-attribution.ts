/**
 * A run records the API key that started it, and a revoked key starts nothing.
 *
 *   pnpm --filter @repo/dao exec tsx src/scripts/key-attribution.ts
 *
 * Starts one real (cheap) run, so it is not part of the gate. Needs core-server on
 * :3000 and the engine on :8000. The service user it creates is disabled afterwards.
 */
import { checkRuns, count, db, eq, usersTable } from "@repo/db";

import { AccessRepo } from "../lib/access/access.repo.js";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";
const access = new AccessRepo();

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
	if (!ok) {
		failures += 1;
		console.log(`  FAIL  ${name}  ${detail}`);
	} else console.log(`  ok    ${name}`);
};

const run = (key: string) =>
	fetch(`${BASE}/api/qc-configuration/run`, {
		method: "POST",
		headers: { "x-api-key": key, "content-type": "application/json" },
		body: JSON.stringify({ configId: "CB0002", source: "custom-sql", idempotencyKey: `attr-${Date.now()}-${Math.random()}` }),
	});

const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
const svc = await access.createServiceUser("attribution-test (disabled, safe to delete)", admin!.id);

const keyA = await access.createKey(svc.id, "key-A", admin!.id, 1);
const keyB = await access.createKey(svc.id, "key-B", admin!.id, 1);

try {
	const ok = await run(keyA.key);
	const body: any = await ok.json().catch(() => ({}));
	expect("key A starts a run", ok.status === 200 || ok.status === 202, `${ok.status} ${JSON.stringify(body?.message ?? "")}`);

	const [row] = await db.select().from(checkRuns).where(eq(checkRuns.runId, body?.data?.runId ?? ""));
	expect("the run records WHICH key started it", row?.apiKeyId === keyA.id, `${row?.apiKeyId} vs ${keyA.id}`);
	expect("and it is key A, not the identity's other key", row?.apiKeyId !== keyB.id);

	await access.revokeKey(keyA.id);

	const [{ before }] = await db.select({ before: count() }).from(checkRuns).where(eq(checkRuns.userId, svc.id));
	const refused = await run(keyA.key);
	expect("the revoked key is refused (401)", refused.status === 401, `${refused.status}`);

	const [{ after }] = await db.select({ after: count() }).from(checkRuns).where(eq(checkRuns.userId, svc.id));
	expect("and creates no run", after === before, `${before} -> ${after}`);

	const other = await run(keyB.key);
	expect("the identity's other key still works", other.status === 200 || other.status === 202, `${other.status}`);

	const otherBody: any = await other.json().catch(() => ({}));
	const [rowB] = await db.select().from(checkRuns).where(eq(checkRuns.runId, otherBody?.data?.runId ?? ""));
	expect("and that run is attributed to key B", rowB?.apiKeyId === keyB.id);
} finally {
	await db.update(usersTable).set({ enabled: false }).where(eq(usersTable.id, svc.id));
}

console.log(failures === 0 ? "\nKEY ATTRIBUTION OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
