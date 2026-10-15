import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";

export const NoJsonParseJsonStringifyRule = ESLintUtils.RuleCreator.withoutDocs({
	name: "no-json-parse-json-stringify",
	meta: {
		type: "problem",
		docs: {
			description:
				"Calls to `JSON.parse(JSON.stringify(arg))` must be replaced with `structuredClone(arg)`.",
		},
		schema: [],
		messages: {
			noJsonParseJsonStringify: "Replace with `structuredClone({{ argText }})`",
		},
		fixable: "code",
	},
	defaultOptions: [],
	create(context) {
		return {
			CallExpression(node) {
				// 1. Explicitly check if the outer call is exactly JSON.parse(...)
				if (
					node.callee.type !== TSESTree.AST_NODE_TYPES.MemberExpression ||
					node.callee.object.type !== TSESTree.AST_NODE_TYPES.Identifier ||
					node.callee.object.name !== "JSON" ||
					node.callee.property.type !== TSESTree.AST_NODE_TYPES.Identifier ||
					node.callee.property.name !== "parse"
				) {
					return;
				}

				const inner = node.arguments[0];

				// 2. Explicitly check if the inner call is exactly JSON.stringify(...)
				if (
					!inner ||
					inner.type !== TSESTree.AST_NODE_TYPES.CallExpression ||
					inner.callee.type !== TSESTree.AST_NODE_TYPES.MemberExpression ||
					inner.callee.object.type !== TSESTree.AST_NODE_TYPES.Identifier ||
					inner.callee.object.name !== "JSON" ||
					inner.callee.property.type !== TSESTree.AST_NODE_TYPES.Identifier ||
					inner.callee.property.name !== "stringify"
				) {
					return;
				}

				const arg = inner.arguments[0];
				if (!arg) return;

				// 3. Extract the text and report/fix
				const argText = context.sourceCode.getText(arg);

				context.report({
					node,
					messageId: "noJsonParseJsonStringify",
					data: { argText },
					fix: fixer => fixer.replaceText(node, `structuredClone(${argText})`),
				});
			},
		};
	},
});
