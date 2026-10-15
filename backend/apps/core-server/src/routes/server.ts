import cookieParser from "cookie-parser";
import express, { json, urlencoded } from "express";
import fileUpload from "express-fileupload";

import { corsMiddleware } from "@/middlewares/cors-middleware.js";
import { errorMiddleware } from "@/middlewares/error-middleware.js";
import { loggerMiddleware } from "@/middlewares/logger-middleware.js";
import { notFoundMiddleware } from "@/middlewares/notfound-middleware.js";

import { AuthMiddlewares } from "@/middlewares/auth-middleware.js";
import { createAnalyseWorkstreamRouter } from "./analyse-workstream/router.js";
import { createAuthRouter } from "./auth/router.js";
import { createDbConnectionsRouter } from "./connections/db/router.js";
import { createFileStorageConnectionsRouter } from "./connections/fileStorage/router.js";
import { createDashboardRouter } from "./dashboard/router.js";
import { createDbExplorerRouter } from "./db-explorer/routes.js";
import { createFilesRouter } from "./files/router.js";
import { createJobsRouter } from "./jobs/router.js";
import { createLibrariesRouter } from "./libraries/router.js";
import { createNotificationsRouter } from "./notifications/router.js";
import { createQcConfigurationRouter } from "./qc-configuration/router.js";
import { createReportsRouter } from "./reports/router.js";
import { createRunCheckRouter } from "./qc-configuration/run/router.js";
import { createServiceUsersRouter } from "./service-users/router.js";
import { createUserRouter } from "./user/router.js";
const app = express();

app.use(loggerMiddleware);
app.use(cookieParser());
app.use(urlencoded({ extended: true }));
app.use(json());
app.use(fileUpload());
app.use(corsMiddleware);

app.use("/api/auth", createAuthRouter());
app.use("/api/user", AuthMiddlewares.validateAccessToken, createUserRouter());
app.use("/api/db/connections", AuthMiddlewares.validateAccessToken, createDbConnectionsRouter());
app.use("/api/file-storage/connections", AuthMiddlewares.validateAccessToken, createFileStorageConnectionsRouter());
// Mounted first, and separately: this is the one route a service user's API key is
// accepted on. Everything else under /api/qc-configuration is access-token only.
app.use("/api/qc-configuration/run", AuthMiddlewares.validateRunAccess, createRunCheckRouter());
app.use("/api/qc-configuration", AuthMiddlewares.validateAccessToken, createQcConfigurationRouter());
app.use("/api/libraries", AuthMiddlewares.validateAccessToken, createLibrariesRouter());
app.use("/api/notifications", createNotificationsRouter());
app.use("/api/db-explorer", AuthMiddlewares.validateAccessToken, createDbExplorerRouter());
app.use("/api/reports", AuthMiddlewares.validateAccessToken, createReportsRouter());
app.use("/api/dashboard", AuthMiddlewares.validateAccessToken, createDashboardRouter());
// Previously mounted with no authentication at all, so workstream data was readable
// by anyone who could reach the server.
app.use("/api/analyse-workstreams", AuthMiddlewares.validateAccessToken, createAnalyseWorkstreamRouter());
app.use("/files", AuthMiddlewares.validateAccessToken, createFilesRouter());
app.use("/api/service-users", AuthMiddlewares.validateAccessToken, createServiceUsersRouter());
// Token or API key: a service that starts a run polls the same endpoint for its outcome.
app.use("/api/jobs", AuthMiddlewares.validateRunAccess, createJobsRouter());

app.get("/test", (_req, res) => {
	res.statusCode = 200;
	res.json("OK");
	return;
});

// app.use(serveStatic());
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
