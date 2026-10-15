process.env.DOTENV_CONFIG_QUIET = "true";

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Resolve a stable project root:
 * - prefer explicit PROJECT_ROOT env var if set (handy for CI)
 * - else, base on this file's location (safe in ESM)
 * - fallback to process.cwd()
 */
export function projectRoot() {
	if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT);
	try {
		const __filename = fileURLToPath(import.meta.url);
		const thisDir = path.dirname(__filename);
		return path.resolve(thisDir, "../../../../");
	} catch (error) {
		console.error({ error });
		return process.cwd();
	}
}

/**
 * Load .env files with a clear precedence:
 * - test: .env.test (and optional .env.test.local)
 * - otherwise: .env -> .env.local (local should override .env)
 *
 * Behavior: load base first, then local override with override: true so local wins.
 */
export function loadDotenv(opts?: { root?: string }) {
	const root = opts?.root ?? projectRoot();

	if (process.env.NODE_ENV === "test") {
		config({ path: path.join(root, ".env.test") });
		// optional: if you want local test overrides
		config({ path: path.join(root, ".env.test.local"), override: true });
		return;
	}

	// production/dev flow
	config({ path: path.join(process.cwd(), ".env") }); // prod
	// dev env
	config({ path: path.join(root, ".env") });
	// .env.local should override the base (for dev machine secrets)
	config({ path: path.join(root, ".env.local"), override: true });
	// also load .env.${NODE_ENV}.local if you want per-env local overrides:
	if (process.env.NODE_ENV) {
		config({ path: path.join(root, `.env.${process.env.NODE_ENV}.local`), override: true });
	}
}
