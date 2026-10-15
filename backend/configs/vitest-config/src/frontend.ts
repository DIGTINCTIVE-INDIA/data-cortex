import { baseVitestConfig } from "./base.ts";

export default baseVitestConfig({
	environment: "jsdom",
	setupFiles: ["./src/__tests__/setup.ts"],
	css: {
		modules: {
			classNameStrategy: "non-scoped",
		},
	},

	coverage: {
		reporter: ["text-summary", "lcov", "html"],
	},
});
