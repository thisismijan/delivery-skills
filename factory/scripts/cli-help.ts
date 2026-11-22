import { z } from "zod";

// Describes a zod input schema as a compact JSON-like shape, so `--help` shows a caller the exact
// fields a command accepts without anyone reading the command's source.
export function describeSchema(schema: z.ZodTypeAny): string {
	if (schema.description) return schema.description;
	const def = schema._def as { typeName?: string };
	switch (def.typeName) {
		case z.ZodFirstPartyTypeKind.ZodObject: {
			const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
			const fields = Object.entries(shape).map(([key, value]) => {
				const typeName = (value as z.ZodTypeAny)._def.typeName;
				const optional =
					typeName === z.ZodFirstPartyTypeKind.ZodOptional ||
					typeName === z.ZodFirstPartyTypeKind.ZodDefault;
				return `${key}${optional ? "?" : ""}: ${describeSchema(value as z.ZodTypeAny)}`;
			});
			return `{ ${fields.join(", ")} }`;
		}
		case z.ZodFirstPartyTypeKind.ZodString:
			return "string";
		case z.ZodFirstPartyTypeKind.ZodNumber:
			return "number";
		case z.ZodFirstPartyTypeKind.ZodBoolean:
			return "boolean";
		case z.ZodFirstPartyTypeKind.ZodLiteral:
			return JSON.stringify((schema as z.ZodLiteral<unknown>).value);
		case z.ZodFirstPartyTypeKind.ZodEnum:
			return (schema as z.ZodEnum<[string, ...string[]]>).options
				.map((option) => JSON.stringify(option))
				.join(" | ");
		case z.ZodFirstPartyTypeKind.ZodArray: {
			const element = describeSchema(
				(schema as z.ZodArray<z.ZodTypeAny>).element,
			);
			return element.includes(" ") && !element.startsWith("{")
				? `(${element})[]`
				: `${element}[]`;
		}
		case z.ZodFirstPartyTypeKind.ZodRecord:
			return `{ [key: string]: ${describeSchema((schema as z.ZodRecord).valueSchema)} }`;
		case z.ZodFirstPartyTypeKind.ZodUnion:
		case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
			return [
				...(
					schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>
				).options.values(),
			]
				.map((option) => describeSchema(option))
				.join(" | ");
		case z.ZodFirstPartyTypeKind.ZodOptional:
		case z.ZodFirstPartyTypeKind.ZodNullable:
			return `${describeSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap())}${def.typeName === z.ZodFirstPartyTypeKind.ZodNullable ? " | null" : ""}`;
		case z.ZodFirstPartyTypeKind.ZodDefault:
			return describeSchema(
				(schema as z.ZodDefault<z.ZodTypeAny>).removeDefault(),
			);
		case z.ZodFirstPartyTypeKind.ZodEffects:
			return describeSchema((schema as z.ZodEffects<z.ZodTypeAny>).innerType());
		case z.ZodFirstPartyTypeKind.ZodBranded:
			return describeSchema(
				(schema as z.ZodBranded<z.ZodTypeAny, string>).unwrap(),
			);
		case z.ZodFirstPartyTypeKind.ZodPipeline:
			return describeSchema(
				(schema as z.ZodPipeline<z.ZodTypeAny, z.ZodTypeAny>)._def.in,
			);
		case z.ZodFirstPartyTypeKind.ZodLazy:
			return describeSchema((schema as z.ZodLazy<z.ZodTypeAny>).schema);
		case z.ZodFirstPartyTypeKind.ZodNull:
			return "null";
		default:
			return "unknown";
	}
}

export function isHelpRequest(args: readonly string[]): boolean {
	return args[0] === "--help" || args[0] === "-h" || args[0] === "help";
}

// One usage block, then one line per operation with the JSON input it takes. `operation` narrows
// the listing to that one operation.
export function helpText(options: {
	usage: readonly string[];
	inputs: Readonly<Record<string, z.ZodTypeAny | null>>;
	notes?: readonly string[];
	operation?: string;
}): string {
	const names = Object.keys(options.inputs);
	if (options.operation !== undefined && !names.includes(options.operation)) {
		throw new Error(
			`unknown operation '${options.operation}'; operations: ${names.join(", ")}`,
		);
	}
	const shown = options.operation ? [options.operation] : names;
	const lines = [
		...options.usage.map((line, index) =>
			index === 0 ? `usage: ${line}` : `       ${line}`,
		),
		"",
		"input.json per operation:",
		...shown.map((name) => {
			const schema = options.inputs[name];
			return `  ${name}: ${schema ? describeSchema(schema) : "no input file"}`;
		}),
		...(options.notes && options.notes.length > 0
			? ["", ...options.notes]
			: []),
	];
	return lines.join("\n");
}
