import * as dbPackage from "@repo/db";
import { db, getTableName, is, sql, Table } from "@repo/db";

type Log = { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void };

/**
 * Two cheap questions asked once at startup, in parallel (one round trip each):
 *
 *   1. Does every table the code declares exist? Names only -- no columns, no data. A
 *      missing table is the usual reason a fresh or half-migrated database makes every
 *      route fail with a confusing error, so it is named here instead.
 *   2. Is there an enabled admin? Without one nobody can manage users, libraries or
 *      service keys, and the product cannot recover itself (authorization is read from
 *      the database, so there is no way to promote anyone from inside the app).
 *
 * Neither stops the server. The point is to say, plainly and early, what is wrong and
 * how to fix it; the server still starts so the part that works can be used meanwhile.
 */
export async function runStartupChecks(log: Log) {
	const declared = Object.values(dbPackage)
		.filter(value => is(value, Table))
		.map(table => getTableName(table as Table))
		.sort();

	const [tables, admins] = await Promise.allSettled([
		db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`),
		db.execute(sql`SELECT email FROM users WHERE role = 'admin' AND enabled ORDER BY created_at LIMIT 5`),
	]);

	// ----------------------------------------------------------------- tables
	if (tables.status === "rejected") {
		log.warn("  tables        : could not check");
	} else {
		const live = new Set((tables.value.rows as { table_name: string }[]).map(row => row.table_name));
		const missing = declared.filter(name => !live.has(name));

		if (missing.length === 0) {
			log.info(`  tables        : all ${declared.length} present`);
		} else {
			log.error(`  tables        : ${missing.length} missing (${missing.join(", ")}) -> run: pnpm --filter @repo/db db:push`);
		}
	}

	// ------------------------------------------------------------------ admin
	if (admins.status === "rejected") {
		log.warn("  admin user    : could not check");
	} else if ((admins.value.rows as unknown[]).length > 0) {
		log.info("  admin user    : found");
	} else {
		log.error("  admin user    : none -> set one: UPDATE users SET role = 'admin' WHERE email = '<email>'");
	}
}
