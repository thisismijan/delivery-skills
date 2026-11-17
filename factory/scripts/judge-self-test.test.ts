import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildPromotionReport,
	corpusEntryFrom,
	scoreCandidate,
} from "./evaluation-corpus";
import { type UtilityScoring, judgeSelfTestProblem } from "./judge-self-test";
import { evaluatePairedEvidence } from "./paired-evaluation";
import { buildObservation } from "./record-routing";

const passing: UtilityScoring = {
	scoredBy: "judge",
	selfTest: {
		model: "judge-a",
		goodReference: "fixtures/good.md",
		badReference: "fixtures/bad.md",
		goodScore: 0.9,
		badScore: 0.2,
	},
};
const failing: UtilityScoring = {
	scoredBy: "judge",
	selfTest: { ...passing.selfTest, goodScore: 0.4, badScore: 0.7 },
};

describe("judgeSelfTestProblem", () => {
	test("scores from checks, or from a judge that ranks good above bad, count", () => {
		expect(judgeSelfTestProblem(undefined)).toBeUndefined();
		expect(judgeSelfTestProblem({ scoredBy: "checks" })).toBeUndefined();
		expect(judgeSelfTestProblem(passing)).toBeUndefined();
	});

	test("a judge that ranks the known-bad sample higher, or ties, is refused", () => {
		expect(judgeSelfTestProblem(failing)).toBe(
			"the judge judge-a scored the known-bad reference fixtures/bad.md (0.7) at or above the known-good reference fixtures/good.md (0.4), so its scores are refused",
		);
		expect(
			judgeSelfTestProblem({
				scoredBy: "judge",
				selfTest: { ...passing.selfTest, goodScore: 0.5, badScore: 0.5 },
			}),
		).toContain("so its scores are refused");
	});

	test("a self-test on one reference twice proves nothing and is refused", () => {
		expect(
			judgeSelfTestProblem({
				scoredBy: "judge",
				selfTest: { ...passing.selfTest, badReference: "fixtures/good.md" },
			}),
		).toContain("same reference twice");
	});
});

const hash = (digit: string) => digit.repeat(64);
function evidence(scoring?: {
	baseline?: UtilityScoring;
	candidate?: UtilityScoring;
}) {
	const controls = {
		taskFixtureHash: hash("1"),
		model: "model-x",
		environmentHash: hash("2"),
		allowedContextHash: hash("3"),
		toolsHash: hash("4"),
		outputContractHash: hash("5"),
		timeoutMs: 60_000,
	};
	const checks = [{ id: "contract", hidden: false, passed: true }];
	const run = (tree: string, utility: number, s?: UtilityScoring) => ({
		controls: { ...controls },
		managedTreeHash: hash(tree),
		utility,
		...(s ? { scoring: s } : {}),
		criticalMisses: 0,
		checks: checks.map((check) => ({ ...check })),
		metrics: {
			usage: { unit: "tokens" as const, input: 10, output: 5 },
			wallTimeMs: 1,
			repairAttempts: 0,
			deliveredCodeBytes: 1,
		},
	});
	return {
		version: 1 as const,
		candidateId: "improve-x",
		intendedEffect: "behaviour" as const,
		baseline: run("a", 1, scoring?.baseline),
		candidate: run("b", 0.95, scoring?.candidate),
		hiddenChecks: { available: false as const, reason: "none" },
		mutation: { required: false as const, reason: "none" },
	};
}

describe("improve's paired evaluation", () => {
	test("a judge that passed its self-test lets the scores count", () => {
		expect(
			evaluatePairedEvidence(
				evidence({ baseline: passing, candidate: passing }),
			).passed,
		).toBe(true);
	});

	test("a judge that failed its self-test fails the evaluation and says why", () => {
		const result = evaluatePairedEvidence(
			evidence({ baseline: failing, candidate: failing }),
		);
		expect(result.passed).toBe(false);
		expect(result.reasons).toContain(
			`candidate utility: ${judgeSelfTestProblem(failing)}`,
		);
	});

	test("arms scored in different ways are refused before comparison", () => {
		expect(() =>
			evaluatePairedEvidence(evidence({ candidate: passing })),
		).toThrow("scored the same way");
	});
});

describe("model graduation scoring", () => {
	const observation = () =>
		buildObservation({
			runId: "run-1",
			profile: {
				version: 1,
				taskId: "search",
				stage: "discover",
				workType: "search",
				reasoningDepth: "low",
				ambiguity: "low",
				blastRadius: "local",
				risk: "reversible",
				novelty: "known-pattern",
				verificationStrength: "strong",
				contextSize: "small",
				domains: ["user-interface"],
				reason: ["x"],
				promotionTriggers: ["y"],
			},
			currentModel: "sonnet",
			source: "representative-run",
			recordedAt: "2026-11-16T10:00:00.000Z",
			outcome: {
				gates: [{ name: "green", passed: true }],
				gatesPassed: true,
				repairs: 0,
				escalations: 0,
				terminal: "approve",
			},
		});

	test("a score from a judge that failed its self-test is refused", () => {
		expect(() =>
			scoreCandidate(observation(), {
				candidateModel: "fast-1",
				relativeUtility: 0.95,
				criticalMisses: 0,
				scoring: failing,
			}),
		).toThrow("Graduation score refused");
	});

	test("a stored score from a failed judge never counts toward promotion", () => {
		const entry = corpusEntryFrom(observation(), {
			candidateModel: "fast-1",
			relativeUtility: 0.95,
			criticalMisses: 0,
			taskClass: "search",
			scoring: failing,
		});
		const good = scoreCandidate(observation(), {
			candidateModel: "fast-1",
			relativeUtility: 0.95,
			criticalMisses: 0,
			scoring: passing,
		});
		expect(buildPromotionReport([entry, good]).groups[0]?.sampleSize).toBe(1);
	});
});

test("improve tells the evaluator to record how utility was scored", () => {
	const improve = readFileSync(
		join(
			import.meta.dir,
			"..",
			"..",
			"skills",
			"delivery",
			"workflows",
			"improve.md",
		),
		"utf8",
	).replace(/\s+/g, " ");
	expect(improve).toContain('"scoredBy": "judge"');
	expect(improve).toContain(
		"a judge must score a known-good reference above a known-bad one on the same task before its scores count",
	);
});
