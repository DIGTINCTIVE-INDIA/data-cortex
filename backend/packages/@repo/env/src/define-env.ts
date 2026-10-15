import type { ZodTypeAny } from "zod";
import { ZodError, z } from "zod";

import { loadDotenv } from "./utils.js";

loadDotenv();

type SpecEntry =
	| ZodTypeAny
	| {
			schema: ZodTypeAny;
			default?: unknown;
			env?: string;
			description?: string;
	  };

type Spec = Record<string, SpecEntry>;

type InferSpec<S extends Spec> = {
	[K in keyof S]: S[K] extends ZodTypeAny
		? z.infer<S[K]>
		: S[K] extends { schema: ZodTypeAny }
			? z.infer<S[K]["schema"]>
			: never;
};

function isZod(v: SpecEntry): v is ZodTypeAny {
	return typeof v === "object" && v !== null && "parse" in v;
}

const tempEnv = new Map<string, string>();

export function defineEnv<S extends Spec>(spec: S): InferSpec<S> {
	const rawEnv: Record<string, unknown> = {};
	const zodShape: Record<string, ZodTypeAny> = {};

	for (const key of Object.keys(spec) as Array<keyof S>) {
		const entry = spec[key];

		const normalized = isZod(entry)
			? { schema: entry, default: undefined, env: key as string }
			: {
					schema: entry.schema,
					default: entry.default,
					env: entry.env ?? (key as string),
				};

		if (process.env[normalized.env]) {
			tempEnv.set(normalized.env, process.env[normalized.env] ?? "");
			delete process.env[normalized.env];
		}
		const raw = tempEnv.get(normalized.env);

		rawEnv[key as string] = raw === undefined ? normalized.default : raw;

		zodShape[key as string] = normalized.schema;
	}

	try {
		const result = z.object(zodShape).parse(rawEnv);
		return result as InferSpec<S>;
	} catch (err: unknown) {
		if (err instanceof ZodError) {
			const messages = err.issues.map(e => `${e.path.join(".")}: ${e.message}`);

			throw new Error(`Invalid environment variables:\n  ❌ ${messages.join("\n  ❌ ")}`);
		}
		throw err;
	}
}
