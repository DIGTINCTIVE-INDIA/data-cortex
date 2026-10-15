import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
	...baseConfig,
	platform: "node",
	external: ["sharp"],
	noExternal: [/(.*)/],
	clean: false,
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none",
	},
});
