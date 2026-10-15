export type CustomIdTablesNamesEnum =
	| "database_connection"
	| "file_connection"
	| "db_based_checks_config"
	| "file_based_checks_config"
	| "custom_business_checks_config"
	| "traditional_checks_library"
	| "email_notification_rules";

export type CustomIdTablePrefixes = "DC" | "FC" | "DBC" | "FBC" | "CB" | "TC" | "EN";

export type UpsertTableConfigPayload = {
	tableName: CustomIdTablesNamesEnum;
	prefix: CustomIdTablePrefixes;
};

export type SupportedDatabasesEnum = "postgres" | "snowflake" | "mysql";
// S3 is the only object store the engine can actually read. Azure, GCS and
// local storage were offered in the UI but no connector or config shape ever
// backed them, so every such connection failed at run time.
export type SupportedFileStorageEnum = "s3";
