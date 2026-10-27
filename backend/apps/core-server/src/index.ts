import { db, sql, warmPool } from "@repo/db";
import { runStartupChecks } from "./startup-checks.js";
import { ENV } from "@repo/env";
import { logger } from "@repo/logger";

import { ServerEvents } from "./events/index.js";
import { checkEngineAtStartup } from "./services/run-dispatcher.js";
import { app } from "./routes/server.js";

const startedAt = Date.now();

const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(2)}s`;

/** Host, port and database name only -- never the user or password. */
const describeDatabase = () => {
	try {
		const url = new URL(ENV.DATABASE_URL);
		return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
	} catch {
		return "(DATABASE_URL could not be parsed)";
	}
};

const describeRedis = () => {
	if (!ENV.REDIS_HOST) return "not configured";
	return `${ENV.REDIS_HOST}:${ENV.REDIS_PORT ?? "6379"}`;
};

const logEnvironment = () => {
	logger.info("--- environment ---------------------------------------------");
	logger.info(`  node          : ${process.version} (${process.platform} ${process.arch}, pid ${process.pid})`);
	logger.info(`  NODE_ENV      : ${ENV.NODE_ENV}`);
	logger.info(`  LOG_LEVEL     : ${ENV.LOG_LEVEL}`);
	logger.info(`  port          : ${ENV.PORT}`);
	logger.info(`  server url    : ${ENV.SERVER_URL}`);
	logger.info(`  client url    : ${ENV.CLIENT_URL}`);
	logger.info(`  cors url      : ${ENV.CORS_URL}`);
	logger.info(`  database      : ${describeDatabase()}`);
	logger.info(`  redis         : ${describeRedis()}`);
	logger.info(`  azure sso     : ${ENV.AZURE_CLIENT_ID ? "configured" : "NOT configured"}`);
	logger.info(`  encryption key: ${ENV.ENCRYPTION_SECRET_KEY ? "present" : "MISSING"}`);
};

/** Non-fatal: the server still serves, but you learn immediately if the DB is unreachable. */
const probeDatabase = async () => {
	logger.info("--- checks --------------------------------------------------");

	try {
		await db.execute(sql`SELECT 1`);
		logger.info(`  database      : reachable (${describeDatabase()})`);

		// Open the rest of the pool now, so the first real request is not the one that
		// waits for a new connection to a database that is a network hop away.
		await warmPool();
		logger.info("  database      : connection pool warmed");

		// Plain-language answers to "is the database set up?", logged and never fatal.
		await runStartupChecks(logger);
	} catch (error) {
		logger.error(`  database      : UNREACHABLE (${describeDatabase()})`);
		logger.error("  the server is running, but every database-backed route will fail");
		logger.error(error);
	}
};

app.listen(ENV.PORT, async () => {
	ServerEvents.emitServerReady();

	logger.info("=============================================================");
	logger.info(`Data Cortex core-server starting on port ${ENV.PORT}`);
	logger.info("=============================================================");

	logEnvironment();
	await probeDatabase();
	await checkEngineAtStartup();

	logger.info("-------------------------------------------------------------");
	logger.info(`Server started on port ${ENV.PORT} — ready in ${elapsed()}`);
	logger.info(`Try: ${ENV.SERVER_URL}/test`);
	logger.info("=============================================================");
});
