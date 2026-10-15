/**
 * The last-admin guard: losing the only enabled admin is unrecoverable through the
 * product, so neither demotion nor disabling may take the count to zero.
 *
 *   pnpm --filter @repo/dao exec tsx src/scripts/last-admin-guard.ts
 *
 * The "it refuses" half is checked inside a transaction that is ALWAYS rolled back,
 * because proving it would otherwise mean disabling this installation's real admins.
 * The "it does not get in the way" half runs over real HTTP against a throwaway admin.
 */
import { and, count, db, eq, ne, usersTable } from "@repo/db";
import { TokenModule } from "@repo/lib";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
	if (!ok) {
		failures += 1;
		console.log(`  FAIL  ${name}  ${detail}`);
	} else console.log(`  ok    ${name}`);
};

/** The guard's own predicate: enabled admins other than this one. */
const remainingAdmins = (tx: typeof db, userId: string) =>
	tx
		.select({ remaining: count() })
		.from(usersTable)
		.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true), ne(usersTable.id, userId)));

async function main() {
	const admins = await db
		.select()
		.from(usersTable)
		.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true)));

	console.log(`${admins.length} enabled admin(s) right now\n`);

	if (admins.length === 0) throw new Error("no enabled admin: this installation is already locked out");

	const signer = admins[0]!;

	const headers = {
		authorization: `Bearer ${TokenModule.signAccessToken({ id: signer.id, email: signer.email, fullName: signer.fullName, role: "admin" })}`,
		"content-type": "application/json",
	};

	// ---------------------------------------------------- it refuses (rolled back)
	// Simulates "only one admin left" by disabling the others inside a transaction
	// that is then thrown out of, so nothing is ever committed.
	const survivor = admins[0]!;

	await db
		.transaction(async tx => {
			await tx
				.update(usersTable)
				.set({ enabled: false })
				.where(and(eq(usersTable.role, "admin"), ne(usersTable.id, survivor.id)));

			const [{ remaining }] = await remainingAdmins(tx as unknown as typeof db, survivor.id);

			expect("with every other admin disabled, the guard sees 0 remaining", remaining === 0, `remaining=${remaining}`);

			throw new Error("rollback");
		})
		.catch(error => {
			if ((error as Error).message !== "rollback") throw error;
		});

	const [{ remaining: afterRollback }] = await remainingAdmins(db, survivor.id);
	expect(
		"the simulation was rolled back -- real admins untouched",
		afterRollback === admins.length - 1,
		`remaining=${afterRollback}, expected ${admins.length - 1}`,
	);

	// ------------------------------------------- it does not block a normal change
	const stamp = Math.random().toString(16).slice(2, 8);
	const [temp] = await db
		.insert(usersTable)
		.values({ email: `tmp-admin-${stamp}@test.invalid`, fullName: "tmp admin", role: "admin" })
		.returning();

	try {
		const setRole = (userId: string, role: string, fullName: string) =>
			fetch(`${BASE}/api/user/update-user?userId=${userId}`, {
				method: "POST",
				headers,
				body: JSON.stringify({ role, fullName }),
			});

		// An admin's role is fixed: nobody, admins included, can change it.
		const demote = await setRole(temp!.id, "analyst", temp!.fullName);
		expect("an admin's role cannot be changed (403)", demote.status === 403, `${demote.status}`);

		const [stillAdmin] = await db.select().from(usersTable).where(eq(usersTable.id, temp!.id));
		expect("the admin is still an admin", stillAdmin?.role === "admin", String(stillAdmin?.role));

		// An admin can change anyone else's role, including promoting them.
		const [person] = await db
			.insert(usersTable)
			.values({ email: `tmp-person-${stamp}@test.invalid`, fullName: "tmp person", role: "analyst" })
			.returning();

		try {
			const toEngineer = await setRole(person!.id, "engineer", person!.fullName);
			expect("an admin can change a non-admin's role", toEngineer.status === 200, `${toEngineer.status}`);

			const [afterChange] = await db.select().from(usersTable).where(eq(usersTable.id, person!.id));
			expect("the role really changed", afterChange?.role === "engineer", String(afterChange?.role));

			const promote = await setRole(person!.id, "admin", person!.fullName);
			expect("an admin can promote someone to admin", promote.status === 200, `${promote.status}`);

			const keepAdmin = await setRole(person!.id, "admin", person!.fullName);
			expect("re-saving an admin as admin is not treated as a change", keepAdmin.status === 200, `${keepAdmin.status}`);
		} finally {
			await db.delete(usersTable).where(eq(usersTable.id, person!.id)).catch(() => undefined);
		}

		const disable = await fetch(`${BASE}/api/user/toggle-user?userId=${temp!.id}`, { method: "PATCH", headers });
		expect("disabling a non-last user is still allowed", disable.status === 200, `${disable.status}`);
	} finally {
		await db.delete(usersTable).where(eq(usersTable.id, temp!.id)).catch(() => undefined);
	}

	const stillEnabled = await db
		.select({ total: count() })
		.from(usersTable)
		.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true)));

	expect(
		"the installation still has every admin it started with",
		stillEnabled[0]!.total === admins.length,
		`${stillEnabled[0]!.total} vs ${admins.length}`,
	);

	console.log(failures === 0 ? "\nLAST ADMIN GUARD OK" : `\n${failures} FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
