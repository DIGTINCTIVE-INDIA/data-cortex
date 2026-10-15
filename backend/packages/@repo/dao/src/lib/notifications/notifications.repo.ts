import {
	and,
	asc,
	count,
	db,
	emailNotificationLog,
	emailNotificationRules,
	emailNotificationRuleTargets,
	eq,
	inArray,
	qcTagsLibrary,
} from "@repo/db";
import { Paginator, type PaginationType } from "@repo/lib";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { SMTPMailService } from "@repo/lib/mail-module";

import type { IdGenerationRepo } from "../common/id-generation.repo.js";

type Criticality = "low" | "medium" | "high";

export type NotificationRulePayload = {
	name: string;
	impactedDownstreamIds: number[];
	criticality: Criticality[];
	recipients: string[];
};

/** One failed check inside a run. */
export type CheckFailure = {
	checkExecutionId: number;
	checkName: string;
	criticality: Criticality;
	impactedDownstreamIds: number[];
	failureReason?: string;
	issueRows?: string;
	field?: string;
};

/**
 * What the engine posts when a run finishes with failures.
 *
 * One call per run, not per failed check. A single config fans out into many
 * field-level checks, so a run routinely fails several at once; batching means
 * one request, one rule resolution and one email per rule instead of N of each.
 */
export type RunFailuresEvent = {
	configId: string;
	configName?: string;
	jobId?: string;
	runId?: string;
	failures: CheckFailure[];
};

/** A rule reduced to what matching needs, with its targets as a lookup set. */
type CachedRule = {
	ruleId: string;
	name: string;
	recipients: string[];
	/** `${downstreamId}|${criticality}` for every pair this rule fires on. */
	targets: Set<string>;
};

const targetKey = (downstreamId: number, criticality: string) => `${downstreamId}|${criticality}`;

/** Rules change rarely and every mutation goes through this class. */
const RULES_CACHE_TTL_MS = 30_000;

export class NotificationsRepo {
	private idGenerationRepo: IdGenerationRepo;

	/**
	 * Enabled rules, held in memory so the hot path does not query.
	 *
	 * Invalidated directly by this class's own mutations, which makes it exact for
	 * a single instance. The TTL is only a backstop for a second instance whose
	 * mutations this process never sees.
	 */
	private rulesCache: { at: number; rules: CachedRule[] } | null = null;

	constructor(idGenerationRepo: IdGenerationRepo) {
		this.idGenerationRepo = idGenerationRepo;
	}

	private invalidateRulesCache() {
		this.rulesCache = null;
	}

	private async enabledRules(): Promise<CachedRule[]> {
		const now = Date.now();

		if (this.rulesCache && now - this.rulesCache.at < RULES_CACHE_TTL_MS) {
			return this.rulesCache.rules;
		}

		// Inner join: a rule with no targets can never match, so it is not worth caching.
		const rows = await db
			.select({
				ruleId: emailNotificationRules.ruleId,
				name: emailNotificationRules.name,
				recipients: emailNotificationRules.recipients,
				downstreamId: emailNotificationRuleTargets.downstreamId,
				criticality: emailNotificationRuleTargets.criticality,
			})
			.from(emailNotificationRules)
			.innerJoin(
				emailNotificationRuleTargets,
				eq(emailNotificationRuleTargets.ruleId, emailNotificationRules.ruleId),
			)
			.where(eq(emailNotificationRules.enabled, true));

		const byRule = new Map<string, CachedRule>();

		for (const row of rows) {
			const rule =
				byRule.get(row.ruleId) ??
				({ ruleId: row.ruleId, name: row.name, recipients: row.recipients, targets: new Set<string>() } satisfies CachedRule);

			rule.targets.add(targetKey(row.downstreamId, row.criticality));
			byRule.set(row.ruleId, rule);
		}

		const rules = [...byRule.values()];

		this.rulesCache = { at: now, rules };

		return rules;
	}

	/**
	 * Cheap enough to call on every dispatch: it reads the cache, not the database.
	 *
	 * Used to tell the engine not to bother calling back at all when nothing could
	 * possibly match. Deliberately coarse -- "are there any rules" rather than "does
	 * this config match" -- because the precise answer needs the config row, and
	 * every dispatch would then pay a SELECT to save a callback on the rarer
	 * failure path.
	 */
	async anyRulesEnabled() {
		return (await this.enabledRules()).length > 0;
	}

	/**
	 * Every downstream id must be a real qc_tags row of the right type.
	 *
	 * The foreign key on rule targets now guarantees this, but a raw FK violation
	 * surfaces as a 500 with a Postgres message. This turns it into a 400 naming
	 * the offending ids, which is what the form needs. Rules are created by hand,
	 * so the extra query costs nothing that matters.
	 */
	private async assertDownstreamIdsExist(ids: number[]) {
		if (ids.length === 0) {
			throw new ErrorResponse("Select at least one impacted downstream", 400);
		}

		const found = await db
			.select({ id: qcTagsLibrary.id })
			.from(qcTagsLibrary)
			.where(and(inArray(qcTagsLibrary.id, ids), eq(qcTagsLibrary.tagType, "impacted_downstream")));

		const foundIds = new Set(found.map(row => row.id));
		const missing = ids.filter(id => !foundIds.has(id));

		if (missing.length > 0) {
			throw new ErrorResponse(`Unknown impacted downstream: ${missing.join(", ")}`, 400);
		}
	}

	/** Every (downstream, severity) pair the UI's two chip lists imply. */
	private targetRows(ruleId: string, downstreamIds: number[], criticality: Criticality[]) {
		return downstreamIds.flatMap(downstreamId =>
			criticality.map(level => ({ ruleId, downstreamId, criticality: level })),
		);
	}

	/**
	 * Folds the target rows back into the two arrays the UI works with.
	 *
	 * The form can only express a full cross-product of its two chip lists, so this
	 * round-trips exactly for anything created through it. A hand-written partial
	 * set would widen when read back; the table is the source of truth for matching
	 * either way.
	 */
	private async attachTargets<T extends { ruleId: string }>(rules: T[]) {
		if (rules.length === 0) return [];

		const targets = await db
			.select()
			.from(emailNotificationRuleTargets)
			.where(
				inArray(
					emailNotificationRuleTargets.ruleId,
					rules.map(rule => rule.ruleId),
				),
			);

		// Names travel with the rule. The page used to resolve ids against the libraries
		// list, which returns only enabled tags and only the newest 30, so a rule that
		// pointed at a disabled tag rendered as a bare "#15".
		const tagIds = [...new Set(targets.map(target => target.downstreamId))];

		const tags = tagIds.length
			? await db
					.select({ id: qcTagsLibrary.id, title: qcTagsLibrary.tagTitle, enabled: qcTagsLibrary.enabled })
					.from(qcTagsLibrary)
					.where(inArray(qcTagsLibrary.id, tagIds))
			: [];

		const tagById = new Map(tags.map(tag => [tag.id, tag]));

		const grouped = new Map<string, { downstream: Set<number>; criticality: Set<Criticality> }>();

		for (const target of targets) {
			const entry = grouped.get(target.ruleId) ?? { downstream: new Set<number>(), criticality: new Set<Criticality>() };

			entry.downstream.add(target.downstreamId);
			entry.criticality.add(target.criticality);
			grouped.set(target.ruleId, entry);
		}

		return rules.map(rule => {
			const entry = grouped.get(rule.ruleId);

			const ids = entry ? [...entry.downstream].sort((a, b) => a - b) : [];

			return {
				...rule,
				impactedDownstream: ids,
				// `enabled: false` means the tag was retired in Configure Libraries. The rule
				// still matches on its id, so it is shown rather than hidden.
				impactedDownstreamDetails: ids.map(id => ({
					id,
					title: tagById.get(id)?.title ?? `Unknown tag ${id}`,
					enabled: tagById.get(id)?.enabled ?? false,
				})),
				criticality: entry ? [...entry.criticality] : [],
			};
		});
	}

	async listRules({ limit = 20, page = 1 }: PaginationType) {
		const offset = (page - 1) * limit;

		const [{ total }] = await db.select({ total: count() }).from(emailNotificationRules);

		const rules = await db
			.select()
			.from(emailNotificationRules)
			.orderBy(asc(emailNotificationRules.ruleId))
			.limit(limit)
			.offset(offset);

		const withTargets = await this.attachTargets(rules);

		return Paginator.paginate({ limit: limit.toString(), page: page.toString() }, withTargets, total);
	}

	async createRule(payload: NotificationRulePayload, userId: string) {
		await this.assertDownstreamIdsExist(payload.impactedDownstreamIds);

		const created = await db.transaction(async tx => {
			const ruleId = await this.idGenerationRepo.getNextId("email_notification_rules", tx);

			const [row] = await tx
				.insert(emailNotificationRules)
				.values({ ruleId, name: payload.name, recipients: payload.recipients, userId })
				.returning();

			if (!row) {
				throw new ErrorResponse("Failed to create notification rule", 500);
			}

			await tx
				.insert(emailNotificationRuleTargets)
				.values(this.targetRows(ruleId, payload.impactedDownstreamIds, payload.criticality));

			return row;
		});

		this.invalidateRulesCache();

		return {
			...created,
			impactedDownstream: payload.impactedDownstreamIds,
			criticality: payload.criticality,
		};
	}

	async updateRule(ruleId: string, payload: Partial<NotificationRulePayload>) {
		const existing = await db.query.emailNotificationRules.findFirst({
			where: eq(emailNotificationRules.ruleId, ruleId),
		});

		if (!existing) {
			throw new ErrorResponse("Notification rule not found", 404);
		}

		if (payload.impactedDownstreamIds) {
			await this.assertDownstreamIdsExist(payload.impactedDownstreamIds);
		}

		// Targets are replaced wholesale rather than diffed: the set is small, and a
		// delete-then-insert inside the transaction cannot leave a half-updated rule.
		const replacingTargets = payload.impactedDownstreamIds !== undefined || payload.criticality !== undefined;

		const updated = await db.transaction(async tx => {
			const updateData: Partial<typeof emailNotificationRules.$inferInsert> = { updatedAt: new Date() };

			if (payload.name !== undefined) updateData.name = payload.name;
			if (payload.recipients !== undefined) updateData.recipients = payload.recipients;

			const [row] = await tx
				.update(emailNotificationRules)
				.set(updateData)
				.where(eq(emailNotificationRules.ruleId, ruleId))
				.returning();

			if (!row) {
				throw new ErrorResponse("Failed to update notification rule", 500);
			}

			if (replacingTargets) {
				const current = await tx
					.select()
					.from(emailNotificationRuleTargets)
					.where(eq(emailNotificationRuleTargets.ruleId, ruleId));

				const downstreamIds =
					payload.impactedDownstreamIds ?? [...new Set(current.map(target => target.downstreamId))];
				const criticality = payload.criticality ?? [...new Set(current.map(target => target.criticality))];

				await tx.delete(emailNotificationRuleTargets).where(eq(emailNotificationRuleTargets.ruleId, ruleId));
				await tx.insert(emailNotificationRuleTargets).values(this.targetRows(ruleId, downstreamIds, criticality));
			}

			return row;
		});

		this.invalidateRulesCache();

		const [withTargets] = await this.attachTargets([updated]);

		return withTargets;
	}

	async toggleRule(ruleId: string) {
		const existing = await db.query.emailNotificationRules.findFirst({
			where: eq(emailNotificationRules.ruleId, ruleId),
		});

		if (!existing) {
			throw new ErrorResponse("Notification rule not found", 404);
		}

		const [updated] = await db
			.update(emailNotificationRules)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(emailNotificationRules.ruleId, ruleId))
			.returning();

		this.invalidateRulesCache();

		return updated;
	}

	async deleteRule(ruleId: string) {
		// Targets go with it: the foreign key is ON DELETE CASCADE.
		const [deleted] = await db
			.delete(emailNotificationRules)
			.where(eq(emailNotificationRules.ruleId, ruleId))
			.returning();

		if (!deleted) {
			throw new ErrorResponse("Notification rule not found", 404);
		}

		this.invalidateRulesCache();

		return deleted;
	}

	/** A rule fires for a failure when one of its downstreams pairs with that severity. */
	private matches(rule: CachedRule, failure: CheckFailure) {
		return failure.impactedDownstreamIds.some(id => rule.targets.has(targetKey(id, failure.criticality)));
	}

	private describe(event: RunFailuresEvent, rule: CachedRule, failures: CheckFailure[]) {
		const rank: Record<Criticality, number> = { low: 0, medium: 1, high: 2 };
		const worst = failures.reduce((a, b) => (rank[b.criticality] > rank[a.criticality] ? b : a)).criticality;

		const where = event.configName ? `${event.configName} (${event.configId})` : event.configId;

		const subject =
			failures.length === 1
				? `[${worst.toUpperCase()}] QC check failed: ${failures[0]!.checkName}`
				: `[${worst.toUpperCase()}] ${failures.length} QC checks failed: ${where}`;

		const head = [
			`Config: ${where}`,
			event.jobId ? `Job: ${event.jobId}` : null,
			`Failed checks: ${failures.length}`,
			"",
		].filter(line => line !== null);

		const body = failures.map(failure =>
			[
				`- [${failure.criticality}] ${failure.checkName}`,
				failure.field ? `    Field: ${failure.field}` : null,
				failure.issueRows ? `    Rows affected: ${failure.issueRows}` : null,
				failure.failureReason ? `    Reason: ${failure.failureReason}` : null,
			]
				.filter(line => line !== null)
				.join("\n"),
		);

		return { subject, text: [...head, ...body, "", `Rule: ${rule.name} (${rule.ruleId})`].join("\n") };
	}

	/**
	 * Called by the engine callback once per run that had failures.
	 *
	 * Returns a summary rather than throwing: a notification problem must never
	 * fail the check run that triggered it.
	 *
	 * Rules are matched in memory against the cached set, so the hot path issues no
	 * SELECT at all. Per matching rule it costs one INSERT to claim the failures and
	 * one UPDATE to record the outcome.
	 */
	async notifyRunFailures(event: RunFailuresEvent) {
		if (event.failures.length === 0) {
			return { matchedRules: 0, emailsSent: 0, notifiedChecks: 0, skipped: "no failures" as const };
		}

		const rules = await this.enabledRules();

		if (rules.length === 0) {
			return { matchedRules: 0, emailsSent: 0, notifiedChecks: 0, skipped: "no rules configured" as const };
		}

		// One bucket per rule, holding only the failures that rule actually cares
		// about -- a run can fail checks at several severities and a rule may want
		// just some of them.
		const buckets = new Map<string, { rule: CachedRule; failures: CheckFailure[] }>();

		for (const failure of event.failures) {
			for (const rule of rules) {
				if (!this.matches(rule, failure)) continue;

				const bucket = buckets.get(rule.ruleId) ?? { rule, failures: [] };
				bucket.failures.push(failure);
				buckets.set(rule.ruleId, bucket);
			}
		}

		if (buckets.size === 0) {
			return { matchedRules: 0, emailsSent: 0, notifiedChecks: 0, skipped: "no matching rule" as const };
		}

		let emailsSent = 0;
		let notifiedChecks = 0;

		for (const { rule, failures } of buckets.values()) {
			// Claim before sending. The unique index decides who wins, so two
			// concurrent retries cannot both conclude "not notified yet".
			const claimed = await db
				.insert(emailNotificationLog)
				.values(
					failures.map(failure => ({
						ruleId: rule.ruleId,
						checkExecutionId: failure.checkExecutionId,
						recipients: rule.recipients,
					})),
				)
				.onConflictDoNothing()
				.returning({ id: emailNotificationLog.id, checkExecutionId: emailNotificationLog.checkExecutionId });

			// Everything in this bucket was already notified by an earlier call.
			if (claimed.length === 0) continue;

			const claimedExecutions = new Set(claimed.map(row => row.checkExecutionId));
			const toReport = failures.filter(failure => claimedExecutions.has(failure.checkExecutionId));

			const { subject, text } = this.describe(event, rule, toReport);
			const sent = await SMTPMailService.sendMail(rule.recipients, subject, text);

			if (sent) {
				emailsSent += 1;
				notifiedChecks += toReport.length;
			}

			await db
				.update(emailNotificationLog)
				.set({ sent, error: sent ? null : "SMTP send failed or not configured" })
				.where(
					inArray(
						emailNotificationLog.id,
						claimed.map(row => row.id),
					),
				);
		}

		return { matchedRules: buckets.size, emailsSent, notifiedChecks };
	}

	/** Sends one message to prove the SMTP settings work, without a real check. */
	async sendTestEmail(to: string) {
		if (!SMTPMailService.isConfigured()) {
			throw new ErrorResponse(
				"SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SENDER_MAIL.",
				400,
			);
		}

		const sent = await SMTPMailService.sendMail(
			to,
			"Data Cortex test email",
			"If you are reading this, Data Cortex can send mail.\n\nThis was sent from the Email Notifications page.",
		);

		if (!sent) {
			throw new ErrorResponse("SMTP is configured but the message could not be sent. Check the server log.", 502);
		}

		return { sent: true, to };
	}
}
