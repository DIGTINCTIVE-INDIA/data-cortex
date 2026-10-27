import { index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { serviceApiKeys } from "./service-keys.schema.js";
import { usersTable } from "./user.schema.js";

/**
 * One row per check run a user or service started: what the Jobs page lists.
 *
 * The engine already knows a run's state, but only inside Celery's result backend,
 * which expires and is not queryable by who started it. This is the durable record.
 * It is written when the engine accepts the run and kept current by asking the
 * engine, so it survives the engine forgetting.
 *
 * It holds the JOB's status, not the checks'. A job that finishes with failing
 * checks is `completed` -- the job worked; what the checks found lives in `results`,
 * joined by job id.
 */
export const checkRuns = pgTable(
	"check_runs",
	{
		// The id the engine API returned (its Celery task id). The engine derives its
		// job id from this, as JOB_<runId>, which is how results rows are found.
		runId: varchar("run_id").primaryKey(),

		// DBC0001 / FBC0001 / CB0001. No foreign key: configs live in three tables, and a
		// run must stay listed after its config is deleted.
		configId: varchar("config_id").notNull(),

		// db | file | custom-sql -- what the caller said it was running.
		source: varchar("source", { length: 20 }).notNull(),

		// Who started it. Admins see every run; everyone else sees only their own.
		userId: uuid("user_id")
			.notNull()
			.references(() => usersTable.id),

		// Which API key started it, when it was started with one (null for a person signed
		// in through SSO). The user above is the service identity, and an identity can hold
		// several keys, so without this "who started it" stops at the identity and a run
		// can never be traced to the credential that made it. SET NULL on delete: removing
		// a key must not remove the history of what it did.
		apiKeyId: uuid("api_key_id").references(() => serviceApiKeys.id, { onDelete: "set null" }),

		// held | dispatching | queued | running | completed | failed
		//
		// held / dispatching exist only while the engine could not take the run: the backend keeps
		// the run here (with a run id of its own choosing) and hands it over when the engine is
		// reachable again. dispatching is the short claim while one hand-over is in flight; the
		// API reports both as "held".
		status: varchar("status", { length: 20 }).notNull().default("queued"),

		// For a held run: the idempotency key the click carried, so a double click while the
		// engine is down is one held run, not two. How many hand-overs were tried, and why the
		// last one did not go through, so "waiting for the engine" can say what it is waiting for.
		idempotencyKey: text("idempotency_key"),
		dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
		lastDispatchError: text("last_dispatch_error"),

		// The engine's own word for it (PENDING, STARTED, SUCCESS, FAILURE...), kept so a
		// stuck run can be diagnosed without re-deriving how `status` was mapped.
		engineState: varchar("engine_state", { length: 30 }),

		// What the engine returned on success: the overall criticality, or "FAIL".
		jobStatus: varchar("job_status", { length: 50 }),

		// Why the job itself failed (an exception), not why a check did.
		error: text("error"),
		// The same failure in two more forms: a short plain title for the business reader, and the
		// raw exception plus traceback for the developer. `error` above is the plain reason.
		errorTitle: text("error_title"),
		errorDetail: text("error_detail"),

		submittedAt: timestamp("submitted_at").defaultNow().notNull(),
		startedAt: timestamp("started_at"),
		finishedAt: timestamp("finished_at"),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	table => [
		// The common read: "my runs, newest first".
		index("ix_check_runs_user_submitted").on(table.userId, table.submittedAt),
		// Finding runs that still need their state refreshed.
		index("ix_check_runs_status").on(table.status),
		// The admin list is "everything, newest first".
		index("ix_check_runs_submitted").on(table.submittedAt),
	],
);
