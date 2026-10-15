/**
 * One REAL run, end to end, started the way Airflow would start it.
 *
 *   service API key -> POST /api/qc-configuration/run -> dc-engine -> results
 *                   -> GET /api/jobs/:runId (polled with the same key) -> terminal
 *
 * Unlike access-matrix.ts this executes a check and writes real result rows, so it is
 * not part of the gate. Run it once to see the whole chain work.
 *
 *   pnpm --filter @repo/dao tsx src/scripts/e2e-service-run.ts DBC0003 db
 *
 * It creates one service user and LEAVES it, disabled: the run's result rows carry its
 * id, and other pages join results to users. Its key is never printed.
 */
import { checkRuns, db, eq, results, usersTable } from "@repo/db";

import { AccessRepo } from "../lib/access/access.repo.js";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";
const [configId = "DBC0003", source = "db"] = process.argv.slice(2);
const access = new AccessRepo();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
	const [admin] = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);

	if (!admin) throw new Error("no admin user to attribute the service user to");

	const svc = await access.createServiceUser("e2e-test (disabled, safe to delete)", admin.id);
	const { key } = await access.createKey(svc.id, "e2e", admin.id, 1);

	const headers = { "x-api-key": key, "content-type": "application/json" };

	console.log(`service user ${svc.id.slice(0, 8)}  config ${configId} (${source})`);

	const started = Date.now();
	const res = await fetch(`${BASE}/api/qc-configuration/run`, {
		method: "POST",
		headers,
		body: JSON.stringify({ configId, source, idempotencyKey: `e2e-${Date.now()}` }),
	});

	const body: any = await res.json().catch(() => ({}));

	console.log(`POST run -> ${res.status}  ${JSON.stringify(body?.data ?? body?.message)}`);

	const runId: string | undefined = body?.data?.runId;

	if (!runId) throw new Error("no run id came back");

	const [row] = await db.select().from(checkRuns).where(eq(checkRuns.runId, runId));
	console.log(`recorded at dispatch: ${row ? `yes (status=${row.status})` : "NO"}`);

	let last = "";
	let job: any = null;

	for (let i = 0; i < 80; i += 1) {
		const poll = await fetch(`${BASE}/api/jobs/${runId}`, { headers });
		job = ((await poll.json().catch(() => ({}))) as any)?.data?.job;

		const line = `${job?.status} (engine ${job?.engineState})`;

		if (line !== last) {
			console.log(`  +${((Date.now() - started) / 1000).toFixed(1)}s  ${line}`);
			last = line;
		}

		if (job && (job.status === "completed" || job.status === "failed")) break;

		await sleep(1500);
	}

	console.log(`\nfinal   : ${job?.status}   job status: ${job?.jobStatus ?? "-"}   error: ${job?.error ?? "-"}`);
	console.log(`checks  : ${JSON.stringify(job?.checks)}`);
	console.log(`results : ${job?.results?.length ?? 0} rows linked by JOB_${runId.slice(0, 8)}...`);

	for (const r of (job?.results ?? []).slice(0, 8)) {
		console.log(`   ${String(r.checkId).padEnd(6)} ${String(r.checkStatus).padEnd(16)} ${r.field ?? "-"}`);
	}

	const direct = await db.select({ id: results.checkExecutionId }).from(results).where(eq(results.jobId, `JOB_${runId}`));
	console.log(`direct count of results with job_id = JOB_<run_id>: ${direct.length}`);

	// A service user is disabled the same way an admin would, and its key dies with it.
	await db.update(usersTable).set({ enabled: false }).where(eq(usersTable.id, svc.id));
	console.log("service user disabled.");

	process.exit(job?.status === "completed" || job?.status === "failed" ? 0 : 1);
}

void main();
