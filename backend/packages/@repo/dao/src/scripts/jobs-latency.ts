/**
 * How long GET /api/jobs takes, measured against the real database.
 *   pnpm --filter @repo/dao exec tsx src/scripts/jobs-latency.ts
 */
import { JobsRepo } from "../lib/jobs/jobs.repo.js";

const repo = new JobsRepo();
const times: number[] = [];

for (let i = 0; i < 6; i += 1) {
	const started = performance.now();
	const page = await repo.list({ id: "x", role: "admin" }, { limit: 50 });
	times.push(performance.now() - started);
	if (i === 0) console.log(`rows returned: ${page.data.length}`);
}

const [cold, ...warm] = times;
console.log(`first call  ${cold!.toFixed(0)} ms`);
console.log(`warm calls  ${warm.map(t => t.toFixed(0)).join(", ")} ms  (median ${warm.sort((a, b) => a - b)[Math.floor(warm.length / 2)]!.toFixed(0)})`);
process.exit(0);
