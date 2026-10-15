import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgSequence, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./user.schema.js";

/**
 * Backs traditional_checks_library_rev.check_id's default (TC001, TC002, ...).
 * Declared so the sequence exists before any insert relies on it.
 */
export const traditionalChecksLibraryRevSeq = pgSequence("traditional_checks_library_rev_seq");

/**
 * The fixed master list of traditional check types (TC001-TC011).
 *
 * READ BY THE ENGINE, not by this app -- it joins these rows against
 * traditional_config_details to decide which check function to run for each
 * field rule, and whether a failure aborts the whole job (`abort`).
 *
 * Declared here so a database created by `db:push` is complete for the engine.
 * The engine creates this table itself only on a forced init; on a normal job run
 * it short-circuits as soon as it sees a `users` table, which this schema also
 * creates -- so without this declaration the table never appears and every
 * traditional run fails with "no checks to execute".
 *
 * Shape matches the engine's ORM exactly (Data_Code/common/database.py).
 * Not to be confused with traditionalChecksLibrary above, which is this app's own
 * table and currently unused.
 */
export const traditionalChecksLibraryRev = pgTable("traditional_checks_library_rev", {
	checkId: varchar("check_id", { length: 10 })
		.primaryKey()
		.default(sql`'TC' || lpad(nextval('traditional_checks_library_rev_seq')::text, 3, '0')`),
	checkMappingName: varchar("check_mapping_name", { length: 255 }).notNull().unique(),
	checkName: varchar("check_name", { length: 255 }).notNull().unique(),
	checkDescription: text("check_description"),
	abort: boolean("abort").notNull(),
});

export const traditionalChecksLibrary = pgTable("traditional_checks_library", {
	checkId: varchar("check_id").primaryKey(), //EG:-TC_0001
	checkMappingName: varchar("check_mapping_name").unique().notNull(),
	checkName: varchar("check_name").unique().notNull(),
	checkDescription: text("check_description"),
	abort: boolean("abort").notNull(),
	userId: uuid("user_id") // add active/inactive
		.notNull()
		.references(() => usersTable.id),
	enabled: boolean().notNull().default(true),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export const qctagTypeEnum = pgEnum("qc_tag_type", ["impacted_downstream", "workstream", "data_source", "category"]);

export const qcTagsLibrary = pgTable("qc_tags", {
	id: serial("id").primaryKey(), // int
	tagType: qctagTypeEnum("type").notNull(),
	tagTitle: varchar("title").notNull(),
	description: text("description"),
	userId: uuid("user_id") // add active/inactive
		.notNull()
		.references(() => usersTable.id),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});
