import { expect, test } from "bun:test";
import {
	assertClassificationComplete,
	parseAssessmentVerdict,
	parseClassificationVerdict,
	parseFeasibilityVerdict,
	parseReviewVerdict,
} from "./verdicts";

// ---------------------------------------------------------------------------
// ReviewVerdict
// ---------------------------------------------------------------------------

const valid = {
	satisfied: "yes",
	specFaithful: true,
	testsMeaningful: true,
	codeMatchesSpec: true,
	readyForMain: true,
	findings: [] as string[],
	shouldEscalate: false,
	reasoning: "ok",
};

test("parses a valid review verdict", () => {
	expect(parseReviewVerdict(JSON.stringify(valid)).satisfied).toBe("yes");
});

test("throws on an invalid enum value", () => {
	expect(() =>
		parseReviewVerdict(JSON.stringify({ ...valid, satisfied: "maybe" })),
	).toThrow();
});

test("throws on malformed JSON (fail closed)", () => {
	expect(() => parseReviewVerdict("{not json")).toThrow("valid JSON");
});

// ---------------------------------------------------------------------------
// SMAI-1745: readyForMain code-readiness dimension
// ---------------------------------------------------------------------------

test("parses a verdict carrying readyForMain and exposes it as a boolean", () => {
	const withReadiness = { ...valid, readyForMain: true };
	const parsed = parseReviewVerdict(JSON.stringify(withReadiness));
	expect(parsed.readyForMain).toBe(true);
});

test("fail closed: throws when readyForMain is omitted", () => {
	const withReadiness = { ...valid, readyForMain: true };
	const { readyForMain, ...withoutReadiness } = withReadiness;
	expect(() => parseReviewVerdict(JSON.stringify(withoutReadiness))).toThrow();
});

test("fail closed: throws when readyForMain is not a boolean", () => {
	const withReadiness = { ...valid, readyForMain: true };
	expect(() =>
		parseReviewVerdict(
			JSON.stringify({ ...withReadiness, readyForMain: "yes" }),
		),
	).toThrow();
});

test("a yes verdict is invalid when any readiness dimension is false", () => {
	for (const field of [
		"specFaithful",
		"testsMeaningful",
		"codeMatchesSpec",
		"readyForMain",
	] as const) {
		expect(() =>
			parseReviewVerdict(JSON.stringify({ ...valid, [field]: false })),
		).toThrow("every readiness dimension");
	}
});

// ---------------------------------------------------------------------------
// AssessmentVerdict
// ---------------------------------------------------------------------------

const validAssessment = {
	quality: "good",
	scopeFit: "atomic",
	splitRecommendation: [] as string[],
	gaps: [] as string[],
	derivedAcceptanceCriteria: ["AC1"],
	confidence: "high",
};

test("parses a valid assessment verdict", () => {
	expect(parseAssessmentVerdict(JSON.stringify(validAssessment)).quality).toBe(
		"good",
	);
});

test("assessment: throws on invalid quality", () => {
	expect(() =>
		parseAssessmentVerdict(
			JSON.stringify({ ...validAssessment, quality: "ok" }),
		),
	).toThrow();
});

test("assessment: parses an atomic scope verdict", () => {
	expect(parseAssessmentVerdict(JSON.stringify(validAssessment)).scopeFit).toBe(
		"atomic",
	);
});

test("assessment: parses an oversized verdict with concrete split recommendations", () => {
	const parsed = parseAssessmentVerdict(
		JSON.stringify({
			...validAssessment,
			scopeFit: "too_large",
			splitRecommendation: ["Add the contract", "Consume the contract"],
		}),
	);
	expect(parsed.scopeFit).toBe("too_large");
	expect(parsed.splitRecommendation).toHaveLength(2);
});

test("assessment: fails closed when an oversized verdict omits the split", () => {
	expect(() =>
		parseAssessmentVerdict(
			JSON.stringify({
				...validAssessment,
				scopeFit: "too_large",
				splitRecommendation: [],
			}),
		),
	).toThrow("concrete split recommendation");
});

test("assessment: fails closed when scope fit is omitted", () => {
	const { scopeFit, ...withoutScopeFit } = validAssessment;
	expect(() =>
		parseAssessmentVerdict(JSON.stringify(withoutScopeFit)),
	).toThrow();
});

test("assessment: good quality requires one to three acceptance criteria", () => {
	expect(() =>
		parseAssessmentVerdict(
			JSON.stringify({ ...validAssessment, derivedAcceptanceCriteria: [] }),
		),
	).toThrow("one to three");
});

// ---------------------------------------------------------------------------
// FeasibilityVerdict
// ---------------------------------------------------------------------------

const validFeasibility = {
	feasible: "yes",
	approachSketch: "do X",
	affectedAreas: [] as string[],
	contractsTouched: [] as string[],
	risks: [] as string[],
	complexitySignal: "low",
};

test("parses a valid feasibility verdict", () => {
	expect(
		parseFeasibilityVerdict(JSON.stringify(validFeasibility)).feasible,
	).toBe("yes");
});

test("feasibility: throws on malformed JSON", () => {
	expect(() => parseFeasibilityVerdict("{nope")).toThrow("valid JSON");
});

// ---------------------------------------------------------------------------
// ClassificationVerdict
//
// Contract pinned for the implementer (scripts/verdicts.ts must export these):
//
//   export const ClassificationComment = z.object({
//     commentId:      z.string(),
//     classification: z.enum([
//       "bug", "non-functional", "nitpick",
//       "false-positive", "question", "outdated"
//     ]),
//     reasoning: z.string(),
//   });
//   export type ClassificationComment = z.infer<typeof ClassificationComment>;
//
//   export const ClassificationVerdict = z.array(ClassificationComment);
//   export type ClassificationVerdict = z.infer<typeof ClassificationVerdict>;
//
//   export function parseClassificationVerdict(input: string): ClassificationVerdict
//     -- fail-closed: throws on invalid JSON, schema mismatch, or non-array top-level.
// ---------------------------------------------------------------------------

const validClassComment = {
	commentId: "c-001",
	classification: "bug",
	reasoning: "The helper returns -1 for empty input instead of 0.",
};

test("classification: parses a valid single-comment array", () => {
	const result = parseClassificationVerdict(
		JSON.stringify([validClassComment]),
	);
	expect(Array.isArray(result)).toBe(true);
	expect(result[0]?.commentId).toBe("c-001");
	expect(result[0]?.classification).toBe("bug");
	expect(result[0]?.reasoning).toContain("empty input");
});

test("classification: parses an empty array (zero in-scope comments)", () => {
	const result = parseClassificationVerdict(JSON.stringify([]));
	expect(result).toEqual([]);
});

test("classification: accepts all six classification enum values", () => {
	const classes = [
		"bug",
		"non-functional",
		"nitpick",
		"false-positive",
		"question",
		"outdated",
	] as const;
	for (const classification of classes) {
		const result = parseClassificationVerdict(
			JSON.stringify([{ ...validClassComment, classification }]),
		);
		expect(result[0]?.classification).toBe(classification);
	}
});

test("classification: parses a multi-comment batch", () => {
	const batch = [
		{ commentId: "c-001", classification: "bug", reasoning: "off-by-one" },
		{
			commentId: "c-002",
			classification: "nitpick",
			reasoning: "style preference",
		},
		{
			commentId: "c-003",
			classification: "question",
			reasoning: "clarification needed",
		},
	];
	const result = parseClassificationVerdict(JSON.stringify(batch));
	expect(result.length).toBe(3);
	expect(result[1]?.classification).toBe("nitpick");
});

test("classification: fail closed — throws on invalid JSON", () => {
	expect(() => parseClassificationVerdict("{not json")).toThrow("valid JSON");
});

test("classification: fail closed — throws on missing commentId", () => {
	const missing = [{ classification: "bug", reasoning: "x" }];
	expect(() => parseClassificationVerdict(JSON.stringify(missing))).toThrow();
});

test("classification: fail closed — throws on missing classification field", () => {
	const missing = [{ commentId: "c-001", reasoning: "x" }];
	expect(() => parseClassificationVerdict(JSON.stringify(missing))).toThrow();
});

test("classification: fail closed — throws on missing reasoning field", () => {
	const missing = [{ commentId: "c-001", classification: "bug" }];
	expect(() => parseClassificationVerdict(JSON.stringify(missing))).toThrow();
});

test("classification: fail closed — throws on unknown classification enum value", () => {
	const bad = [{ ...validClassComment, classification: "enhancement" }];
	expect(() => parseClassificationVerdict(JSON.stringify(bad))).toThrow();
});

test("classification: fail closed — throws when top-level value is an object, not an array", () => {
	expect(() =>
		parseClassificationVerdict(JSON.stringify(validClassComment)),
	).toThrow();
});

test("classification: fail closed — throws when top-level value is null", () => {
	expect(() => parseClassificationVerdict(JSON.stringify(null))).toThrow();
});

test("classification: fail closed — throws on empty string input", () => {
	expect(() => parseClassificationVerdict("")).toThrow();
});

test("classification completeness requires an exact id bijection", () => {
	const verdict = parseClassificationVerdict(
		JSON.stringify([
			validClassComment,
			{ ...validClassComment, commentId: "2" },
		]),
	);
	expect(() =>
		assertClassificationComplete(verdict, ["c-001", 2]),
	).not.toThrow();
	expect(() => assertClassificationComplete(verdict, ["c-001", 2, 3])).toThrow(
		"missing: 3",
	);
	expect(() => assertClassificationComplete(verdict, ["c-001"])).toThrow(
		"extra: 2",
	);
	const first = verdict[0];
	expect(first).toBeDefined();
	if (first) {
		expect(() =>
			assertClassificationComplete([...verdict, first], ["c-001", 2]),
		).toThrow("duplicate");
	}
});
