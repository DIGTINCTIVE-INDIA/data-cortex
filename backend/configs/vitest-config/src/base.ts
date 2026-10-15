import { defineConfig } from "vitest/config";
import type { InlineConfig } from "vitest/node";

export const baseVitestConfig = (options: InlineConfig = {}) =>
	defineConfig({
		test: {
			passWithNoTests: true,
			silent: true,
			globals: true,
			include: ["src/**/*.{test,spec}.{ts,tsx}"],
			exclude: ["**/node_modules/**", "**/dist/**"],
			coverage:
				process.env.COVERAGE_ENABLED === "true"
					? {
							enabled: true,
							provider: "v8",
							...options.coverage,
						}
					: { enabled: false },

			...options,
		},
	});
