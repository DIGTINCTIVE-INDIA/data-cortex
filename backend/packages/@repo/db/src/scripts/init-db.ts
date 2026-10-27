// src/scripts/init-db.ts
import { and, asc, db, env, eq, qcTagsLibrary, traditionalChecksLibraryRev, usersTable } from "@repo/db";
import { sql } from "drizzle-orm";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { QC_TAGS_SEED, TRADITIONAL_CHECKS_SEED } from "./seed-data.js";

const startedAt = Date.now();

const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(2)}s`;

const log = (message: string) => console.log(`[init-db ${elapsed()}] ${message}`);

const step = (n: number, total: number, title: string) => {
	console.log("");
	console.log(`── Step ${n}/${total} — ${title} ${"─".repeat(Math.max(0, 48 - title.length))}`);
};

/** Host, port and database name only -- never the user or password. */
const describeTarget = () => {
	try {
		const url = new URL(env.DATABASE_URL);
		return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
	} catch {
		return "(DATABASE_URL could not be parsed)";
	}
};

// Only administrators can be created while an empty database is initialised: an engineer or
// analyst can only be added by an admin from inside the app, so offering those roles here
// would create users nobody could have created afterwards.
const MAX_INITIAL_ADMINS = 5;

const rl = createInterface({ input, output });

const askRequired = async (question: string) => {
	const value = (await rl.question(question)).trim();

	if (!value) {
		throw new Error(`${question.replace(/:\s*$/, "")} is required`);
	}

	return value;
};

/** At least one administrator is mandatory; the person running the init decides how many, up to the limit. */
const askAdminCount = async () => {
	while (true) {
		const answer = (await rl.question(`How many administrators do you want to create (1-${MAX_INITIAL_ADMINS})? `)).trim();
		const count = Number(answer);

		if (Number.isInteger(count) && count >= 1 && count <= MAX_INITIAL_ADMINS) {
			return count;
		}

		console.log(`Enter a whole number from 1 to ${MAX_INITIAL_ADMINS}. At least one administrator is required.`);
	}
};

const validateEmail = (email: string) => {
	const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

	if (!isValid) {
		throw new Error("Invalid email address");
	}
};

/**
 * Seeds the starting qc_tags taxonomy.
 *
 * Idempotent: each tag is matched on (type, title) and inserted only if absent,
 * so re-running tops up a partially seeded database instead of duplicating.
 * qc_tags has no unique constraint, so the check is a query -- the same approach
 * LibrariesRepo.addQcTag uses.
 */
/**
 * Seeds the fixed traditional check types (TC001-TC011).
 *
 * The engine reads this table to resolve each field rule to a check function. It
 * creates and seeds the table itself only on a forced init -- on a normal job run
 * it returns early as soon as it finds a `users` table, which this schema also
 * creates. So the database would otherwise never get these rows and every
 * traditional run would fail with "no checks to execute".
 *
 * Idempotent: matched on check_id, inserted only if absent.
 */
const seedTraditionalChecks = async () => {
	log(`Seeding traditional_checks_library_rev from ${TRADITIONAL_CHECKS_SEED.length} reference entries.`);
	console.log("");

	let inserted = 0;
	let skipped = 0;

	for (const [index, check] of TRADITIONAL_CHECKS_SEED.entries()) {
		const position = `${String(index + 1).padStart(2, " ")}/${TRADITIONAL_CHECKS_SEED.length}`;
		const label = `${check.checkId}  ${check.checkName.padEnd(22, " ")} abort=${check.abort}`;

		const existing = await db.query.traditionalChecksLibraryRev.findFirst({
			where: eq(traditionalChecksLibraryRev.checkId, check.checkId),
		});

		if (existing) {
			skipped += 1;
			console.log(`  ${position}  SKIP    ${label}`);
			continue;
		}

		await db.insert(traditionalChecksLibraryRev).values({
			checkId: check.checkId,
			checkMappingName: check.checkMappingName,
			checkName: check.checkName,
			checkDescription: check.checkDescription,
			abort: check.abort,
		});

		inserted += 1;
		console.log(`  ${position}  INSERT  ${label}`);
	}

	// Park the sequence past every seeded id, so a later auto-generated check_id
	// cannot collide with TC001-TC011. GREATEST keeps it safe to re-run after
	// extra check types have been added by hand.
	await db.execute(sql`
		SELECT setval(
			'traditional_checks_library_rev_seq',
			GREATEST(
				(SELECT COALESCE(MAX(SUBSTRING(check_id FROM 3)::int), 0)
				   FROM traditional_checks_library_rev
				  WHERE check_id ~ '^TC[0-9]+$'),
				${TRADITIONAL_CHECKS_SEED.length}
			)
		)
	`);

	console.log("");
	log(`traditional_checks_library_rev seeded -- inserted ${inserted}, already present ${skipped}.`);
};

const seedQcTags = async (userId: string) => {
	log(`Seeding qc_tags from ${QC_TAGS_SEED.length} reference entries.`);
	log(`Attributing new rows to user ${userId}.`);
	console.log("");

	const existingCount = await db.$count(qcTagsLibrary);
	log(`qc_tags currently holds ${existingCount} row(s).`);
	console.log("");

	let inserted = 0;
	let skipped = 0;
	const insertedByType: Record<string, number> = {};
	const skippedByType: Record<string, number> = {};

	for (const [index, tag] of QC_TAGS_SEED.entries()) {
		const position = `${String(index + 1).padStart(2, " ")}/${QC_TAGS_SEED.length}`;
		const label = `${tag.tagType} · ${tag.tagTitle}`;

		const existing = await db.query.qcTagsLibrary.findFirst({
			where: and(eq(qcTagsLibrary.tagType, tag.tagType), eq(qcTagsLibrary.tagTitle, tag.tagTitle)),
		});

		if (existing) {
			skipped += 1;
			skippedByType[tag.tagType] = (skippedByType[tag.tagType] ?? 0) + 1;
			console.log(`  ${position}  SKIP    ${label}  (already present, id=${existing.id})`);
			continue;
		}

		const [created] = await db
			.insert(qcTagsLibrary)
			.values({
				tagType: tag.tagType,
				tagTitle: tag.tagTitle,
				description: tag.description,
				userId,
			})
			.returning({ id: qcTagsLibrary.id });

		inserted += 1;
		insertedByType[tag.tagType] = (insertedByType[tag.tagType] ?? 0) + 1;
		console.log(`  ${position}  INSERT  ${label}  (id=${created.id})`);
	}

	const types = [...new Set(QC_TAGS_SEED.map(tag => tag.tagType))];

	console.log("");
	log(`Per tag type:`);
	for (const type of types) {
		log(`    ${type.padEnd(20, " ")} inserted ${insertedByType[type] ?? 0}, skipped ${skippedByType[type] ?? 0}`);
	}

	const finalCount = await db.$count(qcTagsLibrary);

	console.log("");
	log(`qc_tags seeding complete — inserted ${inserted}, already present ${skipped}.`);
	log(`qc_tags now holds ${finalCount} row(s) (was ${existingCount}).`);

	if (inserted === 0) {
		log("Nothing to do: every reference tag was already present.");
	}
};

const initDb = async () => {
	console.log("");
	console.log("================ Data Cortex — database initialisation ================");
	log(`Target database : ${describeTarget()}`);
	log(`Node environment: ${process.env.NODE_ENV ?? "(unset)"}`);

	step(1, 3, "Checking existing users");

	const existingUsersResult = await db.execute<{
		total_users: number;
	}>(sql`
		SELECT COUNT(*)::integer AS total_users
		FROM users
		WHERE deactivated_at IS NULL;
	`);

	const totalUsers = existingUsersResult.rows?.[0]?.total_users ?? 0;
	log(`Found ${totalUsers} active user(s) (deactivated_at IS NULL).`);

	if (totalUsers > 0) {
		step(2, 3, "Admin creation — skipped");
		log("Users already exist in this database.");
		log("Initial setup is allowed only once, so no user will be created.");
		log("Contact your developer/admin to add more users.");

		// Reference data is still topped up: a database can hold users but an
		// empty qc_tags table, and no QC config can be created without tags.
		const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).orderBy(asc(usersTable.createdAt)).limit(1);
		log(`Using the earliest existing user (${existingUser.id}) to attribute reference data.`);

		step(3, 3, "Seeding reference data");
		await seedTraditionalChecks();

		await seedQcTags(existingUser.id);

		console.log("");
		log(`Done in ${elapsed()}. No user created; reference data verified.`);
		return;
	}

	step(2, 3, "First-time admin setup");
	log("No users found — this database has not been initialised before.");
	log("Only administrators can be created here. Engineers and analysts are added by an admin from inside the app.");
	console.log("");

	const adminCount = await askAdminCount();
	const admins: { email: string; fullName: string }[] = [];

	// Everything is collected and checked before anything is written, so a mistake while typing
	// the fourth administrator cannot leave a half-initialised database.
	for (let n = 1; n <= adminCount; n++) {
		console.log(`\nAdministrator ${n} of ${adminCount}`);

		const email = await askRequired("Email: ");
		validateEmail(email);

		if (admins.some(admin => admin.email.toLowerCase() === email.toLowerCase())) {
			throw new Error(`${email} was already entered`);
		}

		const fullName = await askRequired("Full name: ");
		admins.push({ email, fullName });
	}

	console.log("");
	log(`Creating ${admins.length} administrator(s)...`);

	const createdUsers = await db
		.insert(usersTable)
		.values(admins.map(admin => ({ ...admin, role: "admin" as const })))
		.returning({
			id: usersTable.id,
			email: usersTable.email,
			fullName: usersTable.fullName,
			role: usersTable.role,
		});

	log("Administrator(s) created successfully:");
	console.log(createdUsers);

	step(3, 3, "Seeding reference data");
	await seedTraditionalChecks();

	// Reference data is attributed to the first administrator entered.
	await seedQcTags(createdUsers[0].id);

	console.log("");
	log(`Done in ${elapsed()}. ${createdUsers.length} admin(s) created (${createdUsers.map(user => user.email).join(", ")}) and reference data seeded.`);
};

initDb()
	.then(async () => {
		await rl.close();
		process.exit(0);
	})
	.catch(async (error) => {
		await rl.close();
		console.error("");
		console.error(`[init-db ${elapsed()}] FAILED — the database was not fully initialised.`);
		console.error(`[init-db ${elapsed()}] Target: ${describeTarget()}`);
		console.error("");
		console.error(error);
		process.exit(1);
	});
