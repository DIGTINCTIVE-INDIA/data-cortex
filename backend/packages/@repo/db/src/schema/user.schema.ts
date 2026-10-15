import { boolean, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export type UserRoleEnum = "admin" | "engineer" | "analyst" | "service";

export const userRoleEnum = pgEnum("user_role", [
	"admin", // operations team (full control)
	"engineer", // devs / data engineers
	"analyst", // business / functional users
	// A non-person identity for other systems (Airflow, schedulers). It signs in with an
	// API key, never SSO, and may only trigger runs. It is a users row so that every run
	// it starts is attributed to something the engine can validate.
	"service",
]);

export const usersTable = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	role: userRoleEnum("role").notNull().default("analyst"),
	refreshToken: text("refresh_token"),
	enabled: boolean().notNull().default(true),
	createdBy: uuid("created_by")
		// .notNull()
		.references((): any => usersTable.id),
	// No default: a user who has never signed in has no last login. Defaulting to
	// now() made every freshly created account look as if it had already logged in.
	lastLoginAt: timestamp("last_login_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	// No $onUpdate: that fired on ANY write to the row, so signing in (which only
	// touches last_login_at and the refresh token) also moved updated_at.
	// updateUser sets this explicitly, which is the only time it should move.
	updatedAt: timestamp("updated_at").defaultNow(),
	deactivatedAt: timestamp("deactivated_at"),
});
