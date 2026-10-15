import { fixupPluginRules } from "@eslint/compat";
import js from "@eslint/js";
import stylisticPlugin from "@stylistic/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importPlugin from "eslint-plugin-import-x";
import lodashPlugin from "eslint-plugin-lodash";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import { localRulesPlugin } from "../plugin.js";

export const baseConfig = defineConfig(
	// 1. Global Ignores
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.next/**",
			"eslint.config.ts",
			"tsup.config.ts",
			"jest.config.js",
			"cypress.config.js",
			"vite.config.ts",
			"vitest.config.ts",
			"tsdown.config.ts",
		],
	},

	// 2. Base Configurations
	js.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	importPlugin.flatConfigs.recommended as any,
	importPlugin.flatConfigs.typescript as any,

	// 3. Main Configuration
	{
		plugins: {
			"unused-imports": fixupPluginRules(unusedImportsPlugin),
			"react-hooks": fixupPluginRules(reactHooksPlugin as any),
			lodash: fixupPluginRules(lodashPlugin),
			"@stylistic": stylisticPlugin as any,
			unicorn: unicornPlugin,
			react: reactPlugin,
		},
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2021,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		settings: {
			"import-x/resolver-next": [createTypeScriptImportResolver()],
			react: {
				version: "detect",
			},
		},
		rules: {
			// Core Rules
			"no-void": ["error", { allowAsStatement: true }],
			"no-constant-binary-expression": "error",
			"no-console": ["warn", { allow: ["warn", "error"] }],
			eqeqeq: "warn",
			"object-shorthand": "warn",
			"prefer-const": "warn",

			"id-denylist": "off",
			"import-x/no-named-as-default": "off",

			// TypeScript
			"@typescript-eslint/await-thenable": "error",
			"@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
			"@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
			"@typescript-eslint/only-throw-error": "error",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-member-access": ["error", { allowOptionalChaining: true }],
			"@typescript-eslint/array-type": ["warn", { default: "array-simple" }],
			"@typescript-eslint/consistent-type-assertions": "warn",
			"@typescript-eslint/consistent-type-imports": "warn",
			"@typescript-eslint/consistent-type-exports": "warn",
			"@typescript-eslint/return-await": ["warn", "always"],

			"@typescript-eslint/explicit-member-accessibility": "off",

			"@typescript-eslint/naming-convention": [
				"warn",
				{ selector: "default", format: ["camelCase"] },

				{ selector: "import", format: ["camelCase", "PascalCase"] },

				{
					selector: "variable",
					format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
					leadingUnderscore: "allowSingleOrDouble",
					trailingUnderscore: "allowSingleOrDouble",
				},

				{
					selector: "parameter",
					format: ["camelCase"],
					leadingUnderscore: "allowSingleOrDouble",
				},

				{ selector: "typeLike", format: ["PascalCase"] },
				{ selector: "enumMember", format: ["UPPER_CASE", "PascalCase"] },
			],
			"@typescript-eslint/no-restricted-types": [
				"warn",
				{
					types: {
						Object: { message: "Use object instead", fixWith: "object" },
						String: { message: "Use string instead", fixWith: "string" },
						Boolean: { message: "Use boolean instead", fixWith: "boolean" },
						Number: { message: "Use number instead", fixWith: "number" },
						Symbol: { message: "Use symbol instead", fixWith: "symbol" },
					},
				},
			],
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-empty-object-type": "warn",
			// Stylistic
			"@stylistic/member-delimiter-style": [
				"warn",
				{
					multiline: { delimiter: "semi", requireLast: true },
					singleline: { delimiter: "semi", requireLast: false },
				},
			],

			"import-x/no-cycle": "off",
			"import-x/no-default-export": "off",

			"import-x/no-duplicates": "warn",
			"import-x/order": [
				"warn",
				{
					alphabetize: { order: "asc", caseInsensitive: true },
					groups: [["builtin", "external"], "internal", ["parent", "index", "sibling"], "object"],
					"newlines-between": "always",
				},
			],

			// Plugins
			"unused-imports/no-unused-imports": "warn",
			"unicorn/no-unnecessary-await": "warn",
			"unicorn/no-useless-promise-resolve-reject": "warn",
			"lodash/path-style": ["warn", "as-needed"],
			"lodash/import-scope": ["warn", "method"],
		},
	},

	// 4. React Specific Overrides
	{
		files: ["**/*.tsx", "**/*.jsx"],
		...reactPlugin.configs.flat.recommended,
		...reactPlugin.configs.flat["jsx-runtime"],
		rules: {
			...reactHooksPlugin.configs.recommended.rules,
			"react/prop-types": "off",
			"react/react-in-jsx-scope": "off",
			"react/jsx-no-leaked-render": "error", // Security/Perf rule (Keep as error)
		},
	},

	// 5. Test Overrides
	{
		files: ["test/**/*.ts", "**/__tests__/*.ts", "**/*.test.ts", "**/*.cy.ts"],
		rules: {
			"local-rules/no-plain-errors": "off",
			"@typescript-eslint/unbound-method": "off",
			"import-x/no-default-export": "off",
		},
	},

	// 6. Local Rules
	localRulesPlugin.configs.recommended,

	// 7. Prettier (Must be last to cleanly override stylistic rules)
	eslintConfigPrettier,
);
