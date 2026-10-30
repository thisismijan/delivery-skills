import { z } from "zod";

export const ReviewVerdict = z
	.object({
		satisfied: z.enum(["yes", "changes_requested", "reject"]),
		specFaithful: z.boolean(),
		testsMeaningful: z.boolean(),
		codeMatchesSpec: z.boolean(),
		readyForMain: z.boolean(),
		findings: z.array(z.string()),
		shouldEscalate: z.boolean(),
		reasoning: z.string(),
	})
	.superRefine((verdict, ctx) => {
		if (
			verdict.satisfied === "yes" &&
			(!verdict.specFaithful ||
				!verdict.testsMeaningful ||
				!verdict.codeMatchesSpec ||
				!verdict.readyForMain)
		) {
			ctx.addIssue({
				code: "custom",
				path: ["satisfied"],
				message: "a satisfied review requires every readiness dimension",
			});
		}
	});
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

// The most acceptance criteria a good ticket may carry. The assessor prompt states this cap and a
// contract test reads it from here, so the prompt cannot drift from what is enforced.
export const MAX_DERIVED_ACCEPTANCE_CRITERIA = 3;

export const AssessmentVerdict = z
	.object({
		quality: z.enum(["good", "needs_clarification", "reject"]),
		scopeFit: z.enum(["atomic", "too_large"]),
		splitRecommendation: z.array(z.string()),
		gaps: z.array(z.string()),
		derivedAcceptanceCriteria: z.array(z.string()),
		confidence: z.enum(["high", "medium", "low"]),
	})
	.superRefine((verdict, ctx) => {
		if (
			verdict.scopeFit === "too_large" &&
			verdict.splitRecommendation.length === 0
		) {
			ctx.addIssue({
				code: "custom",
				path: ["splitRecommendation"],
				message: "an oversized ticket requires a concrete split recommendation",
			});
		}
		if (
			verdict.scopeFit === "atomic" &&
			verdict.splitRecommendation.length > 0
		) {
			ctx.addIssue({
				code: "custom",
				path: ["splitRecommendation"],
				message: "an atomic ticket must not carry split recommendations",
			});
		}
		if (
			verdict.quality === "good" &&
			(verdict.derivedAcceptanceCriteria.length === 0 ||
				verdict.derivedAcceptanceCriteria.length >
					MAX_DERIVED_ACCEPTANCE_CRITERIA ||
				verdict.derivedAcceptanceCriteria.some(
					(criterion) => criterion.trim().length === 0,
				))
		) {
			ctx.addIssue({
				code: "custom",
				path: ["derivedAcceptanceCriteria"],
				message:
					"a good ticket requires one to three non-empty acceptance criteria",
			});
		}
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

// A short kebab-case name for the design assumption a bug breaks. Rounds that
// repeat a label are how review-rounds.ts spots a fix patching the same idea.
export const AssumptionLabel = z
	.string()
	.max(60)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a short kebab-case label");

export const ClassificationComment = z
	.object({
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
		assumption: AssumptionLabel.optional(),
	})
	.superRefine((comment, ctx) => {
		if (comment.classification === "bug" && !comment.assumption) {
			ctx.addIssue({
				code: "custom",
				path: ["assumption"],
				message: "a bug names the assumption it breaks",
			});
		}
		if (comment.classification !== "bug" && comment.assumption) {
			ctx.addIssue({
				code: "custom",
				path: ["assumption"],
				message: "only a bug names an assumption",
			});
		}
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

export function assertClassificationComplete(
	verdict: ClassificationVerdict,
	expectedIds: Array<string | number>,
): void {
	const actual = verdict.map((item) => item.commentId);
	const expected = expectedIds.map(String);
	if (new Set(actual).size !== actual.length) {
		throw new Error("classification contains duplicate comment ids");
	}
	const missing = expected.filter((id) => !actual.includes(id));
	const extra = actual.filter((id) => !expected.includes(id));
	if (missing.length > 0 || extra.length > 0) {
		throw new Error(
			`classification ids do not match comments (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
		);
	}
}

if (import.meta.main) {
	const mode = process.argv[2];
	const inputFile = process.argv[3];
	if (
		!mode ||
		!["review", "assessment", "feasibility", "classification"].includes(mode)
	) {
		console.error(
			"usage: verdicts <review|assessment|feasibility|classification> [verdict-file] [expected-ids-file]",
		);
		process.exit(2);
	}
	const input = inputFile
		? await Bun.file(inputFile).text()
		: await new Response(Bun.stdin.stream()).text();
	try {
		let detail: Record<string, unknown> = {};
		if (mode === "review") {
			detail = { satisfied: parseReviewVerdict(input).satisfied };
		} else if (mode === "assessment") {
			detail = { quality: parseAssessmentVerdict(input).quality };
		} else if (mode === "feasibility") {
			detail = { feasible: parseFeasibilityVerdict(input).feasible };
		} else {
			const verdict = parseClassificationVerdict(input);
			const expectedFile = process.argv[4];
			if (expectedFile) {
				const expected = z
					.array(z.union([z.string(), z.number()]))
					.parse(await Bun.file(expectedFile).json());
				assertClassificationComplete(verdict, expected);
			}
			detail = { comments: verdict.length };
		}
		console.log(JSON.stringify({ valid: true, ...detail }));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
