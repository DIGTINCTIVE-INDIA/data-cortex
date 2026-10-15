import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import { NoJsonParseJsonStringifyRule } from "./no-json-parse-json-stringify.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
		},
	},
});

ruleTester.run("no-json-parse-json-stringify", NoJsonParseJsonStringifyRule, {
	valid: [
		{ code: "structuredClone(foo)" },
		{ code: "JSON.parse(foo)" },
		{ code: "JSON.stringify(foo)" },
	],
	invalid: [
		{
			code: "JSON.parse(JSON.stringify(foo))",
			errors: [{ messageId: "noJsonParseJsonStringify" }],
			output: "structuredClone(foo)",
		},
		{
			code: "JSON.parse(JSON.stringify(foo.bar))",
			errors: [{ messageId: "noJsonParseJsonStringify" }],
			output: "structuredClone(foo.bar)",
		},
		{
			code: "JSON.parse(JSON.stringify(foo.bar.baz))",
			errors: [{ messageId: "noJsonParseJsonStringify" }],
			output: "structuredClone(foo.bar.baz)",
		},
		{
			code: "JSON.parse(JSON.stringify(foo.bar[baz]))",
			errors: [{ messageId: "noJsonParseJsonStringify" }],
			output: "structuredClone(foo.bar[baz])",
		},
	],
});
