import vine from "@vinejs/vine";
import { traditionalColumnCheckValidator } from "../traditional-column.validator.js";

export const DB_ID_REGEX = /^DC\d{4,}$/;

export const DB_BASED_CONFIG_ID_REGEX = /^DBC\d{4,}$/;

/**
 * Field rules for an existing db-based check, set in a second step after the
 * config itself is created. Kept off createQcDbCheckValidator deliberately, so
 * nothing already posting to /create-check breaks.
 */
export const setQcDbCheckColumnsValidator = vine.object({
	configId: vine.string().regex(DB_BASED_CONFIG_ID_REGEX),
	columns: vine.array(traditionalColumnCheckValidator).minLength(1),
});

export const createQcDbCheckValidator = vine.object({
	checkName: vine.string().trim().minLength(3),
	workstreamId: vine.number().nonNegative(),
	categoryId: vine.number().nonNegative(),
	dataSourceId: vine.number().nonNegative(),

	impactedDownstreamIds: vine.array(vine.number().nonNegative()).minLength(1),

	sourceDbId: vine.string().regex(DB_ID_REGEX),
	sourceTableName: vine.string(),

	targetConnectionId: vine.string().regex(DB_ID_REGEX),

	targetTableNamePrefix: vine.string(),

	createLanding: vine.boolean(),
	landingTable: vine.string().optional().requiredWhen("createLanding", "=", true),
});

// export const updateQcDbCheckValidator = createQcDbCheckValidator.clone();

export const updateQcDbCheckValidator = vine.object({
	checkName: vine.string().trim().minLength(3).optional(),
	workstreamId: vine.number().nonNegative().optional(),
	categoryId: vine.number().nonNegative().optional(),
	dataSourceId: vine.number().nonNegative().optional(),
	description: vine.string().trim().optional(),

	impactedDownstreamIds: vine.array(vine.number().nonNegative()).minLength(1).optional(),

	sourceDbId: vine.string().regex(DB_ID_REGEX).optional(),
	sourceTableName: vine.string().optional(),

	targetConnectionId: vine.string().regex(DB_ID_REGEX).optional(),

	targetTableNamePrefix: vine.string().optional(),

	createLanding: vine.boolean().optional(),
	landingTable: vine.string().optional(),
});
