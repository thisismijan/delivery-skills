import { z } from "zod";

export const MECHANICAL_OPERATIONS = [
	"rename",
	"import-only",
	"format-only",
] as const;

const BLOCKING_SURFACES = new Set([
	"data",
	"contract",
	"config",
	"auth",
	"infra",
	"migration",
	"concurrency",
	"distributed-state",
]);

export const MechanicalEditInput = z
	.object({
		operation: z.enum(MECHANICAL_OPERATIONS),
		from: z.string().min(1).optional(),
		to: z.string().min(1).optional(),
		files: z.array(z.string().min(1)).min(1),
		reversible: z.boolean(),
		classificationComplete: z.boolean(),
		surfaces: z.array(z.string().min(1)).default([]),
		verification: z.enum(["strong", "partial", "weak"]),
		scriptedApply: z.boolean().default(false),
	})
	.superRefine((value, ctx) => {
		if (value.operation === "rename" && (!value.from || !value.to)) {
			ctx.addIssue({
				code: "custom",
				message: "rename requires from and to identifiers",
			});
		}
	});

export type MechanicalEditInput = z.input<typeof MechanicalEditInput>;

export interface MechanicalEditPlan {
	verdict: "mechanical" | "not-mechanical";
	reason: string;
	apply: "script" | "select-model";
}

function blockingSurfaces(surfaces: string[]): string[] {
	return surfaces.filter((surface) => BLOCKING_SURFACES.has(surface));
}

export function classifyMechanicalEdit(input: unknown): MechanicalEditPlan {
	const parsed = MechanicalEditInput.parse(input);
	const blocked = blockingSurfaces(parsed.surfaces);
	const reasons = [
		!parsed.classificationComplete ? "classification incomplete" : undefined,
		!parsed.reversible ? "one-way change" : undefined,
		parsed.verification !== "strong"
			? "verification is not a compile-and-test gate"
			: undefined,
		blocked.length > 0 ? `blocking surfaces: ${blocked.join(", ")}` : undefined,
		parsed.operation === "rename" && parsed.from === parsed.to
			? "rename identifiers are the same"
			: undefined,
	].filter((reason): reason is string => reason !== undefined);

	if (reasons.length > 0) {
		return {
			verdict: "not-mechanical",
			reason: reasons.join("; "),
			apply: "select-model",
		};
	}

	return {
		verdict: "mechanical",
		reason: `${parsed.operation} is local, reversible, and strongly verified`,
		apply: parsed.scriptedApply ? "script" : "select-model",
	};
}

if (import.meta.main) {
	const inputPath = process.argv[2];
	if (!inputPath) {
		console.error("usage: mechanical-edit <input.json>");
		process.exit(2);
	}
	try {
		const plan = classifyMechanicalEdit(await Bun.file(inputPath).json());
		console.log(JSON.stringify(plan));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
