import { z } from "zod";

type Refinement = z.RefinementCtx;

function refuse(ctx: Refinement, field: string, message: string): void {
	ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
}

const nonEmpty = () => z.string().min(1);

const SATISFACTION = ["yes", "changes_requested", "reject"] as const;
const READINESS_DIMENSIONS = [
	"specFaithful",
	"testsMeaningful",
	"codeMatchesSpec",
	"readyForMain",
] as const;

export const ReviewVerdict = z
	.object({
		satisfied: z.enum(SATISFACTION),
		specFaithful: z.boolean(),
		testsMeaningful: z.boolean(),
		codeMatchesSpec: z.boolean(),
		readyForMain: z.boolean(),
		findings: z.array(z.string()),
		shouldEscalate: z.boolean(),
		reasoning: z.string(),
	})
	.superRefine((review, ctx) => {
		const allHold = READINESS_DIMENSIONS.every(
			(dimension) => review[dimension],
		);
		if (review.satisfied === "yes" && !allHold) {
			refuse(
				ctx,
				"satisfied",
				"a yes verdict needs every readiness dimension to hold",
			);
		}
	});
export type ReviewVerdict = z.output<typeof ReviewVerdict>;

// The assessor prompt quotes this ceiling, and a contract test reads it from
// here so the prompt and the schema cannot disagree.
export const MAX_DERIVED_ACCEPTANCE_CRITERIA = 3;

const TICKET_QUALITY = ["good", "needs_clarification", "reject"] as const;
const SCOPE_FIT = ["atomic", "too_large"] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

function acceptanceCriteriaFit(criteria: string[]): boolean {
	return (
		criteria.length >= 1 &&
		criteria.length <= MAX_DERIVED_ACCEPTANCE_CRITERIA &&
		criteria.every((criterion) => criterion.trim() !== "")
	);
}

export const AssessmentVerdict = z
	.object({
		quality: z.enum(TICKET_QUALITY),
		scopeFit: z.enum(SCOPE_FIT),
		splitRecommendation: z.array(z.string()),
		gaps: z.array(z.string()),
		derivedAcceptanceCriteria: z.array(z.string()),
		confidence: z.enum(CONFIDENCE),
	})
	.superRefine((assessment, ctx) => {
		const splits = assessment.splitRecommendation.length;
		if (assessment.scopeFit === "too_large" && splits === 0) {
			refuse(
				ctx,
				"splitRecommendation",
				"a too_large ticket has to come with a concrete split recommendation",
			);
		}
		if (assessment.scopeFit === "atomic" && splits > 0) {
			refuse(
				ctx,
				"splitRecommendation",
				"split recommendations belong only on an oversized ticket",
			);
		}
		if (
			assessment.quality === "good" &&
			!acceptanceCriteriaFit(assessment.derivedAcceptanceCriteria)
		) {
			refuse(
				ctx,
				"derivedAcceptanceCriteria",
				"a good ticket carries one to three acceptance criteria, none of them blank",
			);
		}
	});
export type AssessmentVerdict = z.output<typeof AssessmentVerdict>;

const FileClaim = z.object({ claim: nonEmpty(), file: nonEmpty() }).strict();

// The analyst's notes on the code it read, each tied to the file that backs
// it, so a later worker can begin there rather than reading the code again.
export const ComprehensionMemo = z
	.object({
		entryPoints: z.array(FileClaim),
		callers: z.array(FileClaim),
		tests: z.array(FileClaim),
		openQuestions: z.array(nonEmpty()),
	})
	.strict();
export type ComprehensionMemo = z.output<typeof ComprehensionMemo>;

const FEASIBILITY = ["yes", "no", "needs_human"] as const;
const COMPLEXITY = ["low", "medium", "high"] as const;

export const FeasibilityVerdict = z.object({
	feasible: z.enum(FEASIBILITY),
	approachSketch: z.string(),
	affectedAreas: z.array(z.string()),
	contractsTouched: z.array(z.string()),
	risks: z.array(z.string()),
	complexitySignal: z.enum(COMPLEXITY),
	specsRead: z.array(nonEmpty()).optional(),
	comprehension: ComprehensionMemo.optional(),
});
export type FeasibilityVerdict = z.output<typeof FeasibilityVerdict>;

const UncoveredCase = z
	.object({ case: nonEmpty(), evidence: nonEmpty() })
	.strict();
const Rethink = z
	.object({ problem: nonEmpty(), alternative: nonEmpty() })
	.strict();

export const ApproachChallengeVerdict = z
	.object({
		verdict: z.enum(["sound", "gaps", "rethink"]),
		gaps: z.array(UncoveredCase),
		rethink: Rethink.nullable(),
		reasoning: nonEmpty(),
	})
	.strict()
	.superRefine((challenge, ctx) => {
		const hasGaps = challenge.gaps.length > 0;
		const hasRethink = challenge.rethink !== null;
		if (challenge.verdict === "sound" && (hasGaps || hasRethink)) {
			refuse(ctx, "verdict", "sound means no gaps and no rethink");
		}
		if (challenge.verdict === "gaps" && (!hasGaps || hasRethink)) {
			refuse(ctx, "verdict", "gaps means at least one gap and no rethink");
		}
		if (challenge.verdict === "rethink" && (!hasGaps || !hasRethink)) {
			refuse(
				ctx,
				"verdict",
				"rethink means at least one gap plus the rethink itself",
			);
		}
	});
export type ApproachChallengeVerdict = z.output<
	typeof ApproachChallengeVerdict
>;

const UnansweredQuestion = z
	.object({ question: nonEmpty(), file: nonEmpty() })
	.strict();

export const ExplainBackVerdict = z
	.object({
		verdict: z.enum(["understood", "gaps", "misread"]),
		restatement: z.string(),
		gaps: z.array(UnansweredQuestion),
		contradiction: nonEmpty().nullable(),
	})
	.strict()
	.superRefine((reading, ctx) => {
		const hasGaps = reading.gaps.length > 0;
		const hasContradiction = reading.contradiction !== null;
		if (
			reading.verdict === "understood" &&
			(reading.restatement.trim() === "" || hasGaps || hasContradiction)
		) {
			refuse(
				ctx,
				"verdict",
				"understood means a restatement with no gaps and no contradiction",
			);
		}
		if (reading.verdict === "gaps" && (!hasGaps || hasContradiction)) {
			refuse(
				ctx,
				"verdict",
				"gaps means at least one gap and no contradiction",
			);
		}
		if (reading.verdict === "misread" && !hasContradiction) {
			refuse(ctx, "verdict", "misread means naming the contradiction");
		}
	});
export type ExplainBackVerdict = z.output<typeof ExplainBackVerdict>;

const READINESS_KINDS = [
	"untestable_scenario",
	"missing_file",
	"unnamed_interface",
	"task_contradiction",
] as const;

const ReadinessFinding = z
	.object({
		kind: z.enum(READINESS_KINDS),
		where: nonEmpty(),
		detail: nonEmpty(),
	})
	.strict();

export const ReadinessVerdict = z
	.object({
		verdict: z.enum(["ready", "not_ready"]),
		reasoning: nonEmpty(),
		items: z.array(ReadinessFinding),
	})
	.strict()
	.superRefine((readiness, ctx) => {
		const count = readiness.items.length;
		if (readiness.verdict === "ready" && count > 0) {
			refuse(ctx, "verdict", "ready means no items");
		}
		if (readiness.verdict === "not_ready" && count === 0) {
			refuse(ctx, "verdict", "not_ready means at least one item");
		}
	});
export type ReadinessVerdict = z.output<typeof ReadinessVerdict>;

// review-rounds.ts compares these labels across rounds: a label that comes
// back means the latest fix patched the same broken idea again.
export const AssumptionLabel = z
	.string()
	.max(60)
	.regex(
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
		"an assumption label is short kebab-case",
	);

const COMMENT_CLASSES = [
	"bug",
	"test-gap",
	"non-functional",
	"nitpick",
	"false-positive",
	"question",
	"outdated",
] as const;

export const ClassificationComment = z
	.object({
		commentId: z.string(),
		classification: z.enum(COMMENT_CLASSES),
		reasoning: z.string(),
		assumption: AssumptionLabel.optional(),
	})
	.superRefine((comment, ctx) => {
		const isBug = comment.classification === "bug";
		if (isBug && !comment.assumption) {
			refuse(ctx, "assumption", "a bug comment names the assumption it breaks");
		}
		if (!isBug && comment.assumption) {
			refuse(ctx, "assumption", "only a bug carries an assumption label");
		}
	});
export type ClassificationComment = z.output<typeof ClassificationComment>;

export const ClassificationVerdict = ClassificationComment.array();
export type ClassificationVerdict = z.output<typeof ClassificationVerdict>;

// Fails closed: text that is not JSON, or JSON the schema refuses, throws.
function readVerdict<Schema extends z.ZodTypeAny>(
	schema: Schema,
	text: string,
): z.output<Schema> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error("the verdict text is not valid JSON");
	}
	return schema.parse(value);
}

export function parseReviewVerdict(text: string): ReviewVerdict {
	return readVerdict(ReviewVerdict, text);
}

export function parseAssessmentVerdict(text: string): AssessmentVerdict {
	return readVerdict(AssessmentVerdict, text);
}

export function parseFeasibilityVerdict(text: string): FeasibilityVerdict {
	return readVerdict(FeasibilityVerdict, text);
}

export function parseApproachChallengeVerdict(
	text: string,
): ApproachChallengeVerdict {
	return readVerdict(ApproachChallengeVerdict, text);
}

export function parseExplainBackVerdict(text: string): ExplainBackVerdict {
	return readVerdict(ExplainBackVerdict, text);
}

export function parseReadinessVerdict(text: string): ReadinessVerdict {
	return readVerdict(ReadinessVerdict, text);
}

export function parseClassificationVerdict(
	text: string,
): ClassificationVerdict {
	return readVerdict(ClassificationVerdict, text);
}

export function assertClassificationComplete(
	verdict: ClassificationVerdict,
	expectedIds: Array<string | number>,
): void {
	const classified = verdict.map((comment) => comment.commentId);
	if (new Set(classified).size < classified.length) {
		throw new Error("the classification has a duplicate comment id");
	}
	const wanted = new Set(expectedIds.map((id) => String(id)));
	const have = new Set(classified);
	const missing = [...wanted].filter((id) => !have.has(id));
	const extra = classified.filter((id) => !wanted.has(id));
	if (missing.length === 0 && extra.length === 0) return;
	const list = (ids: string[]) => (ids.length > 0 ? ids.join(", ") : "none");
	throw new Error(
		`the classification does not cover exactly the given comments (missing: ${list(missing)}; extra: ${list(extra)})`,
	);
}

const USAGE =
	"usage: verdicts <review|assessment|feasibility|classification> [verdict-file] [expected-ids-file]";

type Summary = (
	text: string,
	expectedIdsFile: string | undefined,
) => Promise<Record<string, unknown>>;

const SUMMARIES = new Map<string, Summary>([
	[
		"review",
		async (text) => ({ satisfied: parseReviewVerdict(text).satisfied }),
	],
	[
		"assessment",
		async (text) => ({ quality: parseAssessmentVerdict(text).quality }),
	],
	[
		"feasibility",
		async (text) => ({ feasible: parseFeasibilityVerdict(text).feasible }),
	],
	[
		"classification",
		async (text, expectedIdsFile) => {
			const verdict = parseClassificationVerdict(text);
			if (expectedIdsFile) {
				const ids = z
					.array(z.union([z.string(), z.number()]))
					.parse(await Bun.file(expectedIdsFile).json());
				assertClassificationComplete(verdict, ids);
			}
			return { comments: verdict.length };
		},
	],
]);

if (import.meta.main) {
	const [kind, verdictFile, expectedIdsFile] = process.argv.slice(2);
	const summarise = SUMMARIES.get(kind ?? "");
	if (!summarise) {
		console.error(USAGE);
		process.exit(2);
	}
	const text = verdictFile
		? await Bun.file(verdictFile).text()
		: await new Response(Bun.stdin.stream()).text();
	try {
		const summary = await summarise(text, expectedIdsFile);
		console.log(JSON.stringify({ valid: true, ...summary }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
