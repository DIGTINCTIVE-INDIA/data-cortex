import { Router } from "express";
import { createCustomSqlCheckRouter } from "./custom-sql/router.js";
import { createDBCheckRouter } from "./db/router.js";
import { createFileStorageCheckRouter } from "./file-storage/router.js";

export function createQcConfigurationRouter() {
	const router = Router();

	router.use("/db", createDBCheckRouter());
	router.use("/file-storage", createFileStorageCheckRouter());
	router.use("/custom-sql", createCustomSqlCheckRouter());

	return router;
}
