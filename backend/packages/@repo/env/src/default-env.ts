import z from "zod";

import { defineEnv } from "./define-env.js";

export const ENV = defineEnv({
	NODE_ENV: z.enum(["dev", "prod", "uat", "staging"]).default("prod"),
	CLIENT_URL: z.string().optional().default("http://localhost:5173"),
	SERVER_URL: z.string().optional().default("http://localhost:3000"),
	CORS_URL: z.string().optional().default("http://localhost:3000"),
	PORT: z.string().optional().default("3000"),
	LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("debug"),
	DATABASE_URL: z.string(),
	AZURE_CLIENT_ID: z.string(),
	TENANT_ID: z.string(),
	AZURE_CLIENT_SECRET: z.string(),
	AZURE_SSO_REDIRECT_URI: z.string(),
	AZURE_AUTHORITY_URL: z.string(),
	REDIS_HOST: z.string().optional(),
	REDIS_PORT: z.string().optional(),
	REDIS_USERNAME: z.string().optional(),
	REDIS_PASSWORD: z.string().optional(),
	ENCRYPTION_SECRET_KEY: z.string(),
});
