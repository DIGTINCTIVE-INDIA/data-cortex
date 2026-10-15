// id-generation.repo.ts

import { eq, idSequencesConfig, sql, type DrizzleTransaction } from "@repo/db";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { CustomIdTablesNamesEnum, UpsertTableConfigPayload } from "@repo/types";

const ID_PREFIX_MAP: Record<CustomIdTablesNamesEnum, string> = {
	database_connection: "DC",
	file_connection: "FC",
	db_based_checks_config: "DBC",
	file_based_checks_config: "FBC",
	custom_business_checks_config: "CB",
	traditional_checks_library: "TC",
	email_notification_rules: "EN",
};

// Flow :-  User fires add db connnection -> transaction starts
// -> first get the nextId and update it in table
// -> then insert the obejct with nextId in db table -> transaction completed
export class IdGenerationRepo {
	/**
	 * Insert row if not exists , only required one time after cleanup db or new app init.
	 * This must exists before generating `getNextId()` !
	 */
	async addTableConfig(payload: UpsertTableConfigPayload, tx: DrizzleTransaction) {
		const existing = await tx.query.idSequencesConfig.findFirst({
			where: eq(idSequencesConfig.tableName, payload.tableName),
		});

		if (!existing) {
			console.log("Config added successfully for :- ", payload.tableName);
			await tx.insert(idSequencesConfig).values({
				tableName: payload.tableName,
				prefix: payload.prefix,
				value: 0,
			});
			return;
		}

		console.log("Config already added for :- ", payload.tableName);

		return true;
	}

	async getTableConfig(tableName: CustomIdTablesNamesEnum, tx: DrizzleTransaction) {
		const tableConfig = await tx.query.idSequencesConfig.findFirst({
			where: eq(idSequencesConfig.tableName, tableName),
		});
		if (!tableConfig) {
			throw new ErrorResponse(`No id config found for this table : ${tableName}`, 400);
		}
		return tableConfig;
	}

	/**
	 * Generates the next unique ID for a given table (e.g. DBC0001, DBC0002).
	 *
	 * This function uses a database transaction with a row-level lock (`FOR UPDATE`)
	 * on the `id_sequences` table to ensure safe concurrent access.
	 *
	 * Why locking is required:
	 * - Multiple requests may try to generate an ID at the same time.
	 * - Without locking, they could read the same counter value and produce duplicate IDs.
	 * - `FOR UPDATE` ensures only one transaction can read & update the counter at a time.
	 *
	 * Behavior:
	 * - If no sequence row exists for the table, it initializes one.
	 * - Otherwise, it increments the counter and returns the next formatted ID.
	 *
	 * Use case:
	 * - Required for generating human-readable, sequential IDs with prefixes
	 *   (e.g. DB connections → DC0001, configs → DBC0001).
	 *
	 * ⚠️ Must always be called inside a transaction to guarantee correctness.
	 */
	async getNextId(tableName: CustomIdTablesNamesEnum, tx: DrizzleTransaction): Promise<string> {
		type IdSequenceRow = typeof idSequencesConfig.$inferSelect;

		const prefix = ID_PREFIX_MAP[tableName];

		if (!prefix) {
			throw new ErrorResponse(`No ID prefix configured for table: ${tableName}`, 400);
		}

		let result = await tx.execute(
			sql<IdSequenceRow[]>`
			SELECT *
			FROM id_sequences
			WHERE table_name = ${tableName}
			FOR UPDATE
		`,
		);

		let row = result.rows[0] as IdSequenceRow | undefined;

		if (!row) {
			const inserted = await tx
				.insert(idSequencesConfig)
				.values({
					tableName,
					prefix,
					value: 0,
				})
				.returning();

			row = inserted[0];
		}

		const nextValue = row.value + 1;

		await tx
			.update(idSequencesConfig)
			.set({
				value: nextValue,
				updatedAt: new Date(),
			})
			.where(eq(idSequencesConfig.tableName, tableName));

		return this.formatId(row.prefix, nextValue);
	}

	/**
	 * Format → DBC0001
	 */
	private formatId(prefix: string, value: number): string {
		return `${prefix}${String(value).padStart(4, "0")}`;
	}
}
