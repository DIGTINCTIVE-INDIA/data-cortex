import { and, count, db, desc, eq, qcTagsLibrary, sql } from "@repo/db";
import type { PaginationType } from "@repo/lib";
import { Paginator } from "@repo/lib";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { AddQcTagPayload, QCTagType, UpdateQcTagPayload } from "@repo/types";

export class LibrariesRepo {
	async addQcTag(payload: AddQcTagPayload, userId: string) {
		const existing = await db.query.qcTagsLibrary.findFirst({
			where: and(eq(qcTagsLibrary.tagType, payload.type), eq(qcTagsLibrary.tagTitle, payload.title), eq(qcTagsLibrary.enabled, true)),
		});

		if (existing) {
			throw new ErrorResponse("QC tag already exists", 400);
		}

		const [item] = await db
			.insert(qcTagsLibrary)
			.values({
				tagType: payload.type,
				tagTitle: payload.title,
				description: payload.description ?? null,
				userId: userId,
			})
			.returning();

		return item;
	}

	async updateQcTag(id: number, payload: UpdateQcTagPayload) {
		const existing = await db.query.qcTagsLibrary.findFirst({
			where: and(eq(qcTagsLibrary.id, id), eq(qcTagsLibrary.enabled, true)),
		});

		if (!existing) {
			throw new ErrorResponse("QC tag not found", 404);
		}

		if (payload.title || payload.type) {
			const duplicate = await db.query.qcTagsLibrary.findFirst({
				where: and(
					eq(qcTagsLibrary.tagType, payload.type ?? existing.tagType),
					eq(qcTagsLibrary.tagTitle, payload.title ?? existing.tagTitle),
					eq(qcTagsLibrary.enabled, true),
				),
			});

			if (duplicate && duplicate.id !== id) {
				throw new ErrorResponse("QC tag already exists", 400);
			}
		}

		const [item] = await db
			.update(qcTagsLibrary)
			.set({
				...(payload.type !== undefined && { tagType: payload.type }),
				...(payload.title !== undefined && { tagTitle: payload.title }),
				...(payload.description !== undefined && {
					description: payload.description ?? null,
				}),

				updatedAt: new Date(),
			})
			.where(eq(qcTagsLibrary.id, id))
			.returning();

		return item;
	}

	/**
	 * Enables or disables the tag.
	 */

	/**
	 * Everything that points at a tag, as "<id> <name>" labels.
	 *
	 * Checks (all three config tables, scalar label columns plus the downstream array) and
	 * email rules. Results are deliberately NOT counted: they are history, and a tag
	 * should be retirable once nothing live uses it.
	 */
	private async findReferences(tagId: number): Promise<string[]> {
		const rows = await db.execute(sql`
			SELECT config_id AS ref, config_name AS name FROM db_based_checks_config
			 WHERE check_category = ${tagId} OR workstream = ${tagId} OR data_source = ${tagId} OR ${tagId} = ANY(impacted_downstream)
			UNION ALL
			SELECT config_id, config_name FROM file_based_checks_config
			 WHERE check_category = ${tagId} OR workstream = ${tagId} OR data_source = ${tagId} OR ${tagId} = ANY(impacted_downstream)
			UNION ALL
			SELECT check_id, check_name FROM custom_business_checks_config
			 WHERE check_category = ${tagId} OR workstream = ${tagId} OR data_source = ${tagId} OR ${tagId} = ANY(impacted_downstream)
			UNION ALL
			SELECT DISTINCT r.rule_id, r.name FROM email_notification_rule_targets t
			  JOIN email_notification_rules r ON r.rule_id = t.rule_id
			 WHERE t.downstream_id = ${tagId}
		`);

		const list = ((rows as unknown as { rows?: { ref: string; name: string }[] }).rows ?? (rows as unknown as { ref: string; name: string }[]));

		return list.map(row => `${row.ref} (${row.name})`);
	}

	async toggleQcTag(id: number) {
		const existing = await db.query.qcTagsLibrary.findFirst({
			where: eq(qcTagsLibrary.id, id),
		});

		if (!existing) {
			throw new ErrorResponse("QC tag not found", 404);
		}

		// Disabling a tag is how one is removed. Refuse while anything still uses it: a check
		// pointing at a disabled tag keeps running with a label nobody can see or pick.
		// Enabling is always allowed.
		if (existing.enabled) {
			const used = await this.findReferences(existing.id);

			if (used.length > 0) {
				const shown = used.slice(0, 5).join(", ");
				const more = used.length > 5 ? ` and ${used.length - 5} more` : "";

				throw new ErrorResponse(
					`"${existing.tagTitle}" is still used by ${shown}${more}. Remove it from ${used.length === 1 ? "that" : "those"} first, then try again.`,
					409,
				);
			}
		}

		const [item] = await db
			.update(qcTagsLibrary)
			.set({
				enabled: !existing.enabled,
				deactivatedAt: existing.enabled ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(qcTagsLibrary.id, id))
			.returning();

		return item;
	}

	/**
	 * Returns all enabled QC tags grouped by type.
	 * Useful for dropdowns.
	 */
	async getAllQcTags() {
		const limit = 30;

		const [categories, workstreams, impactedDownstreams, dataSources] = await Promise.all([
			db
				.select()
				.from(qcTagsLibrary)
				.where(and(eq(qcTagsLibrary.tagType, "category"), eq(qcTagsLibrary.enabled, true)))
				.orderBy(desc(qcTagsLibrary.createdAt))
				.limit(limit),

			db
				.select()
				.from(qcTagsLibrary)
				.where(and(eq(qcTagsLibrary.tagType, "workstream"), eq(qcTagsLibrary.enabled, true)))
				.orderBy(desc(qcTagsLibrary.createdAt))
				.limit(limit),

			db
				.select()
				.from(qcTagsLibrary)
				.where(and(eq(qcTagsLibrary.tagType, "impacted_downstream"), eq(qcTagsLibrary.enabled, true)))
				.orderBy(desc(qcTagsLibrary.createdAt))
				.limit(limit),

			db
				.select()
				.from(qcTagsLibrary)
				.where(and(eq(qcTagsLibrary.tagType, "data_source"), eq(qcTagsLibrary.enabled, true)))
				.orderBy(desc(qcTagsLibrary.createdAt))
				.limit(limit),
		]);

		return {
			category: categories,
			workstream: workstreams,
			impactedDownstream: impactedDownstreams,
			dataSource: dataSources,
		};
	}

	/**
	 * Returns paginated QC tags for a particular tag type.
	 */
	async getQcTagsByType(type: QCTagType, { limit = 20, page = 1 }: PaginationType) {
		const offset = (page - 1) * limit;

		const [{ total }] = await db.select({ total: count() }).from(qcTagsLibrary).where(eq(qcTagsLibrary.tagType, type));

		const items = await db
			.select()
			.from(qcTagsLibrary)
			.where(eq(qcTagsLibrary.tagType, type))
			.orderBy(desc(qcTagsLibrary.createdAt))
			.limit(limit)
			.offset(offset);

		return Paginator.paginate(
			{
				limit: limit.toString(),
				page: page.toString(),
			},
			items,
			total,
		);
	}

	/**
	 * One row per data source, for the DQ Checks Library board.
	 *
	 * Aggregates the three config tables plus results. It reads data_source straight
	 * off results rather than joining back through the configs, because results
	 * already carries the qc_tags id -- and a result must keep reporting against the
	 * source it ran under even if the config is later retagged.
	 *
	 * Workstreams come back as a list: a source is not tied to one workstream, and
	 * the board filters by membership.
	 */
	async getDqCheckSources() {
		const rows = await db.execute(sql`
			WITH cfg AS (
				SELECT data_source, workstream, enabled FROM db_based_checks_config
				UNION ALL
				SELECT data_source, workstream, enabled FROM file_based_checks_config
				UNION ALL
				SELECT data_source, workstream, enabled FROM custom_business_checks_config
			),
			cfg_agg AS (
				SELECT
					data_source,
					COUNT(*)::int AS total,
					COUNT(*) FILTER (WHERE enabled)::int AS active,
					ARRAY_AGG(DISTINCT workstream) AS workstream_ids
				FROM cfg
				GROUP BY data_source
			),
			res_agg AS (
				SELECT
					data_source,
					COUNT(*) FILTER (
						WHERE check_status = 'failed' AND COALESCE(issue_status, 'open') = 'open'
					)::int AS failed,
					MAX(job_timestamp) AS last_run
				FROM results
				GROUP BY data_source
			)
			SELECT
				t.id,
				t.title                                   AS name,
				COALESCE(c.total, 0)                      AS checks,
				COALESCE(c.active, 0)                     AS active,
				COALESCE(r.failed, 0)                     AS failed,
				r.last_run                                AS "lastRun",
				COALESCE(
					(SELECT ARRAY_AGG(w.title ORDER BY w.title)
					 FROM qc_tags w
					 WHERE w.id = ANY(c.workstream_ids)),
					ARRAY[]::varchar[]
				)                                         AS workstreams
			FROM qc_tags t
			LEFT JOIN cfg_agg c ON c.data_source = t.id
			LEFT JOIN res_agg r ON r.data_source = t.id
			WHERE t.type = 'data_source' AND t.enabled = true
			ORDER BY t.title
		`);

		return (rows as unknown as { rows: Record<string, unknown>[] }).rows ?? rows;
	}
}
