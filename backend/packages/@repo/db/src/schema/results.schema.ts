import {
	text, boolean, index, integer, pgEnum, pgTable, serial, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { qcTagsLibrary } from "./libraries.schema.js";
import { usersTable } from "./user.schema.js";

export const resultsCriticality = pgEnum("results_criticality", ["low", "medium", "high"]);

// Suggestions on Indexing -
// Field to index - jobTimestamp ,

export const issueStatusEnum = pgEnum("issue_status", ["open", "resolved", "discarded"]);
/**
 * What kind of check produced a result row. WRITTEN BY THE ENGINE, so these are
 * the exact strings it emits:
 *   "traditional" -- trad_ct_id/checks_executor.py and trad_ct_id/sql_executor.py.
 *                    BOTH file-based and db-based configs go through those two, so
 *                    they share this one value; there is no per-family distinction
 *                    here. Which family a result came from is derivable from its
 *                    config_id prefix (FBC / DBC).
 *   "custom_sql"  -- custom_checks/functions.py.
 *
 * Not to be confused with the request vocabulary in the run endpoint, which sends
 * "traditional" / "custom_check" to the engine. That names the pipeline to run;
 * this names what got written.
 */
export const checkTypeEnum = pgEnum("check_type", ["traditional", "custom_sql"]);

/**
 * The outcome of a single check. The three values say different things about
 * WHOSE problem it is, which is what decides who acts on the row:
 *
 *   passed -- the check ran and the data is in the expected quality.
 *   failed -- the check ran correctly and the data did not meet it. The product
 *             worked; the client's data has a quality issue. This is the signal
 *             the client acts on, and the only one that belongs in data-quality
 *             metrics.
 *   error  -- something unexpected happened and the check could not complete
 *             (misconfiguration, a missing column_order/column_datatype, a
 *             connection dropping). This says NOTHING about the data: it is our
 *             problem, not the client's, and must never be reported as a quality
 *             failure.
 *   upstream_failed
 *          -- the check never ran. TC001-TC004 are mandatory gates that run before
 *             the user's configured checks to confirm the basics hold (the file is
 *             there, the columns are named and ordered as expected, the datatypes
 *             match). When a gate does not pass, running the remaining checks would
 *             produce verdicts nobody can trust, so they are deliberately not run.
 *
 *             This is the product behaving correctly, NOT a fault of ours and NOT a
 *             separate data-quality issue. The actual verdict lives in the gate's own
 *             row -- `failed` if the client's data did not meet it, `error` if we
 *             could not run it. These rows carry no verdict at all; failure_reason
 *             names the gate that stopped them.
 *
 *             Terminal, not pending: they will not be retried.
 *
 *             Keep them OUT of issue lists and issue counts. One gate failure must
 *             surface as one issue, not as one issue plus every check it prevented.
 *
 * Consequences worth keeping in mind when writing queries against this column:
 *   - Count data-quality issues as `check_status = 'failed'`, never as
 *     `!= 'passed'` -- the latter silently blames the client for our bugs.
 *   - passed + failed does NOT equal the row count once errors exist. A total
 *     taken with count(*) includes errors, which is correct (they were executed)
 *     but means the two do not add up.
 *   - An `error` on a check with abort=true stops the rest of that config, since
 *     nothing downstream can be trusted once a schema check could not run.
 */
export const checkStatusEnum = pgEnum("check_status", ["passed", "failed", "error", "upstream_failed"]);

export const results = pgTable("results", {
	checkExecutionId: serial("check_execution_id").primaryKey(),
	jobId: varchar("job_id").notNull(),
	jobTimestamp: timestamp("job_timestamp").notNull(),
	userId: uuid("user_id")
		.notNull()
		.references(() => usersTable.id),
	checkId: varchar("check_id").notNull(),
	checkName: varchar("check_name").notNull(),
	checkDescription: varchar("check_description"),
	configId: varchar("config_id").notNull(),
	configName: varchar("config_name").notNull(),
	checkCategory: integer("check_category")
		.notNull()
		.references(() => qcTagsLibrary.id),
	workstream: integer("workstream")
		.notNull()
		.references(() => qcTagsLibrary.id),
	impactedDownstream: integer("impacted_downstream").array().notNull(),
	dataSource: integer("data_source")
		.notNull()
		.references(() => qcTagsLibrary.id),
	fileOrTableName: varchar("file_or_table_name").notNull(),
	checkType: checkTypeEnum("check_type").notNull(),
	// Nullable on purpose. Table-level checks have no single field to name:
	// TC002 column_name, TC003 column_order and TC004 datatype all validate the
	// table as a whole, and the engine writes NULL for them. Field-level checks
	// (null, duplicate, length, format, LOV, RI, primary key) do name a column.
	//
	// So NULL here means "this check is not about one column", not "unknown".
	// Forcing NOT NULL only pushes the engine into a placeholder string, which is
	// how it ended up writing the literal 'NA' for TC001.
	field: varchar("field"),
	abort: boolean("abort").notNull(),
	checkStatus: checkStatusEnum("check_status").notNull(),
	criticality: resultsCriticality("criticality"),
	issueRows: varchar("issue_rows").notNull(),
	passedRows: varchar("passed_rows").notNull(),
	// Run-level row picture (same on every result of a config in one run): the rows the table had,
	// and how many DIFFERENT rows failed at least one check. Null when rows were never evaluated
	// and on results written before these columns existed.
	rowsTotal: integer("rows_total"),
	rowsFailed: integer("rows_failed"),
	failureReason: varchar("failure_reason"),
	issueStatus: issueStatusEnum("issue_status").default("open"), // ENUM :- open , resolved , discarded

	// Why a human discarded or resolved the alert. Separate from failureReason,
	// which is the engine saying why the check failed -- one is a verdict on the
	// data, the other a verdict on the alert, and overwriting one with the other
	// loses the original finding.
	issueStatusReason: text("issue_status_reason"),

	// needs to be verified
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
},
table => [
	// Every Jobs-page lookup is "the rows of this job" (job_id = JOB_<run id>); without
	// this each one scanned the whole table, which grows with every run ever made.
	index("ix_results_job_id").on(table.jobId),
]);

// Time Bucket -
// Quarterly Till Date
// Year till date
// Current week
// Current month
// Launch Till Date
