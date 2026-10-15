import { fixupPluginRules } from "@eslint/compat";
import { defineConfig } from "eslint/config";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "./base.js";
export const frontendConfig = defineConfig(
	...baseConfig,

	// 1. Frontend Ignores
	{
		ignores: [
			"**/dist/**",
			"**/coverage/**",
			"**/storybook-static/**",
			"**/*.snap",
			"**/*.d.ts",
			"vite.config.ts",
		],
	},

	// 2. Browser/React Globals & Settings
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.serviceworker,
			},
		},
		settings: {
			react: {
				version: "detect",
			},
		},
	},

	// 3. React Recommended Configs
	reactPlugin.configs.flat.recommended,
	reactPlugin.configs.flat["jsx-runtime"],

	// 4. React, Hooks, and Accessibility Rules
	{
		files: ["**/*.tsx", "**/*.jsx"],
		plugins: {
			"react-hooks": fixupPluginRules(reactHooksPlugin as any),
			"jsx-a11y": fixupPluginRules(jsxA11yPlugin),
		},
		rules: {
			...reactHooksPlugin.configs.recommended.rules,
			...jsxA11yPlugin.configs.recommended.rules,

			// --- Naming Convention Override for React ---
			"@typescript-eslint/naming-convention": [
				"warn",
				{ selector: "default", format: ["camelCase"] },
				{ selector: "function", format: ["camelCase", "PascalCase"] },
				{ selector: "import", format: ["camelCase", "PascalCase"] },
				{
					selector: "variable",
					format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
					leadingUnderscore: "allowSingleOrDouble",
					trailingUnderscore: "allowSingleOrDouble",
				},
				{ selector: "typeLike", format: ["PascalCase"] },
				{ selector: "enumMember", format: ["UPPER_CASE", "PascalCase"] },
			],

			// --- React Specifics ---
			"react/prop-types": "off",
			"react/display-name": "warn",
			"react/no-unescaped-entities": "warn",

			// --- React Hooks Specifics ---
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",

			// --- Accessibility (a11y) Specifics ---
			"jsx-a11y/no-autofocus": "warn",
			"jsx-a11y/click-events-have-key-events": "warn",
			"jsx-a11y/no-static-element-interactions": "warn",
			"jsx-a11y/anchor-is-valid": "warn",
			"jsx-a11y/no-onchange": "off",
		},
	}
);
