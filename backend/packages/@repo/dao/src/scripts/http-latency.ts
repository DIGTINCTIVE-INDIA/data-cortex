/**
 * Latency of the two requests people wait on, measured over real HTTP.
 *   pnpm --filter @repo/dao exec tsx src/scripts/http-latency.ts
 * Needs core-server on :3000.
 */
import { and, databaseConnection, db, eq, usersTable } from "@repo/db";
import { TokenModule } from "@repo/lib";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";

const [admin] = await db
	.select()
	.from(usersTable)
	.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true)))
	.limit(1);

const headers = {
	authorization: `Bearer ${TokenModule.signAccessToken({ id: admin!.id, email: admin!.email, fullName: admin!.fullName, role: "admin" })}`,
};

const time = async (label: string, path: string, runs = 4) => {
	const ms: number[] = [];

	for (let i = 0; i < runs; i += 1) {
		const started = performance.now();
		const res = await fetch(BASE + path, { headers });
		await res.text();
		ms.push(performance.now() - started);
		if (i === 0 && res.status !== 200) console.log(`  ${label}: HTTP ${res.status}`);
	}

	console.log(`${label.padEnd(34)} ${ms.map(m => m.toFixed(0).padStart(5)).join(" ")} ms`);
};

await time("GET /api/jobs?limit=100", "/api/jobs?limit=100");

const connections = await db.select().from(databaseConnection).where(eq(databaseConnection.enabled, true));

for (const connection of connections) {
	await time(
		`tables  ${connection.databaseType}/${connection.connectionName}`.slice(0, 34),
		`/api/db/connections/tables?connectionId=${connection.connectionId}`,
	);
}

process.exit(0);
