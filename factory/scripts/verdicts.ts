import { z } from "zod";

export const ReviewVerdict = z.object({
	satisfied: z.enum(["yes", "changes_requested", "reject"]),
	specFaithful: z.boolean(),
	testsMeaningful: z.boolean(),
	codeMatchesSpec: z.boolean(),
	readyForMain: z.boolean(),
	findings: z.array(z.string()),
	shouldEscalate: z.boolean(),
	reasoning: z.string(),
});
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

export const AssessmentVerdict = z.object({
	quality: z.enum(["good", "needs_clarification", "reject"]),
	gaps: z.array(z.string()),
	derivedAcceptanceCriteria: z.array(z.string()),
	confidence: z.enum(["high", "medium", "low"]),
});
export type AssessmentVerdict = z.infer<typeof AssessmentVerdict>;

export const FeasibilityVerdict = z.object({
	feasible: z.enum(["yes", "no", "needs_human"]),
	approachSketch: z.string(),
	affectedAreas: z.array(z.string()),
	contractsTouched: z.array(z.string()),
	risks: z.array(z.string()),
	complexitySignal: z.enum(["low", "medium", "high"]),
});
export type FeasibilityVerdict = z.infer<typeof FeasibilityVerdict>;

export const ClassificationComment = z.object({
	commentId: z.string(),
	classification: z.enum([
		"bug",
		"non-functional",
		"nitpick",
		"false-positive",
		"question",
		"outdated",
	]),
	reasoning: z.string(),
});
export type ClassificationComment = z.infer<typeof ClassificationComment>;

export const ClassificationVerdict = z.array(ClassificationComment);
export type ClassificationVerdict = z.infer<typeof ClassificationVerdict>;

// Fail-closed: throws on invalid JSON or schema mismatch.
function parseJson(input: string): unknown {
	try {
		return JSON.parse(input);
	} catch {
		throw new Error("verdict is not valid JSON");
	}
}

export function parseReviewVerdict(input: string): ReviewVerdict {
	return ReviewVerdict.parse(parseJson(input));
}

export function parseAssessmentVerdict(input: string): AssessmentVerdict {
	return AssessmentVerdict.parse(parseJson(input));
}

export function parseFeasibilityVerdict(input: string): FeasibilityVerdict {
	return FeasibilityVerdict.parse(parseJson(input));
}

export function parseClassificationVerdict(
	input: string,
): ClassificationVerdict {
	return ClassificationVerdict.parse(parseJson(input));
}

if (import.meta.main) {
	const input = await new Response(Bun.stdin.stream()).text();
	try {
		const v = parseReviewVerdict(input);
		console.log(JSON.stringify({ valid: true, satisfied: v.satisfied }));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
