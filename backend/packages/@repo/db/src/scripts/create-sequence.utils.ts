// scripts/createSequences.ts
import { sql } from "drizzle-orm";
import { db } from "../index.js";

async function main() {
	await db.execute(sql`
    
  `);

	console.log("Sequences ensured ✅");
}

main();

// database_connection - DB001
// file_connection - FC001
// db_based_checks_config - DBC001
// file_based_checks_config - FBC001
// custom_business_checks_config - CB001
// traditional_checks_library - TC001

// db.transaction(async (tx) => {
// 	idGenerationRepo.addTableConfig({ prefix: "DC", tableName: "database_connection" }, tx);
// 	idGenerationRepo.addTableConfig({ prefix: "FC", tableName: "file_connection" }, tx);
// 	idGenerationRepo.addTableConfig({ prefix: "DBC", tableName: "db_based_checks_config" }, tx);
// 	idGenerationRepo.addTableConfig({ prefix: "FBC", tableName: "file_based_checks_config" }, tx);
// 	idGenerationRepo.addTableConfig({ prefix: "CB", tableName: "custom_business_checks_config" }, tx);
// 	idGenerationRepo.addTableConfig({ prefix: "TC", tableName: "traditional_checks_library" }, tx);
// });
