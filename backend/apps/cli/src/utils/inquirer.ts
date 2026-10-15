import { input, select, checkbox } from "@inquirer/prompts";
import { type z, type ZodTypeAny, ZodEnum, ZodNumber } from "zod";

type PromptProps<T extends ZodTypeAny | undefined> = {
	name: string;
	message: string;
	schema?: T;
	default?: T extends ZodTypeAny ? z.infer<T> : string;
};

type MultiSelectProps<T extends "single" | "multiple"> = {
	message: string;
	options: string[];
	mode?: T;
	default?: T extends "single" ? string : string[];
	includeAllOption?: boolean;
	required?: boolean;
};

export class CommonInquirer {
	static async getText<T extends ZodTypeAny | undefined>(
		props: PromptProps<T>
	): Promise<T extends ZodTypeAny ? z.infer<T> : string> {
		const { message, schema, default: defaultValue } = props;

		let validDefault: T extends ZodTypeAny ? z.infer<T> : string;

		if (schema && defaultValue !== undefined) {
			const result = schema.safeParse(defaultValue);
			if (result.success) {
				validDefault = result.data as T extends ZodTypeAny ? z.infer<T> : string;
			}
		} else if (!schema && defaultValue !== undefined) {
			validDefault = defaultValue;
		}

		if (schema && schema instanceof ZodEnum) {
			const formattedChoices = schema.options.map(opt => ({
				value: opt,
			}));

			const answer = await select({
				message,
				choices: formattedChoices,
				default: validDefault! as string,
			});

			return answer as T extends ZodTypeAny ? z.infer<T> : string;
		}

		const answer = await input({
			message,
			default: validDefault! as string,
			validate: (value: string) => {
				if (!schema) return true;

				let valToValidate: string | number = value;

				if (schema instanceof ZodNumber) {
					if (value.trim() === "") return "Input cannot be empty";

					const parsed = Number(value);
					if (Number.isNaN(parsed)) {
						return "Please enter a valid number";
					}

					valToValidate = parsed;
				}

				const result = schema.safeParse(valToValidate);

				if (!result.success) {
					return result.error.issues[0]?.message ?? "Invalid input";
				}

				return true;
			},
		});

		if (!schema) {
			return answer as T extends ZodTypeAny ? z.infer<T> : string;
		}

		const finalValue = schema instanceof ZodNumber ? Number(answer) : answer;

		return schema.parse(finalValue) as T extends ZodTypeAny ? z.infer<T> : string;
	}

	static async choose(props: MultiSelectProps<"single">): Promise<string>;
	static async choose(props: MultiSelectProps<"multiple">): Promise<string[]>;
	static async choose<T extends "single" | "multiple">(props: MultiSelectProps<T>) {
		const {
			message,
			options,
			mode = "single",
			default: defaultValue,
			includeAllOption = false,
			required = false,
		} = props;

		const ALL = "__all__";

		// const defaults =  Array.isArray(defaultValue)
		// 	? defaultValue
		// 	: defaultValue
		// 		? [defaultValue]
		// 		: [] as string[];

		const defaultValues = (
			mode === "single" ? [defaultValue] : [...(defaultValue || [])]
		) as string[];

		const choices = [
			...(mode === "multiple" && includeAllOption
				? [
						{
							name: "All",
							value: ALL,
							checked: defaultValues.includes(ALL),
						},
					]
				: []),
			...options.map(opt => ({
				name: opt,
				value: opt,
				checked: defaultValues.includes(opt),
			})),
		];

		if (mode === "multiple") {
			const answer = await checkbox({
				message,
				choices,
				validate: input => {
					if (required && input.length === 0) {
						return "You must select at least one option.";
					}
					return true;
				},
			});

			if (includeAllOption && answer.includes(ALL)) {
				return options;
			}

			return answer;
		}

		const answer = await select({
			message,
			choices: options.map(opt => ({
				name: opt,
				value: opt,
			})),
			default: typeof defaultValue === "string" ? defaultValue : undefined,
		});

		return answer;
	}
}
