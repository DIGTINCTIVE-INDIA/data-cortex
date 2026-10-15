import type { AnyRuleModule } from "@typescript-eslint/utils/ts-eslint";
import { NoArgumentSpreadRule } from "./no-argument-spread.js";
import { NoInternalPackageImportRule } from "./no-internal-package-import.js";
import { NoInterpolationInRegularStringRule } from "./no-interpolation-in-regular-string.js";
import { NoJsonParseJsonStringifyRule } from "./no-json-parse-json-stringify.js";
import { NoSkippedTestsRule } from "./no-skipped-tests.js";
import { NoTopLevelRelativeImportsInBackendModuleRule } from "./no-top-level-relative-imports-in-backend-module.js";
import { NoTypeUnsafeEventEmitterRule } from "./no-type-unsafe-event-emitter.js";
import { NoUncaughtJsonParseRule } from "./no-uncaught-json-parse.js";
import { NoUntypedConfigClassFieldRule } from "./no-untyped-config-class-field.js";
import { NoUnusedParamInCatchClauseRule } from "./no-unused-param-catch-clause.js";
import { NoUselessCatchThrowRule } from "./no-useless-catch-throw.js";

export const rules = {
	"no-uncaught-json-parse": NoUncaughtJsonParseRule,
	"no-json-parse-json-stringify": NoJsonParseJsonStringifyRule,
	"no-unused-param-in-catch-clause": NoUnusedParamInCatchClauseRule,
	"no-useless-catch-throw": NoUselessCatchThrowRule,
	"no-skipped-tests": NoSkippedTestsRule,
	"no-interpolation-in-regular-string": NoInterpolationInRegularStringRule,
	"no-type-unsafe-event-emitter": NoTypeUnsafeEventEmitterRule,
	"no-untyped-config-class-field": NoUntypedConfigClassFieldRule,
	"no-top-level-relative-imports-in-backend-module": NoTopLevelRelativeImportsInBackendModuleRule,
	"no-argument-spread": NoArgumentSpreadRule,
	"no-internal-package-import": NoInternalPackageImportRule,
} satisfies Record<string, AnyRuleModule>;
