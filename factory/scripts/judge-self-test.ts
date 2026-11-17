import { z } from "zod";

// How a utility score was produced. A model asked for its opinion is only
// trusted once it has shown it can tell a known-good output from a known-bad
// one on the same task.
export const JudgeSelfTest = z
	.object({
		model: z.string().min(1),
		goodReference: z.string().min(1),
		badReference: z.string().min(1),
		goodScore: z.number().finite(),
		badScore: z.number().finite(),
	})
	.strict();
export type JudgeSelfTest = z.infer<typeof JudgeSelfTest>;

export const UtilityScoring = z.discriminatedUnion("scoredBy", [
	z.object({ scoredBy: z.literal("checks") }).strict(),
	z.object({ scoredBy: z.literal("judge"), selfTest: JudgeSelfTest }).strict(),
]);
export type UtilityScoring = z.infer<typeof UtilityScoring>;

export function scoringKind(
	scoring: UtilityScoring | undefined,
): "checks" | "judge" {
	return scoring?.scoredBy ?? "checks";
}

// Why a score must be refused, or undefined when it may count.
export function judgeSelfTestProblem(
	scoring: UtilityScoring | undefined,
): string | undefined {
	if (!scoring || scoring.scoredBy === "checks") return undefined;
	const test = scoring.selfTest;
	if (test.goodReference === test.badReference) {
		return `the judge ${test.model} was self-tested on the same reference twice, so its scores are refused`;
	}
	if (test.goodScore <= test.badScore) {
		return `the judge ${test.model} scored the known-bad reference ${test.badReference} (${test.badScore}) at or above the known-good reference ${test.goodReference} (${test.goodScore}), so its scores are refused`;
	}
	return undefined;
}
