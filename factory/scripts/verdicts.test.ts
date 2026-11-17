import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	assertClassificationComplete,
	parseAssessmentVerdict,
	parseClassificationVerdict,
	parseFeasibilityVerdict,
	parseReviewVerdict,
} from "./verdicts";

const asJson = (value: unknown) => JSON.stringify(value);

describe("holdout review verdict", () => {
	const approved = {
		satisfied: "yes",
		specFaithful: true,
		testsMeaningful: true,
		codeMatchesSpec: true,
		readyForMain: true,
		findings: [] as string[],
		shouldEscalate: false,
		reasoning: "looks right",
	};

	test("a complete approval parses and keeps its values", () => {
		const parsed = parseReviewVerdict(asJson(approved));
		expect(parsed.satisfied).toBe("yes");
		expect(parsed.readyForMain).toBe(true);
	});

	test("a satisfied value outside the enum is refused", () => {
		expect(() =>
			parseReviewVerdict(asJson({ ...approved, satisfied: "probably" })),
		).toThrow();
	});

	test("text that is not JSON is refused as invalid JSON", () => {
		expect(() => parseReviewVerdict("{oops")).toThrow("valid JSON");
	});

	test("the code-readiness dimension is required and must be a boolean", () => {
		const { readyForMain: _dropped, ...withoutReadiness } = approved;
		expect(() => parseReviewVerdict(asJson(withoutReadiness))).toThrow();
		expect(() =>
			parseReviewVerdict(asJson({ ...approved, readyForMain: "yes" })),
		).toThrow();
	});

	test.each([
		"specFaithful",
		"testsMeaningful",
		"codeMatchesSpec",
		"readyForMain",
	])("a yes verdict with %s false is refused", (dimension) => {
		expect(() =>
			parseReviewVerdict(asJson({ ...approved, [dimension]: false })),
		).toThrow("every readiness dimension");
	});

	test("a changes_requested verdict may carry a failed dimension", () => {
		const parsed = parseReviewVerdict(
			asJson({
				...approved,
				satisfied: "changes_requested",
				testsMeaningful: false,
			}),
		);
		expect(parsed.testsMeaningful).toBe(false);
	});
});

describe("ticket assessment verdict", () => {
	const goodTicket = {
		quality: "good",
		scopeFit: "atomic",
		splitRecommendation: [] as string[],
		gaps: [] as string[],
		derivedAcceptanceCriteria: ["The export includes the header row"],
		confidence: "high",
	};

	test("a good atomic ticket parses", () => {
		const parsed = parseAssessmentVerdict(asJson(goodTicket));
		expect(parsed.quality).toBe("good");
		expect(parsed.scopeFit).toBe("atomic");
	});

	test("a quality outside the enum is refused", () => {
		expect(() =>
			parseAssessmentVerdict(asJson({ ...goodTicket, quality: "fine" })),
		).toThrow();
	});

	test("an oversized ticket with a split parses with every proposed part", () => {
		const parsed = parseAssessmentVerdict(
			asJson({
				...goodTicket,
				scopeFit: "too_large",
				splitRecommendation: ["Publish the schema", "Read the schema"],
			}),
		);
		expect(parsed.scopeFit).toBe("too_large");
		expect(parsed.splitRecommendation).toEqual([
			"Publish the schema",
			"Read the schema",
		]);
	});

	test("an oversized ticket without a split is refused", () => {
		expect(() =>
			parseAssessmentVerdict(
				asJson({
					...goodTicket,
					scopeFit: "too_large",
					splitRecommendation: [],
				}),
			),
		).toThrow("concrete split recommendation");
	});

	test("an atomic ticket that proposes a split is refused", () => {
		expect(() =>
			parseAssessmentVerdict(
				asJson({ ...goodTicket, splitRecommendation: ["Part one"] }),
			),
		).toThrow();
	});

	test("a missing scope fit is refused", () => {
		const { scopeFit: _dropped, ...withoutScope } = goodTicket;
		expect(() => parseAssessmentVerdict(asJson(withoutScope))).toThrow();
	});

	test.each([
		["none", [] as string[]],
		["four", ["a", "b", "c", "d"]],
		["a blank one", ["a", "  "]],
	])("a good ticket with %s acceptance criteria is refused", (_label, list) => {
		expect(() =>
			parseAssessmentVerdict(
				asJson({ ...goodTicket, derivedAcceptanceCriteria: list }),
			),
		).toThrow("one to three");
	});

	test("a good ticket with exactly three criteria parses", () => {
		const parsed = parseAssessmentVerdict(
			asJson({ ...goodTicket, derivedAcceptanceCriteria: ["a", "b", "c"] }),
		);
		expect(parsed.derivedAcceptanceCriteria).toHaveLength(3);
	});
});

describe("feasibility verdict", () => {
	const feasibleTicket = {
		feasible: "yes",
		approachSketch: "add a column and backfill it",
		affectedAreas: [] as string[],
		contractsTouched: [] as string[],
		risks: [] as string[],
		complexitySignal: "low",
	};

	test("a feasible verdict parses", () => {
		expect(parseFeasibilityVerdict(asJson(feasibleTicket)).feasible).toBe(
			"yes",
		);
	});

	test("text that is not JSON is refused as invalid JSON", () => {
		expect(() => parseFeasibilityVerdict("{half")).toThrow("valid JSON");
	});
});

describe("comment classification verdict", () => {
	const bugComment = {
		commentId: "c-001",
		classification: "bug",
		reasoning: "Returns -1 on empty input where 0 is expected.",
		assumption: "input-is-never-empty",
	};
	const { assumption: _label, ...unlabelled } = bugComment;

	test("a one-comment array parses with its fields intact", () => {
		const [first] = parseClassificationVerdict(asJson([bugComment]));
		expect(first?.commentId).toBe("c-001");
		expect(first?.classification).toBe("bug");
		expect(first?.reasoning).toContain("empty input");
		expect(first?.assumption).toBe("input-is-never-empty");
	});

	test("an empty array parses as no comments in scope", () => {
		expect(parseClassificationVerdict("[]")).toEqual([]);
	});

	test.each([
		"bug",
		"test-gap",
		"non-functional",
		"nitpick",
		"false-positive",
		"question",
		"outdated",
	])("the %s class is accepted", (classification) => {
		const comment =
			classification === "bug" ? bugComment : { ...unlabelled, classification };
		const [first] = parseClassificationVerdict(asJson([comment]));
		expect(first?.classification).toBe(classification);
	});

	test("a batch keeps every comment in order", () => {
		const parsed = parseClassificationVerdict(
			asJson([
				{ ...bugComment, assumption: "end-index-is-inclusive" },
				{ commentId: "c-002", classification: "nitpick", reasoning: "style" },
				{ commentId: "c-003", classification: "question", reasoning: "why" },
			]),
		);
		expect(parsed.map((comment) => comment.classification)).toEqual([
			"bug",
			"nitpick",
			"question",
		]);
	});

	test("text that is not JSON is refused as invalid JSON", () => {
		expect(() => parseClassificationVerdict("{oops")).toThrow("valid JSON");
	});

	test.each(["commentId", "classification", "reasoning"])(
		"a comment without %s is refused",
		(field) => {
			const comment: Record<string, unknown> = { ...unlabelled };
			delete comment[field];
			expect(() => parseClassificationVerdict(asJson([comment]))).toThrow();
		},
	);

	test("a class outside the enum is refused", () => {
		expect(() =>
			parseClassificationVerdict(
				asJson([{ ...unlabelled, classification: "enhancement" }]),
			),
		).toThrow();
	});

	test.each([
		["a bare object", asJson(bugComment)],
		["null", "null"],
		["an empty string", ""],
	])("%s at the top level is refused", (_label, text) => {
		expect(() => parseClassificationVerdict(text)).toThrow();
	});

	test("a bug has to name the assumption it breaks", () => {
		expect(() => parseClassificationVerdict(asJson([unlabelled]))).toThrow(
			/names the assumption/,
		);
	});

	test.each(["Input Empty", "input_empty", "-empty", "a".repeat(61)])(
		"the assumption label %p is refused",
		(label) => {
			expect(() =>
				parseClassificationVerdict(
					asJson([{ ...bugComment, assumption: label }]),
				),
			).toThrow();
		},
	);

	test("an assumption on anything but a bug is refused", () => {
		expect(() =>
			parseClassificationVerdict(
				asJson([{ ...bugComment, classification: "nitpick" }]),
			),
		).toThrow(/only a bug/);
	});
});

describe("classification completeness", () => {
	const verdict = parseClassificationVerdict(
		asJson([
			{ commentId: "c-001", classification: "nitpick", reasoning: "r" },
			{ commentId: "2", classification: "question", reasoning: "r" },
		]),
	);

	test("numeric and string ids that match one to one pass", () => {
		expect(() =>
			assertClassificationComplete(verdict, ["c-001", 2]),
		).not.toThrow();
	});

	test("an expected id with no classification is reported as missing", () => {
		expect(() =>
			assertClassificationComplete(verdict, ["c-001", 2, 3]),
		).toThrow("missing: 3");
	});

	test("a classified id nobody asked for is reported as extra", () => {
		expect(() => assertClassificationComplete(verdict, ["c-001"])).toThrow(
			"extra: 2",
		);
	});

	test("a comment classified twice is refused as a duplicate", () => {
		const doubled = [...verdict, ...verdict.slice(0, 1)];
		expect(() => assertClassificationComplete(doubled, ["c-001", 2])).toThrow(
			"duplicate",
		);
	});
});

describe("verdicts command", () => {
	const script = join(import.meta.dir, "verdicts.ts");
	const run = (args: string[], stdin: string) =>
		Bun.spawnSync(["bun", script, ...args], {
			stdin: new TextEncoder().encode(stdin),
			stdout: "pipe",
			stderr: "pipe",
		});

	test("a valid verdict on stdin prints its headline value", () => {
		const result = run(
			["feasibility"],
			asJson({
				feasible: "needs_human",
				approachSketch: "",
				affectedAreas: [],
				contractsTouched: [],
				risks: [],
				complexitySignal: "high",
			}),
		);
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout.toString())).toEqual({
			valid: true,
			feasible: "needs_human",
		});
	});

	test("an invalid verdict exits 1 and an unknown kind exits 2", () => {
		expect(run(["review"], "{oops").exitCode).toBe(1);
		expect(run(["verdict"], "[]").exitCode).toBe(2);
		expect(run([], "[]").exitCode).toBe(2);
	});
});
