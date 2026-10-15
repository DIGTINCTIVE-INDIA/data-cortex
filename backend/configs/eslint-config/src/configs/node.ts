import { defineConfig } from "eslint/config";
import globals from "globals";
import { baseConfig } from "./base.js";

export const nodeConfig = defineConfig(baseConfig, {
	languageOptions: {
		ecmaVersion: 2024,
		globals: globals.node,
	},
});
