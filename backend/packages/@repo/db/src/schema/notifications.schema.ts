import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { checkCriticality } from "./configs.schema.js";
import { qcTagsLibrary } from "./libraries.schema.js";
import { usersTable } from "./user.schema.js";

/**
 * Email notification rules.
 *
 * A rule answers: "when a check fails, who should hear about it?"
 *
 * What the rule *matches on* lives in emailNotificationRuleTargets, not here.
 * Recipients stay on the rule itself: they reference nothing, so a child table
 * would buy no integrity and would duplicate every address once per
 * (downstream, severity) pair.
 */
export const emailNotificationRules = pgTable("email_notification_rules", {
	ruleId: varchar("rule_id").primaryKey(), // EG. EN0001, allocated from id_sequences
	name: varchar("name").notNull(),

	// Where the mail goes. Plain addresses; distribution lists are just addresses.
	recipients: text("recipients").array().notNull(),

	enabled: boolean("enabled").notNull().default(true),

	userId: uuid("user_id")
		.notNull()
		.references(() => usersTable.id),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow(),
	deactivatedAt: timestamp("deactivated_at"),
});

/**
 * One row per (rule, downstream, severity) the rule fires on.
 *
 * This replaces the integer[] + enum[] pair that used to sit on the rule. The
 * reason is integrity, not speed: Postgres cannot put a foreign key on an array
 * element, so with arrays the qc_tags link had to be enforced in application
 * code, and deleting a tag straight from SQL left rules pointing at ids that
 * silently never matched again. Here the database enforces it and CASCADE cleans
 * up after a deleted tag.
 *
 * The composite primary key also makes the combination unique for free, so the
 * same pair cannot be stored twice for one rule.
 */
export const emailNotificationRuleTargets = pgTable(
	"email_notification_rule_targets",
	{
		ruleId: varchar("rule_id")
			.notNull()
			.references(() => emailNotificationRules.ruleId, { onDelete: "cascade" }),

		downstreamId: integer("downstream_id")
			.notNull()
			.references(() => qcTagsLibrary.id, { onDelete: "cascade" }),

		criticality: checkCriticality("criticality").notNull(),
	},
	table => [
		primaryKey({ columns: [table.ruleId, table.downstreamId, table.criticality] }),
		// The lookup direction: given a failure's downstreams and severity, which rules?
		index("ix_email_rule_targets_match").on(table.downstreamId, table.criticality),
	],
);

/**
 * One row per (rule, failed check) that this server has taken responsibility for
 * notifying, so a retried callback does not notify twice.
 *
 * The unique index is the idempotency mechanism, not just a guard: a row is
 * INSERTed with ON CONFLICT DO NOTHING *before* any mail is sent, and only the
 * caller whose insert actually returned a row goes on to send. Checking first and
 * inserting after would let two concurrent retries both read "not sent yet" and
 * both mail.
 *
 * `sent` therefore starts false, meaning "claimed, outcome unknown", and is
 * updated once the send resolves.
 */
export const emailNotificationLog = pgTable(
	"email_notification_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		ruleId: varchar("rule_id")
			.notNull()
			.references(() => emailNotificationRules.ruleId, { onDelete: "cascade" }),

		// From results.check_execution_id. Not a foreign key: results is written by
		// the engine, and a notification should still be recorded even if the row is
		// later cleaned up.
		checkExecutionId: integer("check_execution_id").notNull(),

		recipients: text("recipients").array().notNull(),
		sent: boolean("sent").notNull().default(false),
		error: text("error"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	table => [uniqueIndex("ux_email_notification_log_rule_execution").on(table.ruleId, table.checkExecutionId)],
);
