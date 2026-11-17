import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	PAIRED_CLOSE_MARGIN,
	PAIRED_MAX_RUNS_PER_ARM,
	PAIRED_RUNS_PER_ARM,
	PAIRED_UTILITY_THRESHOLD,
	evaluatePairedEvidence,
	evaluateRepeatedPairs,
	expectedOrder,
	median,
	signTestP,
} from "./paired-evaluation";

const hash = (digit: string) => digit.repeat(64);

function evidence() {
	const controls = {
		taskFixtureHash: hash("1"),
		model: "claude-opus-5.5",
		environmentHash: hash("2"),
		allowedContextHash: hash("3"),
		toolsHash: hash("4"),
		outputContractHash: hash("5"),
		timeoutMs: 60_000,
	};
	const checks = [
		{ id: "contract", hidden: false, passed: true },
		{ id: "security-boundary", hidden: true, passed: true },
	];
	return {
		version: 1 as const,
		candidateId: "improve-20261018-smallest-complete-change",
		intendedEffect: "behaviour" as const,
		baseline: {
			controls,
			managedTreeHash: hash("a"),
			utility: 1,
			criticalMisses: 0,
			checks,
			metrics: {
				usage: { unit: "tokens" as const, input: 1_000, output: 500 },
				costUsd: 1.5,
				wallTimeMs: 20_000,
				repairAttempts: 1,
				deliveredCodeBytes: 800,
			},
		},
		candidate: {
			controls: { ...controls },
			managedTreeHash: hash("b"),
			utility: 0.92,
			criticalMisses: 0,
			checks: checks.map((check) => ({ ...check })),
			metrics: {
				usage: { unit: "tokens" as const, input: 900, output: 400 },
				costUsd: 1.2,
				wallTimeMs: 18_000,
				repairAttempts: 0,
				deliveredCodeBytes: 700,
			},
		},
		hiddenChecks: { available: true as const },
		mutation: {
			required: true as const,
			id: "remove-security-check",
			attempted: true as const,
			caught: true,
		},
	};
}

test("a paired candidate clears the quality gates and reports efficiency deltas", () => {
	const result = evaluatePairedEvidence(evidence());
	expect(PAIRED_UTILITY_THRESHOLD).toBe(0.9);
	expect(result.passed).toBe(true);
	expect(result.relativeUtility).toBe(0.92);
	expect(result.reasons).toEqual([]);
	expect(result.efficiency).toMatchObject({
		usageUnit: "tokens",
		inputDelta: -100,
		outputDelta: -100,
		wallTimeMsDelta: -2_000,
		repairAttemptsDelta: -1,
		deliveredCodeBytesDelta: -100,
	});
	expect(result.efficiency.costUsdDelta).toBeCloseTo(-0.3);
});

test("mismatched controls fail closed instead of producing a score", () => {
	const input = evidence();
	input.candidate.controls.model = "a-different-model";
	expect(() => evaluatePairedEvidence(input)).toThrow(
		"baseline and candidate controls must match exactly",
	);
});

test.each([
	["positive infinity", Number.POSITIVE_INFINITY],
	["not a number", Number.NaN],
])("non-finite %s utility is rejected", (_label, utility) => {
	const input = evidence();
	input.candidate.utility = utility;
	expect(() => evaluatePairedEvidence(input)).toThrow();
});

test("non-finite cost is rejected", () => {
	const input = evidence();
	input.candidate.metrics.costUsd = Number.POSITIVE_INFINITY;
	expect(() => evaluatePairedEvidence(input)).toThrow();
});

test("the runs must use the same checks and visibility", () => {
	const input = evidence();
	input.candidate.checks[1] = {
		id: "different-check",
		hidden: true,
		passed: true,
	};
	expect(() => evaluatePairedEvidence(input)).toThrow(
		"baseline and candidate must run the same checks",
	);
});

test("hidden-check availability must agree with the recorded checks", () => {
	const input = evidence();
	const baselineHidden = input.baseline.checks[1];
	const candidateHidden = input.candidate.checks[1];
	if (!baselineHidden || !candidateHidden)
		throw new Error("hidden fixture missing");
	baselineHidden.hidden = false;
	candidateHidden.hidden = false;
	expect(() => evaluatePairedEvidence(input)).toThrow(
		"hidden checks marked available require at least one hidden check",
	);
});

test("quality, Critical misses, checks, and mutation are independent gates", () => {
	const input = evidence();
	input.candidate.utility = 0.89;
	input.candidate.criticalMisses = 1;
	const hiddenCheck = input.candidate.checks[1];
	if (!hiddenCheck) throw new Error("hidden fixture missing");
	hiddenCheck.passed = false;
	input.mutation.caught = false;
	const result = evaluatePairedEvidence(input);
	expect(result.passed).toBe(false);
	expect(result.reasons).toEqual([
		"relative utility 0.890 is below 0.9",
		"candidate has 1 Critical miss(es)",
		"candidate passed 1/2 required checks",
		"required mutation was not caught",
	]);
});

test("an unavailable mutation needs a reason and does not claim coverage", () => {
	const input = evidence();
	const withoutMutation = {
		...input,
		mutation: {
			required: false as const,
			reason: "the candidate changes prose-only orchestration",
		},
	};
	const result = evaluatePairedEvidence(withoutMutation);
	expect(result.passed).toBe(true);
	expect(result.mutationCaught).toBeNull();
	expect(() =>
		evaluatePairedEvidence({
			...withoutMutation,
			mutation: { required: false, reason: "" },
		}),
	).toThrow();
});

test("worker-selection evidence records both selected workers", () => {
	const input = evidence();
	expect(() =>
		evaluatePairedEvidence({
			...input,
			intendedEffect: "worker-selection",
		}),
	).toThrow("must record both selected worker models");
	const result = evaluatePairedEvidence({
		...input,
		intendedEffect: "worker-selection",
		baseline: {
			...input.baseline,
			selectedWorkerModel: "claude-sonnet-5.5",
		},
		candidate: {
			...input.candidate,
			selectedWorkerModel: "muse-spark-1.3-medium",
		},
	});
	expect(result.passed).toBe(true);
});

function repeated(candidateUtilities: number[]) {
	const single = evidence();
	return {
		version: 2 as const,
		candidateId: single.candidateId,
		intendedEffect: single.intendedEffect,
		hiddenChecks: single.hiddenChecks,
		mutation: single.mutation,
		pairs: candidateUtilities.map((utility, index) => ({
			order: expectedOrder(index),
			baseline: structuredClone(single.baseline),
			candidate: { ...structuredClone(single.candidate), utility },
		})),
	};
}

async function runCli(input: unknown) {
	const dir = await mkdtemp(join(tmpdir(), "paired-evaluation-"));
	try {
		const evidenceFile = join(dir, "evidence.json");
		const resultFile = join(dir, "result.json");
		await writeFile(evidenceFile, JSON.stringify(input));
		const proc = Bun.spawn(
			[
				process.execPath,
				"run",
				join(import.meta.dir, "paired-evaluation.ts"),
				evidenceFile,
				resultFile,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const code = await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		const result = await readFile(resultFile, "utf8")
			.then((text) => JSON.parse(text) as Record<string, unknown>)
			.catch(() => null);
		return { code, stderr, result };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test("the CLI writes a failed result and exits non-zero", async () => {
	const { code, result } = await runCli(repeated([0.5, 0.5, 0.5]));
	expect(code).toBe(1);
	expect(result).toMatchObject({
		decision: "fail",
		passed: false,
		reasons: [
			"median relative utility 0.500 is below 0.9",
			"only 0 of 3 runs cleared 0.9",
		],
	});
});

test("the CLI refuses one run per arm and exits 3 on a close call", async () => {
	const single = await runCli(evidence());
	expect(single.code).toBe(1);
	expect(single.result).toBeNull();
	expect(single.stderr).toContain("one run per arm is not evidence");
	const close = await runCli(repeated([0.92, 0.88, 0.91]));
	expect(close.code).toBe(3);
	expect(close.result).toMatchObject({
		decision: "extend",
		extendToRunsPerArm: 5,
	});
});

test("a clear result after three runs per arm decides without more runs", () => {
	const pass = evaluateRepeatedPairs(repeated([1, 0.98, 1.02]));
	expect(pass).toMatchObject({
		decision: "pass",
		passed: true,
		runsPerArm: 3,
		extendToRunsPerArm: null,
		pairsClearingBar: 3,
	});
	expect(pass.signTestP).toBe(0.125);
	expect(evaluateRepeatedPairs(repeated([0.6, 0.7, 0.65]))).toMatchObject({
		decision: "fail",
		extendToRunsPerArm: null,
	});
});

test("a ratio exactly one margin from the bar is clear, not close", () => {
	expect(evaluateRepeatedPairs(repeated([0.95, 0.95, 0.95])).decision).toBe(
		"pass",
	);
	expect(evaluateRepeatedPairs(repeated([0.85, 0.85, 0.85])).decision).toBe(
		"fail",
	);
	expect(evaluateRepeatedPairs(repeated([0.949, 0.95, 0.949])).decision).toBe(
		"extend",
	);
});

test("a close call extends to five runs per arm and five always decides", () => {
	const close = evaluateRepeatedPairs(repeated([0.93, 0.85, 0.94]));
	expect(close).toMatchObject({ decision: "extend", extendToRunsPerArm: 5 });
	expect(close.reasons).toEqual([]);
	const split = evaluateRepeatedPairs(repeated([1, 0.5, 0.5]));
	expect(split.decision).toBe("fail");
	const disagree = evaluateRepeatedPairs(repeated([1.2, 1.2, 0.5]));
	expect(disagree.decision).toBe("pass");
	expect(
		evaluateRepeatedPairs(repeated([0.93, 0.85, 0.94, 0.95, 0.91])),
	).toMatchObject({
		decision: "pass",
		runsPerArm: 5,
		extendToRunsPerArm: null,
	});
	expect(
		evaluateRepeatedPairs(repeated([0.93, 0.85, 0.94, 0.8, 0.86])).decision,
	).toBe("fail");
	expect(() => evaluateRepeatedPairs(repeated([1, 1, 1, 1]))).toThrow(
		"3 runs per arm, or 5 after a close call",
	);
	expect(() => evaluateRepeatedPairs(repeated([1, 1, 1, 1, 1, 1]))).toThrow();
});

function pairAt(input: ReturnType<typeof repeated>, index: number) {
	const pair = input.pairs[index];
	if (!pair) throw new Error(`no run ${index + 1}`);
	return pair;
}

test("a median that disagrees with the run count is a close call", () => {
	const input = repeated([0.6, 0.95, 0.6]);
	pairAt(input, 0).baseline.utility = 0.5;
	const result = evaluateRepeatedPairs(input);
	expect(result.pairsClearingBar).toBe(2);
	expect(result.relativeUtility).toBeCloseTo(0.6);
	expect(result.decision).toBe("extend");
});

test("the arms alternate and every run keeps the same controls and trees", () => {
	const swapped = repeated([1, 1, 1]);
	pairAt(swapped, 1).order = "baseline-first";
	expect(() => evaluateRepeatedPairs(swapped)).toThrow(
		"run 2 must be candidate-first",
	);
	const drifted = repeated([1, 1, 1]);
	pairAt(drifted, 2).candidate.managedTreeHash = hash("c");
	expect(() => evaluateRepeatedPairs(drifted)).toThrow(
		"run 3 candidate managed tree differs from run 1",
	);
});

test("a hard gate in any run fails the evaluation without extending", () => {
	const input = repeated([0.92, 0.88, 0.91]);
	pairAt(input, 1).candidate.criticalMisses = 1;
	const result = evaluateRepeatedPairs(input);
	expect(result.decision).toBe("fail");
	expect(result.reasons).toEqual(["run 2: candidate has 1 Critical miss(es)"]);
});

test("median and sign test helpers", () => {
	expect(median([3, 1, 2])).toBe(2);
	expect(median([4, 1, 3, 2])).toBe(2.5);
	expect(signTestP(3, 3)).toBe(0.125);
	expect(signTestP(0, 5)).toBe(1);
	expect(signTestP(4, 5)).toBe(6 / 32);
});

test("improve describes the repeated runs the evaluator enforces", () => {
	const improve = readFileSync(
		join(import.meta.dir, "../../skills/delivery/workflows/improve.md"),
		"utf8",
	).replace(/\s+/g, " ");
	expect(improve).toContain(
		`Run each arm ${PAIRED_RUNS_PER_ARM} times before adversarial evaluation, alternating which arm goes first`,
	);
	expect(improve).toContain("One run per arm is noise, not evidence.");
	expect(improve).toContain(
		`a run count other than ${PAIRED_RUNS_PER_ARM} or ${PAIRED_MAX_RUNS_PER_ARM}`,
	);
	expect(improve).toContain(
		`the median ratio is within ${PAIRED_CLOSE_MARGIN} of the bar, or it disagrees with the run count`,
	);
	expect(improve).toContain(
		`Run ${PAIRED_MAX_RUNS_PER_ARM - PAIRED_RUNS_PER_ARM} more runs per arm`,
	);
	expect(improve).toContain("Five runs per arm always decide; never run more.");
	expect(improve).toContain(
		`${PAIRED_UTILITY_THRESHOLD * 100} percent of baseline`,
	);
	expect(improve).toContain("Write `paired-plan.json` as version 2");
});
