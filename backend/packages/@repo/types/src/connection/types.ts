import type { SupportedDatabasesEnum, SupportedFileStorageEnum } from "../common/types.js";

/**
 * What the stored `secret` actually is.
 *
 * These are the engine's own values, not new ones: dc-engine already selects
 * Snowflake auth from `additional_params.auth_method` with exactly "key_pair" or
 * "password" (Data_Code/connectors/db/connectors.py). Using the same two strings
 * means the engine needs no translation layer.
 */
export type SecretType = "password" | "key_pair";

type PostgresAdditionalParam = {
	ssl?: boolean;
};

type SnowflakeAdditionalParam = {
	account?: string;
	warehouse?: string;
	role?: string;
	/** Only for secretType "private_key", and only when the key is encrypted. */
	privateKeyPassphrase?: string;
	/** Mirrors the connection's secretType. This is where the engine reads it. */
	auth_method?: SecretType;
};

export type ConnectionAdditionalParam = PostgresAdditionalParam & SnowflakeAdditionalParam;

export type AddConnectionPayload = {
	connectionName: string;
	databaseType: SupportedDatabasesEnum;
	host: string;
	port: number;
	databaseName: string;
	username: string;
	/** The credential itself: a password or a private key. Plaintext in transit,
	 * encrypted at rest. */
	secret: string;
	secretType?: SecretType;
	dbSchema: string;
	additionalParams?: ConnectionAdditionalParam;
};

export type UpdateConnectionPayload = Partial<AddConnectionPayload>;

export type TestConnectionPayload = {
	/** Which engine to talk to. Absent means PostgreSQL, as before this field existed. */
	databaseType?: SupportedDatabasesEnum;
	host: string;
	port: number;
	databaseName: string;
	username: string;
	secret: string;
	secretType?: SecretType;
	dbSchema: string;
	// nullable: additional_params is a nullable jsonb column, so rows read from
	// the database carry null here, not undefined.
	additionalParams?: ConnectionAdditionalParam | null;
};

export type TestConnectionResponse = {
	isValid: boolean;
	error: any | null;
	errorMessage: string | null;
};

export type GetTablesResponse = {
	tables: string[];
	error: any;
	errorMessage: string | null;
};

export type AddFileConnectionPayload = {
	connectionName: string;
	storageType: SupportedFileStorageEnum;
	bucketOrContainerName: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	// endpointUrl?: string;
	additionalParams?: ConnectionAdditionalParam;
};

export type UpdateFileConnectionPayload = Partial<AddFileConnectionPayload>;

export type GetColumnsResponse = {
	columns: {
		columnName: string;
		dataType: string;
		isNullable: boolean;
	}[];
	error: any;
	errorMessage: string | null;
};
