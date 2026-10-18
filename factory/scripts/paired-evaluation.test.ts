import { expect, test } from "bun:test";
import {
	PAIRED_UTILITY_THRESHOLD,
	evaluatePairedEvidence,
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
	input.baseline.checks[1]!.hidden = false;
	input.candidate.checks[1]!.hidden = false;
	expect(() => evaluatePairedEvidence(input)).toThrow(
		"hidden checks marked available require at least one hidden check",
	);
});

test("quality, Critical misses, checks, and mutation are independent gates", () => {
	const input = evidence();
	input.candidate.utility = 0.89;
	input.candidate.criticalMisses = 1;
	input.candidate.checks[1]!.passed = false;
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
