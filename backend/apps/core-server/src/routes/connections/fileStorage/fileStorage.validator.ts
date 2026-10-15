import { SupportedFileStorageEnum } from "@repo/types";
import vine from "@vinejs/vine";

const fileStorageTypes = ["s3"] satisfies SupportedFileStorageEnum[];

export const addFileConnectionValidator = vine.object({
	connectionName: vine.string().minLength(3).maxLength(100),

	storageType: vine.enum(fileStorageTypes),

	bucketOrContainerName: vine.string().minLength(3),

	region: vine.string().minLength(3),

	accessKeyId: vine.string().minLength(10),

	secretAccessKey: vine.string().minLength(10),

	additionalParams: vine
		.object({
			ssl: vine.boolean(),
		})
		.optional(),
});

export const updateFileConnectionValidator = vine.object({
	connectionName: vine.string().minLength(3).maxLength(100).optional(),

	storageType: vine.enum(fileStorageTypes).optional(),

	bucketOrContainerName: vine.string().minLength(3).optional(),

	region: vine.string().minLength(3).optional(),

	accessKeyId: vine.string().minLength(10).optional(),

	secretAccessKey: vine.string().minLength(10).optional(),

	additionalParams: vine
		.object({
			ssl: vine.boolean(),
		})
		.optional(),
});
