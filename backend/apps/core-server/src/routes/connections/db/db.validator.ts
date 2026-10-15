import { SupportedDatabasesEnum } from "@repo/types";
import vine from "@vinejs/vine";

const databaseTypes = ["postgres", "mysql", "snowflake"] satisfies SupportedDatabasesEnum[];

// Same two values dc-engine accepts for additional_params.auth_method.
const secretTypes = ["password", "key_pair"] as const;

const databaseConnectionFields = {
	connectionName: vine.string().minLength(3).maxLength(100),
	databaseType: vine.enum(databaseTypes),
	host: vine.string().minLength(1),
	port: vine.number().min(1).max(65535),
	databaseName: vine.string().minLength(1),
	username: vine.string().minLength(1),
	/**
	 * The credential. A password, or a PEM private key for Snowflake key-pair
	 * auth -- `secretType` says which.
	 */
	secret: vine.string().minLength(1),
	secretType: vine.enum(secretTypes).optional(),
	dbSchema: vine.string().minLength(1),
	/**
	 * VineJS strips properties that are not declared here, so every key the
	 * client sends has to be listed. The Snowflake fields were missing, which
	 * is why account/warehouse/role never reached the database -- and why a
	 * Snowflake connection failed validation outright, since `ssl` was declared
	 * required and the Snowflake payload does not send it.
	 */
	additionalParams: vine
		.object({
			ssl: vine.boolean().optional(),
			account: vine.string().trim().optional(),
			warehouse: vine.string().trim().optional(),
			role: vine.string().trim().optional(),
			privateKeyPassphrase: vine.string().optional(),
			auth_method: vine.enum(secretTypes).optional(),
		})
		.optional(),
};

export const addDatabaseConnectionValidator = vine.object(databaseConnectionFields);

export const updateDatabaseConnectionValidator = vine.object({
	connectionName: databaseConnectionFields.connectionName.optional(),
	databaseType: databaseConnectionFields.databaseType.optional(),
	host: databaseConnectionFields.host.optional(),
	port: databaseConnectionFields.port.optional(),
	databaseName: databaseConnectionFields.databaseName.optional(),
	username: databaseConnectionFields.username.optional(),
	secret: databaseConnectionFields.secret.optional(),
	secretType: databaseConnectionFields.secretType,
	dbSchema: databaseConnectionFields.dbSchema.optional(),
	additionalParams: databaseConnectionFields.additionalParams,
});
