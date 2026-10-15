/**
 * Exercises every dashboard / analyse-workstream / reports query against the
 * live database.
 *
 * Typechecking proves the shapes line up; it does not prove the SQL runs. These
 * are hand-written sql`` templates, so a bad column name only shows up when the
 * query executes. This runs each one and reports what came back.
 *
 *   pnpm --filter @repo/dao tsx src/scripts/smoke-analytics.ts
 */
import { DashboardRepo } from "../lib/dashboard/dashboard.repo.js";
import { AnalyseWorkstreamRepo } from "../lib/analyse-workstream/analyse-workstream.repo.js";
import { ReportsRepo } from "../lib/reports/reports.repo.js";
import { LibrariesRepo } from "../lib/libraries/libraries.repo.js";

const dashboard = new DashboardRepo();
const workstream = new AnalyseWorkstreamRepo();
const reports = new ReportsRepo();
const libraries = new LibrariesRepo();

let failures = 0;

async function check(name: string, run: () => Promise<unknown>) {
	try {
		const result = await run();
		const size = Array.isArray(result)
			? `${result.length} rows`
			: result && typeof result === "object"
				? Object.keys(result as object).slice(0, 6).join(", ")
				: String(result);

		console.log(`  OK    ${name.padEnd(46)} ${size}`);
	} catch (error) {
		failures += 1;
		console.log(`  FAIL  ${name}`);
		const err = error as Error & { cause?: Error };
		// Drizzle wraps the driver error; the real text is on `cause`.
		console.log(`        ${err.cause?.message ?? err.message}`);
	}
}

async function main() {
	console.log("dashboard");
	await check("summary", () => dashboard.getDashboardSummary({} as never));
	await check("issuesStatus", () => dashboard.getDashboardIssuesStatus({} as never));
	await check("issuesBySource", () => dashboard.getDashboardIssuesBySource({} as never));
	await check("issuesTrend", () => dashboard.getDashboardIssuesTrend({} as never));
	await check("issuesTable", () => dashboard.getDashboardIssuesTable({} as never));

	console.log("\nanalyse workstream");
	await check("distinctCheckTypes", () => workstream.getDistinctCheckTypes({} as never));
	await check("distinctFileTableNames", () => workstream.getDistinctFileOrTableNames({} as never));
	await check("checkCards", () => workstream.getCheckCards({} as never));
	await check("checkDetails(first failed)", async () => {
		const table = (await workstream.getFailedChecksTable({} as never, { page: 1, limit: 1 })) as any;
		const first = table?.data?.[0] ?? table?.items?.[0];
		if (!first) return "no failed checks to detail";
		return workstream.getCheckDetails(Number(first.qcId));
	});
	await check("failedTrend", () => workstream.getFailedTrend({} as never));
	await check("failedChecksTable", () => workstream.getFailedChecksTable({} as never, { page: 1, limit: 5 }));

	console.log("\nreports");
	await check("qcAlerts", () => reports.getQcAlertsReport({ limit: 5, page: 1 } as never));
	await check("qcAlertsSummary", () => reports.getQcAlertsSummary({} as never));

	console.log("\nlibraries");
	await check("dqCheckSources", () => libraries.getDqCheckSources());

	console.log(`\n${failures === 0 ? "ALL QUERIES RAN" : `${failures} QUERY FAILURE(S)`}`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
