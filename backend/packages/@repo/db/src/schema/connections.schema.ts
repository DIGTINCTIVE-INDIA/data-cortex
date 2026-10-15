import { SupportedDatabasesEnum, SupportedFileStorageEnum } from "@repo/types";
import { boolean, integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./user.schema.js";

export const databaseTypeValues = ["mysql", "postgres", "snowflake"] as const satisfies readonly [
	SupportedDatabasesEnum,
	...SupportedDatabasesEnum[],
];

export const fileStorageTypeValues = ["s3"] as const satisfies readonly [
	SupportedFileStorageEnum,
	...SupportedFileStorageEnum[],
];

export const databaseTypeEnum = pgEnum("database_type_enum", databaseTypeValues);

export const fileStorageTypeEnum = pgEnum("file_storage_type_enum", fileStorageTypeValues);
export const databaseConnection = pgTable("database_connection", {
	connectionId: varchar("connection_id").primaryKey(), // EG :- DB_0001
	connectionName: varchar("connection_name").unique().notNull(),
	databaseType: databaseTypeEnum("database_type").notNull(),
	host: varchar("host").notNull(), //Host and Port are nullable in erd
	port: integer("port").notNull(),
	databaseName: varchar("database_name").notNull(),
	username: varchar("username").notNull(),
	/**
	 * Any credential, encrypted. A Postgres/MySQL password, a Snowflake password,
	 * or a Snowflake private key -- `secretType` says which, so nothing has to
	 * guess from the shape of the value.
	 */
	secret: varchar("secret").notNull(),

	// varchar rather than an enum: the vocabulary will grow (IAM role, OAuth) and
	// an enum would need a migration for each addition.
	secretType: varchar("secret_type").notNull().default("password"),
	userId: uuid("user_id") // add active/inactive
		.notNull()
		.references(() => usersTable.id),
	// ssl: boolean().notNull().default(true),
	dbSchema: varchar("db_schema").notNull(),
	additionalParams: jsonb("additional_params").default({}), // It must be json
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});

export const fileConnection = pgTable("file_connection", {
	connectionId: varchar("connection_id").primaryKey(), // EG :- FC_0001
	connectionName: varchar("connection_name").unique().notNull(),
	storageType: fileStorageTypeEnum("storage_type").notNull(),
	bucketOrContainerName: varchar("bucket_or_container_name").notNull(),
	region: varchar("region").notNull(),
	accessKeyId: varchar("access_key_id").notNull(),
	secretAccessKey: varchar("secret_access_key").notNull(), // Encrypted
	// endpointUrl: varchar("endpoint_url"),
	additionalParams: jsonb("additional_params").default({}), //It should be json
	userId: uuid("user_id") // add active/inactive
		.notNull()
		.references(() => usersTable.id),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
	deactivatedAt: timestamp("deactivated_at"),
});
