import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Engine run logs.
 *
 * These two tables are WRITTEN BY THE ENGINE, not by this app -- nothing in the
 * monorepo reads or writes them. They are declared here so that a database
 * created from this schema (`db:push`) is complete and the engine can log into
 * it immediately.
 *
 * Because the engine owns the writes, the column types match what it emits and
 * must not be "improved":
 *   - `id` is a varchar holding a UUID string, not a uuid column.
 *   - `user_id` is a plain varchar with NO foreign key to users -- the engine
 *     writes placeholder values such as 'SYSTEM' as well as real user ids.
 *   - `timestamp` is without time zone.
 * Changing any of those breaks the engine's inserts.
 *
 * Index names follow the engine's own convention (ix_<table>_<column>) so a
 * database built from here is identical to one the engine built itself.
 */

export const systemLogs = pgTable(
	"system_logs",
	{
		id: varchar("id").primaryKey(),
		jobId: varchar("job_id").notNull(),
		userId: varchar("user_id"),
		timestamp: timestamp("timestamp").notNull(),
		code: varchar("code").notNull(),
		severity: varchar("severity").notNull(),
		message: text("message").notNull(),
		contextJson: text("context_json"),
		flushedAt: timestamp("flushed_at"),
	},
	table => [
		index("ix_system_logs_job_id").on(table.jobId),
		index("ix_system_logs_user_id").on(table.userId),
		index("ix_system_logs_timestamp").on(table.timestamp),
		index("ix_system_logs_code").on(table.code),
		index("ix_system_logs_severity").on(table.severity),
		index("ix_system_logs_flushed_at").on(table.flushedAt),
	],
);

export const validationLogs = pgTable(
	"validation_logs",
	{
		id: varchar("id").primaryKey(),
		jobId: varchar("job_id").notNull(),
		userId: varchar("user_id"),
		timestamp: timestamp("timestamp").notNull(),
		message: text("message").notNull(),
		contextJson: text("context_json"),
		flushedAt: timestamp("flushed_at"),
	},
	table => [
		index("ix_validation_logs_job_id").on(table.jobId),
		index("ix_validation_logs_user_id").on(table.userId),
		index("ix_validation_logs_timestamp").on(table.timestamp),
		index("ix_validation_logs_flushed_at").on(table.flushedAt),
	],
);
