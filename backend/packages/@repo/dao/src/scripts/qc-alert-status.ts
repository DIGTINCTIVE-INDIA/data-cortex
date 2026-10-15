/**
 * QC alert status transitions through the real HTTP API.
 *
 * The rules being checked:
 *   - discard REQUIRES a reason (enforced server-side, not only in the dialog)
 *   - resolve MAY carry one, and it is kept rather than thrown away
 *   - a note shorter than 3 characters is refused for either outcome
 *   - changing the status again replaces the note instead of inheriting the old one
 *
 * Needs core-server on :3000.
 *
 *   pnpm --filter @repo/dao tsx src/scripts/qc-alert-status.ts
 *
 * It restores whatever status and note the alert it borrows started with.
 */
import { and, db, eq, results, usersTable } from "@repo/db";
import { TokenModule } from "@repo/lib";

const BASE = process.env.CORE_SERVER_URL ?? "http://127.0.0.1:3000";

let failures = 0;
const expect = (name: string, ok: boolean, detail = "") => {
	if (!ok) {
		failures += 1;
		console.log(`  FAIL  ${name}  ${detail}`);
	} else console.log(`  ok    ${name}`);
};

async function main() {
	const [admin] = await db
		.select()
		.from(usersTable)
		.where(and(eq(usersTable.role, "admin"), eq(usersTable.enabled, true)))
		.limit(1);

	if (!admin) throw new Error("no enabled admin to sign requests with");

	const headers = {
		authorization: `Bearer ${TokenModule.signAccessToken({ id: admin.id, email: admin.email, fullName: admin.fullName, role: "admin" })}`,
		"content-type": "application/json",
	};

	// Only a failed row can be an alert, which is what the repo's WHERE enforces.
	const [alert] = await db.select().from(results).where(eq(results.checkStatus, "failed")).limit(1);

	if (!alert) throw new Error("no failed result row to use as an alert");

	const original = { status: alert.issueStatus, reason: alert.issueStatusReason };
	const id = alert.checkExecutionId;

	const patch = async (body: unknown) => {
		const res = await fetch(`${BASE}/api/reports/qc-alerts/${id}/status`, {
			method: "PATCH",
			headers,
			body: JSON.stringify(body),
		});
		return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
	};

	const stored = async () => {
		const [row] = await db.select().from(results).where(eq(results.checkExecutionId, id));
		return row;
	};

	try {
		console.log(`alert ${id} (${alert.checkId})  starting status=${original.status}\n`);

		// ------------------------------------------------------------- discard
		const noReason = await patch({ status: "discarded" });
		expect("discard without a reason is refused", noReason.status === 422 || noReason.status === 400, `${noReason.status}`);

		const shortReason = await patch({ status: "discarded", reason: "x" });
		expect("a 1-character reason is refused", shortReason.status === 422 || shortReason.status === 400, `${shortReason.status}`);

		const discarded = await patch({ status: "discarded", reason: "known upstream backfill" });
		expect("discard with a reason succeeds", discarded.status === 200, `${discarded.status} ${discarded.body?.message}`);
		expect("the discard reason is stored", (await stored())?.issueStatusReason === "known upstream backfill");

		// ------------------------------------------------------------- resolve
		const resolvedWithNote = await patch({ status: "resolved", reason: "corrected at source, reloaded 14 Oct" });
		expect("resolve accepts an optional note", resolvedWithNote.status === 200, `${resolvedWithNote.status} ${resolvedWithNote.body?.message}`);

		const afterResolve = await stored();
		expect("the resolution note is KEPT, not discarded", afterResolve?.issueStatusReason === "corrected at source, reloaded 14 Oct", String(afterResolve?.issueStatusReason));
		expect("status really moved to resolved", afterResolve?.issueStatus === "resolved", String(afterResolve?.issueStatus));

		const shortNote = await patch({ status: "resolved", reason: "x" });
		expect("a 1-character note is refused on resolve too", shortNote.status === 422 || shortNote.status === 400, `${shortNote.status}`);

		const resolvedBare = await patch({ status: "resolved" });
		expect("resolve with no note at all succeeds", resolvedBare.status === 200, `${resolvedBare.status} ${resolvedBare.body?.message}`);
		expect(
			"resolving without a note clears the previous one (no stale reason)",
			(await stored())?.issueStatusReason === null,
			String((await stored())?.issueStatusReason),
		);
	} finally {
		await db
			.update(results)
			.set({ issueStatus: original.status, issueStatusReason: original.reason })
			.where(eq(results.checkExecutionId, id));
		console.log(`\nrestored alert ${id} to status=${original.status}`);
	}

	console.log(failures === 0 ? "\nQC ALERT STATUS OK" : `\n${failures} FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
