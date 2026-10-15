import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { databaseConnection, fileConnection } from "./connections.schema.js";
import { qcTagsLibrary } from "./libraries.schema.js";
import { usersTable } from "./user.schema.js";

export const dbBasedChecksConfig = pgTable("db_based_checks_config", {
	configId: varchar("config_id").primaryKey(), // EG. DBC_0001
	configName: varchar("config_name").unique().notNull(),
	checkCategory: integer("check_category")
		.notNull()
		.references(() => qcTagsLibrary.id),
	workstream: integer("workstream")
		.notNull()
		.references(() => qcTagsLibrary.id),
	impactedDownstream: integer("impacted_downstream").array().notNull(),
	dataSource: integer("data_source")
		.notNull()
		.references(() => qcTagsLibrary.id),
	sourceConnectionId: varchar("source_connection_id")
		.notNull()
		.references(() => databaseConnection.connectionId),
	sourceTableName: varchar("source_table_name").notNull(),
	targetConnectionId: varchar("target_connection_id")
		.notNull()
		.references(() => databaseConnection.connectionId),
	targetTablePrefix: varchar("target_table_prefix").notNull(),
	landingTable: boolean("landing_table").notNull().default(false),
	landingTableName: varchar("landing_table_name"), //[note: 'Optional; Mandatory if Landing Table is enabled']
	enabled: boolean("enabled").notNull().default(true), // Soft Delete
	userId: uuid("user_id")
		.notNull()
		.references(() => usersTable.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});

export const sourceFileTypesEnum = pgEnum("source_file_type", ["excel", "csv", "json"]); // csv, parquet, xls, xlsx

export const fileDelimiterEnum = pgEnum("source_file_delimiter", ["comma", "pipe", "tab", "semicolon"]);

export const fileBasedChecksConfig = pgTable("file_based_checks_config", {
	configId: varchar("config_id").primaryKey(), // EG. FBC_0001
	configName: varchar("config_name").unique().notNull(),
	checkCategory: integer("check_category")
		.notNull()
		.references(() => qcTagsLibrary.id),
	workstream: integer("workstream")
		.notNull()
		.references(() => qcTagsLibrary.id),
	impactedDownstream: integer("impacted_downstream").array().notNull(),
	dataSource: integer("data_source")
		.notNull()
		.references(() => qcTagsLibrary.id),
	sourceConnectionId: varchar("source_connection_id")
		.notNull()
		.references(() => fileConnection.connectionId),
	sourceFileType: sourceFileTypesEnum("source_file_type").notNull().default("csv"), // CSV, Excel, JSON - AWS-s3 only.
	sourceFileDelimiter: fileDelimiterEnum("source_file_delimiter"),
	sourceFileName: varchar("source_file_name").notNull(),
	sourceFilePath: varchar("source_file_path").default("/"),
	targetConnectionId: varchar("target_connection_id")
		.notNull()
		.references(() => databaseConnection.connectionId), // it only be database.
	targetTablePrefix: varchar("target_table_prefix").notNull(),
	landingTable: boolean("landing_table").notNull().default(false),
	landingTableName: varchar("landing_table_name"),
	enabled: boolean("enabled").notNull().default(true),
	userId: uuid("user_id")
		.notNull()
		.references(() => usersTable.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});

export const checkCriticality = pgEnum("check_criticality", ["low", "medium", "high"]);

/**
 * Custom Sql Check - QC configuration.
 */
export const customBusinessChecksConfig = pgTable("custom_business_checks_config", {
	checkId: varchar("check_id").primaryKey(), // EG.CB_0001
	checkName: varchar("check_name").unique().notNull(),
	checkDescription: text("check_description"),
	checkCategory: integer("check_category")
		.notNull()
		.references(() => qcTagsLibrary.id),
	workstream: integer("workstream")
		.notNull()
		.references(() => qcTagsLibrary.id),
	impactedDownstream: integer("impacted_downstream").array().notNull(),
	dataSource: integer("data_source")
		.notNull()
		.references(() => qcTagsLibrary.id),
	sourceConnectionId: varchar("source_connection_id")
		.notNull()
		.references(() => databaseConnection.connectionId),
	targetConnectionId: varchar("target_connection_id")
		.notNull()
		.references(() => databaseConnection.connectionId),
	targetTablePrefix: varchar("target_table_prefix").notNull(),
	sqlQuery: text("sql_query").notNull(),
	criticality: checkCriticality().notNull(),
	errorMessage: varchar("error_message").notNull(),
	enabled: boolean("enabled").notNull().default(true),
	userId: uuid("user_id")
		.notNull()
		.references(() => usersTable.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});

export const dataTypeEnum = pgEnum("tcd_data_type", ["string", "integer", "float", "date", "datetime", "boolean", "varchar"]);
// this is after the creatiion of qc config of file based object.
export const traditionalConfigDetails = pgTable("traditional_config_details", {
	tcReqId: serial("tc_req_id").primaryKey(),
	// Intentionally NO foreign key. Field rules belong to BOTH db_based_checks_config
	// and file_based_checks_config, and PostgreSQL cannot point one column at two
	// parent tables. The prefix identifies the parent -- FBC#### is file-based,
	// DBC#### is db-based -- and each repo verifies the parent row exists before
	// inserting. Do not re-add .references(): it locks this table to file-based
	// configs and makes field rules impossible for DB checks.
	configId: varchar("config_id").notNull(),
	field: varchar("field").notNull(), // this is column_name on ui
	columnOrder: integer("column_order").notNull(),
	dataType: dataTypeEnum("column_datatype").notNull(),
	primaryKeyCheck: boolean("primary_key_check").notNull(),
	primaryKeyCheckCriticality: checkCriticality("primary_key_check_criticality"),
	nullCheck: boolean("null_check").notNull(),
	nullCheckCriticality: checkCriticality("null_check_criticality"),
	duplicateCheck: boolean("duplicate_check").notNull(),
	duplicateCheckCriticality: checkCriticality("duplicate_check_criticality"),
	lengthCheck: boolean("length_check").notNull(),
	expectedLength: integer("expected_length"),
	lengthCheckCriticality: checkCriticality("length_check_criticality"),
	formatCheck: boolean("format_check").notNull(),
	formatRegex: varchar("format_regex"),
	formatCheckCriticality: checkCriticality("format_check_criticality"),
	lovCheck: boolean("lov_check").notNull(),
	lovs: text("lovs"),
	lovCheckCriticality: checkCriticality("lov_check_criticality"),
	riCheck: boolean("ri_check").notNull(),
	riConnectionId: varchar("ri_connection_id").references(() => databaseConnection.connectionId),
	riReferenceTable: varchar("ri_reference_table"),
	riFieldName: varchar("ri_field_name"),
	riCheckCriticality: checkCriticality("ri_check_criticality"),

	//needs to be verified
	enabled: boolean("enabled").notNull().default(true),
	userId: uuid("user_id")
		.notNull()
		.references(() => usersTable.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});
