import type { SourceFileType, SupportedFileStorageEnum } from "@repo/types";
import vine from "@vinejs/vine";
import { DB_ID_REGEX } from "../db/db.validator.js";
import { traditionalColumnCheckValidator } from "../traditional-column.validator.js";

export const FILE_ID_REGEX = /^FC\d{4,}$/;
export const FILE_BASED_CONFIG_ID_REGEX = /^FBC\d{4,}$/;

const fileAvailableOn = ["s3"] as SupportedFileStorageEnum[];
const sourceFileTypes = ["csv", "excel", "json"] as SourceFileType[];
const fileDelimiters = ["comma", "pipe", "tab", "semicolon"] as const;

export const getFileStorageCheckSchemaValidator = vine.object({
	checkName: vine.string().trim().minLength(3),
	workstreamId: vine.number(),
	categoryId: vine.number(),
	dataSourceId: vine.number(),
	description: vine.string().trim().optional(),
	impactedDownstreamIds: vine.array(vine.number()).minLength(1),

	sourceConnectionId: vine.string().regex(FILE_ID_REGEX),
	sourceFileType: vine.enum(sourceFileTypes),
	sourceFileName: vine.string().trim(),
	sourceFilePath: vine.string().trim(),
	sourceFileDelimiter: vine.enum(fileDelimiters).optional(),

	targetConnectionId: vine.string().regex(DB_ID_REGEX),
	targetTableNamePrefix: vine.string().trim(),

	createLanding: vine.boolean(),
	landingTable: vine.string().trim().optional().requiredWhen("createLanding", "=", true),

	fileAvailableOn: vine.enum(fileAvailableOn),
});

// Defined in ../traditional-column.validator.ts and shared with the db-based
// check route; re-exported here so existing importers keep working.
export { traditionalColumnCheckValidator };

export const createFileStorageCheckConfigValidator = vine.object({
	config: getFileStorageCheckSchemaValidator,
	columns: vine.array(traditionalColumnCheckValidator).minLength(1),
});

export const updateFileStorageCheckConfigValidator = getFileStorageCheckSchemaValidator.clone();

// export const updateFileStorageCheckConfigValidator = vine.object({

// 	checkName: vine.string().trim().minLength(3).optional(),
// 	workstreamId: vine.number().optional(),
// 	categoryId: vine.number().optional(),
// 	dataSourceId: vine.number().optional(),
// 	impactedDownstreamIds: vine.array(vine.number()).minLength(1).optional(),

// 	sourceConnectionId: vine.string().regex(FILE_ID_REGEX).optional(),
// 	sourceFileType: vine.enum(sourceFileTypes).optional(),
// 	sourceFileName: vine.string().trim().optional(),
// 	sourceFilePath: vine.string().trim().optional(),

// 	targetConnectionId: vine.string().regex(DB_ID_REGEX).optional(),
// 	targetTableNamePrefix: vine.string().trim().optional(),

// 	createLanding: vine.boolean().optional(),
// 	landingTable: vine.string().trim().optional(),
// });

export const deleteFileStorageCheckConfigValidator = vine.object({
	configId: vine.string().regex(FILE_BASED_CONFIG_ID_REGEX),
});

export const listFileStorageCheckConfigsValidator = vine.object({
	page: vine.number().min(1).optional(),
	limit: vine.number().min(1).max(100).optional(),
});
