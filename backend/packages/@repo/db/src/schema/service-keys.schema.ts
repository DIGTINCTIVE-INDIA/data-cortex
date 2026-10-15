import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { usersTable } from "./user.schema.js";

/**
 * API keys for service users -- how Airflow and other systems authenticate.
 *
 * Only a hash is stored. The key is shown once, at creation, and cannot be
 * recovered afterwards: a lost key is replaced, not looked up. SHA-256 is enough
 * here (unlike a password) because the key is 256 bits of randomness, so there is
 * nothing to brute-force and no reason to pay for a slow hash on every request.
 *
 * A key looks like `dck_<prefix>_<secret>`. The prefix is not secret; it is the
 * lookup handle, so a request costs one indexed read plus a constant-time compare
 * instead of hashing against every stored key.
 *
 * A service user can hold several keys at once, which is what makes rotation
 * possible without downtime: add the new one, switch the caller, revoke the old.
 */
export const serviceApiKeys = pgTable(
	"service_api_keys",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		userId: uuid("user_id")
			.notNull()
			.references(() => usersTable.id, { onDelete: "cascade" }),

		// What the key is for, e.g. "airflow-prod". Shown in the UI so a key can be
		// recognised without ever displaying it.
		name: varchar("name", { length: 100 }).notNull(),

		keyPrefix: varchar("key_prefix", { length: 16 }).notNull().unique(),
		keyHash: varchar("key_hash", { length: 64 }).notNull(),

		createdBy: uuid("created_by").references(() => usersTable.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),

		// Updated on use, so an admin can tell a live key from a forgotten one.
		lastUsedAt: timestamp("last_used_at"),
		expiresAt: timestamp("expires_at"),
		revokedAt: timestamp("revoked_at"),
	},
	table => [index("ix_service_api_keys_user_id").on(table.userId)],
);
