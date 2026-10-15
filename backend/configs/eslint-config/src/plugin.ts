import type { ESLint } from "eslint";
import { rules } from "./rules/index.js";

const plugin = {
	configs: {},
	// @ts-expect-error Rules type does not match for typescript-eslint and eslint
	rules: rules as ESLint.Plugin["rules"],
} satisfies ESLint.Plugin;
export const localRulesPlugin = {
	...plugin,
	configs: {
		recommended: {
			plugins: {
				"local-rules": plugin,
			},
			rules: {
				"local-rules/no-uncaught-json-parse": "error",
				"local-rules/no-json-parse-json-stringify": "error",
				"local-rules/no-interpolation-in-regular-string": "error",
				"local-rules/no-unused-param-in-catch-clause": "error",
				"local-rules/no-useless-catch-throw": "error",
				"local-rules/no-internal-package-import": "error",
			},
		},
	},
} satisfies ESLint.Plugin;
