import { baseConfig } from "eslint-config/base";
import { extend } from "eslint-config/extend";
export default extend(baseConfig, {
	rules: {
		"@typescript-eslint/no-explicit-any": "warn",
	},
});
