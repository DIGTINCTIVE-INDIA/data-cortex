import { ESLintUtils } from "@typescript-eslint/utils";
import { isJsonParseCall, isJsonStringifyCall } from "../utils/json.js";

export const NoUncaughtJsonParseRule = ESLintUtils.RuleCreator.withoutDocs({
	name: "no-uncaught-json-parse",
	meta: {
		type: "problem",
		hasSuggestions: true,
		docs: {
			description: "Surrounded with a try/catch block.",
		},
		schema: [],
		messages: {
			noUncaughtJsonParse: "Surround the `JSON.parse()` call with a try/catch block.",
		},
	},
	defaultOptions: [],
	create({ report, sourceCode }) {
		return {
			CallExpression(node) {
				if (!isJsonParseCall(node)) {
					return;
				}

				if (isJsonStringifyCall(node)) {
					return;
				}

				if (
					sourceCode.getAncestors(node).find(node => node.type === "TryStatement") !== undefined
				) {
					return;
				}

				// Found a JSON.parse() call not wrapped into a try/catch, so report it
				report({
					messageId: "noUncaughtJsonParse",
					node,
				});
			},
		};
	},
});
