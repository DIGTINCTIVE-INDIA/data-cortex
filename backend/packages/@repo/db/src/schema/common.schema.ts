import { integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const idSequencesConfig = pgTable("id_sequences", {
	id: uuid("id").primaryKey().defaultRandom(),
	tableName: varchar("table_name", { length: 250 }).notNull().unique(),
	prefix: varchar("prefix", { length: 10 }).notNull(),
	value: integer("value").notNull().default(0),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
