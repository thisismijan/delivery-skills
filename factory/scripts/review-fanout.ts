import { z } from "zod";

export const REVIEW_LENSES = [
	"correctness-security",
	"tests-specification",
	"reliability-operations",
	"repository-blast-radius",
] as const;

const SENSITIVE_SURFACES = new Set([
	"data",
	"contract",
	"config",
	"auth",
	"infra",
]);

export const ReviewFanoutInput = z.object({
	changedFiles: z.number().int().nonnegative(),
	changedLines: z.number().int().nonnegative(),
	reversible: z.boolean(),
	classificationComplete: z.boolean(),
	surfaces: z
		.array(
			z.enum([
				"data",
				"contract",
				"config",
				"auth",
				"infra",
				"dependencies",
				"user-facing",
			]),
		)
		.default([]),
});

export type ReviewFanoutInput = z.infer<typeof ReviewFanoutInput>;

export interface ReviewFanoutPlan {
	mode: "small" | "full";
	lenses: (typeof REVIEW_LENSES)[number][];
	reason: string;
}

export function planReviewFanout(input: ReviewFanoutInput): ReviewFanoutPlan {
	const parsed = ReviewFanoutInput.parse(input);
	const sensitive = parsed.surfaces.filter((surface) =>
		SENSITIVE_SURFACES.has(surface),
	);
	const small =
		parsed.classificationComplete &&
		parsed.changedFiles <= 2 &&
		parsed.changedLines < 50 &&
		parsed.reversible &&
		sensitive.length === 0;

	if (small) {
		return {
			mode: "small",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason: "small reversible change with no sensitive surface",
		};
	}

	const reasons = [
		!parsed.classificationComplete ? "classification incomplete" : undefined,
		parsed.changedFiles > 2 ? "more than 2 changed files" : undefined,
		parsed.changedLines >= 50 ? "at least 50 changed lines" : undefined,
		!parsed.reversible ? "one-way change" : undefined,
		sensitive.length > 0
			? `sensitive surfaces: ${sensitive.join(", ")}`
			: undefined,
	].filter((reason): reason is string => reason !== undefined);

	return {
		mode: "full",
		lenses: [...REVIEW_LENSES],
		reason: reasons.join("; "),
	};
}

if (import.meta.main) {
	const inputPath = process.argv[2];
	if (!inputPath) {
		console.error("usage: review-fanout <input.json>");
		process.exit(2);
	}
	try {
		const input = ReviewFanoutInput.parse(await Bun.file(inputPath).json());
		console.log(JSON.stringify(planReviewFanout(input), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
