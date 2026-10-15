import { ENV } from "@repo/env";
import { defineConfig } from "drizzle-kit";
export default defineConfig({
	out: "./drizzle",
	schema: "./src/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: ENV.DATABASE_URL,
	},
});
