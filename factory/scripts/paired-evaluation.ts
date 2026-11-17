import { z } from "zod";
import {
	UtilityScoring,
	judgeSelfTestProblem,
	scoringKind,
} from "./judge-self-test";

export const PAIRED_UTILITY_THRESHOLD = 0.9;

const Sha256 = z
	.string()
	.regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");

const Controls = z.object({
	taskFixtureHash: Sha256,
	model: z.string().min(1),
	environmentHash: Sha256,
	allowedContextHash: Sha256,
	toolsHash: Sha256,
	outputContractHash: Sha256,
	timeoutMs: z.number().int().positive(),
	controllerModel: z.string().min(1).optional(),
	modelInventoryHash: Sha256.optional(),
});

const Usage = z.discriminatedUnion("unit", [
	z.object({
		unit: z.literal("tokens"),
		input: z.number().int().nonnegative(),
		output: z.number().int().nonnegative(),
	}),
	z.object({
		unit: z.literal("characters"),
		input: z.number().int().nonnegative(),
		output: z.number().int().nonnegative(),
	}),
]);

const Check = z.object({
	id: z.string().min(1),
	hidden: z.boolean(),
	passed: z.boolean(),
});

const Run = z.object({
	controls: Controls,
	managedTreeHash: Sha256,
	selectedWorkerModel: z.string().min(1).optional(),
	utility: z.number().finite().positive(),
	scoring: UtilityScoring.optional(),
	criticalMisses: z.number().int().nonnegative(),
	checks: z.array(Check).min(1),
	metrics: z.object({
		usage: Usage,
		costUsd: z.number().finite().nonnegative().optional(),
		wallTimeMs: z.number().int().nonnegative(),
		repairAttempts: z.number().int().nonnegative(),
		deliveredCodeBytes: z.number().int().nonnegative(),
	}),
});

export const PairedEvaluationEvidence = z
	.object({
		version: z.literal(1),
		candidateId: z.string().min(1),
		intendedEffect: z.enum(["behaviour", "worker-selection"]),
		baseline: Run,
		candidate: Run,
		hiddenChecks: z.discriminatedUnion("available", [
			z.object({ available: z.literal(true) }),
			z.object({
				available: z.literal(false),
				reason: z.string().min(1),
			}),
		]),
		mutation: z.discriminatedUnion("required", [
			z.object({
				required: z.literal(true),
				id: z.string().min(1),
				attempted: z.literal(true),
				caught: z.boolean(),
			}),
			z.object({
				required: z.literal(false),
				reason: z.string().min(1),
				attempted: z.boolean().optional(),
				caught: z.boolean().optional(),
			}),
		]),
	})
	.superRefine((evidence, context) => {
		if (
			JSON.stringify(evidence.baseline.controls) !==
			JSON.stringify(evidence.candidate.controls)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"baseline and candidate controls must match exactly; only the managed skill tree may vary",
			});
		}
		if (
			evidence.baseline.managedTreeHash === evidence.candidate.managedTreeHash
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "baseline and candidate managed tree hashes must differ",
			});
		}
		if (
			scoringKind(evidence.baseline.scoring) !==
			scoringKind(evidence.candidate.scoring)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"baseline and candidate utility must be scored the same way, both by checks or both by a judge",
			});
		}
		if (
			evidence.baseline.metrics.usage.unit !==
			evidence.candidate.metrics.usage.unit
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "baseline and candidate usage units must match",
			});
		}
		if (
			(evidence.baseline.metrics.costUsd === undefined) !==
			(evidence.candidate.metrics.costUsd === undefined)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "cost must be recorded for both runs or neither run",
			});
		}
		const baselineChecks = new Map(
			evidence.baseline.checks.map((check) => [check.id, check]),
		);
		const candidateChecks = new Map(
			evidence.candidate.checks.map((check) => [check.id, check]),
		);
		if (
			baselineChecks.size !== evidence.baseline.checks.length ||
			candidateChecks.size !== evidence.candidate.checks.length
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "check ids must be unique within each run",
			});
		}
		if (
			baselineChecks.size !== candidateChecks.size ||
			[...baselineChecks].some(
				([id, check]) => candidateChecks.get(id)?.hidden !== check.hidden,
			)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"baseline and candidate must run the same checks with the same visibility",
			});
		}
		if (evidence.baseline.checks.some((check) => !check.passed)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "the baseline must pass every required check",
			});
		}
		if (evidence.baseline.criticalMisses !== 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "the baseline must have zero Critical misses",
			});
		}
		const hiddenCount = evidence.baseline.checks.filter(
			(check) => check.hidden,
		).length;
		if (evidence.hiddenChecks.available && hiddenCount === 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"hidden checks marked available require at least one hidden check",
			});
		}
		if (!evidence.hiddenChecks.available && hiddenCount > 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"hidden checks marked unavailable cannot include a hidden check",
			});
		}
		if (
			evidence.intendedEffect === "worker-selection" &&
			(!evidence.baseline.selectedWorkerModel ||
				!evidence.candidate.selectedWorkerModel)
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"worker-selection evidence must record both selected worker models",
			});
		}
	});
export type PairedEvaluationEvidence = z.infer<typeof PairedEvaluationEvidence>;

export interface PairedEvaluationResult {
	candidateId: string;
	passed: boolean;
	relativeUtility: number;
	criticalMisses: number;
	checksPassed: number;
	checksTotal: number;
	mutationCaught: boolean | null;
	reasons: string[];
	efficiency: {
		usageUnit: "tokens" | "characters";
		inputDelta: number;
		outputDelta: number;
		costUsdDelta: number | null;
		wallTimeMsDelta: number;
		repairAttemptsDelta: number;
		deliveredCodeBytesDelta: number;
	};
}

export function evaluatePairedEvidence(input: unknown): PairedEvaluationResult {
	const evidence = PairedEvaluationEvidence.parse(input);
	const relativeUtility =
		evidence.candidate.utility / evidence.baseline.utility;
	const candidateChecksPassed = evidence.candidate.checks.filter(
		(check) => check.passed,
	).length;
	const reasons: string[] = [];
	for (const [arm, run] of [
		["baseline", evidence.baseline],
		["candidate", evidence.candidate],
	] as const) {
		const problem = judgeSelfTestProblem(run.scoring);
		if (problem) reasons.push(`${arm} utility: ${problem}`);
	}
	if (relativeUtility < PAIRED_UTILITY_THRESHOLD) {
		reasons.push(
			`relative utility ${relativeUtility.toFixed(3)} is below ${PAIRED_UTILITY_THRESHOLD.toFixed(1)}`,
		);
	}
	if (evidence.candidate.criticalMisses > 0) {
		reasons.push(
			`candidate has ${evidence.candidate.criticalMisses} Critical miss(es)`,
		);
	}
	if (candidateChecksPassed !== evidence.candidate.checks.length) {
		reasons.push(
			`candidate passed ${candidateChecksPassed}/${evidence.candidate.checks.length} required checks`,
		);
	}
	if (evidence.mutation.required && !evidence.mutation.caught) {
		reasons.push("required mutation was not caught");
	}
	const baselineUsage = evidence.baseline.metrics.usage;
	const candidateUsage = evidence.candidate.metrics.usage;
	return {
		candidateId: evidence.candidateId,
		passed: reasons.length === 0,
		relativeUtility,
		criticalMisses: evidence.candidate.criticalMisses,
		checksPassed: candidateChecksPassed,
		checksTotal: evidence.candidate.checks.length,
		mutationCaught: evidence.mutation.required
			? evidence.mutation.caught
			: null,
		reasons,
		efficiency: {
			usageUnit: baselineUsage.unit,
			inputDelta: candidateUsage.input - baselineUsage.input,
			outputDelta: candidateUsage.output - baselineUsage.output,
			costUsdDelta:
				evidence.baseline.metrics.costUsd === undefined ||
				evidence.candidate.metrics.costUsd === undefined
					? null
					: evidence.candidate.metrics.costUsd -
						evidence.baseline.metrics.costUsd,
			wallTimeMsDelta:
				evidence.candidate.metrics.wallTimeMs -
				evidence.baseline.metrics.wallTimeMs,
			repairAttemptsDelta:
				evidence.candidate.metrics.repairAttempts -
				evidence.baseline.metrics.repairAttempts,
			deliveredCodeBytesDelta:
				evidence.candidate.metrics.deliveredCodeBytes -
				evidence.baseline.metrics.deliveredCodeBytes,
		},
	};
}

export const PAIRED_RUNS_PER_ARM = 3;
export const PAIRED_MAX_RUNS_PER_ARM = 5;
export const PAIRED_CLOSE_MARGIN = 0.05;

export const PairOrder = z.enum(["baseline-first", "candidate-first"]);

// Pair i runs baseline first when i is even, so neither arm always runs on a
// warm or a cold machine.
export function expectedOrder(index: number): z.infer<typeof PairOrder> {
	return index % 2 === 0 ? "baseline-first" : "candidate-first";
}

export const RepeatedPairedEvidence = z
	.object({
		version: z.literal(2),
		candidateId: z.string().min(1),
		intendedEffect: z.enum(["behaviour", "worker-selection"]),
		hiddenChecks: PairedEvaluationEvidence.innerType().shape.hiddenChecks,
		mutation: PairedEvaluationEvidence.innerType().shape.mutation,
		pairs: z
			.array(z.object({ order: PairOrder, baseline: Run, candidate: Run }))
			.refine(
				(pairs) =>
					pairs.length === PAIRED_RUNS_PER_ARM ||
					pairs.length === PAIRED_MAX_RUNS_PER_ARM,
				`a paired evaluation has ${PAIRED_RUNS_PER_ARM} runs per arm, or ${PAIRED_MAX_RUNS_PER_ARM} after a close call`,
			),
	})
	.superRefine((evidence, context) => {
		const first = evidence.pairs[0];
		evidence.pairs.forEach((pair, index) => {
			if (pair.order !== expectedOrder(index)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					message: `run ${index + 1} must be ${expectedOrder(index)}; the arms alternate`,
				});
			}
			if (!first || index === 0) return;
			if (
				JSON.stringify(pair.baseline.controls) !==
				JSON.stringify(first.baseline.controls)
			) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					message: `run ${index + 1} controls differ from run 1`,
				});
			}
			for (const arm of ["baseline", "candidate"] as const) {
				if (pair[arm].managedTreeHash !== first[arm].managedTreeHash) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						message: `run ${index + 1} ${arm} managed tree differs from run 1`,
					});
				}
			}
		});
	});
export type RepeatedPairedEvidence = z.infer<typeof RepeatedPairedEvidence>;

export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[middle] as number)
		: ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

// One-sided sign test: the chance of at least `wins` of `n` pairs clearing the
// bar if each were a coin flip. Diagnostic only; 3 to 5 pairs cannot reach
// conventional significance.
export function signTestP(wins: number, n: number): number {
	let total = 0;
	for (let k = wins; k <= n; k += 1) {
		let ways = 1;
		for (let i = 0; i < k; i += 1) ways = (ways * (n - i)) / (i + 1);
		total += ways;
	}
	return total / 2 ** n;
}

export interface RepeatedPairedResult {
	candidateId: string;
	decision: "pass" | "fail" | "extend";
	passed: boolean;
	runsPerArm: number;
	extendToRunsPerArm: number | null;
	relativeUtility: number;
	pairsClearingBar: number;
	signTestP: number;
	criticalMisses: number;
	reasons: string[];
	efficiency: PairedEvaluationResult["efficiency"];
	pairs: {
		order: z.infer<typeof PairOrder>;
		relativeUtility: number;
		passed: boolean;
	}[];
}

const UTILITY_REASON = /^relative utility /;

export function evaluateRepeatedPairs(input: unknown): RepeatedPairedResult {
	const evidence = RepeatedPairedEvidence.parse(input);
	const results = evidence.pairs.map((pair) =>
		evaluatePairedEvidence({
			version: 1,
			candidateId: evidence.candidateId,
			intendedEffect: evidence.intendedEffect,
			baseline: pair.baseline,
			candidate: pair.candidate,
			hiddenChecks: evidence.hiddenChecks,
			mutation: evidence.mutation,
		}),
	);
	const n = results.length;
	const relativeUtility =
		median(evidence.pairs.map((pair) => pair.candidate.utility)) /
		median(evidence.pairs.map((pair) => pair.baseline.utility));
	const pairsClearingBar = results.filter(
		(result) => result.relativeUtility >= PAIRED_UTILITY_THRESHOLD,
	).length;
	const reasons = [
		...new Set(
			results.flatMap((result, index) =>
				result.reasons
					.filter((reason) => !UTILITY_REASON.test(reason))
					.map((reason) => `run ${index + 1}: ${reason}`),
			),
		),
	];
	const medianClears = relativeUtility >= PAIRED_UTILITY_THRESHOLD;
	const majorityClears = pairsClearingBar * 2 > n;
	// The epsilon keeps a ratio exactly one margin from the bar clear despite
	// floating-point subtraction.
	const close =
		Math.abs(relativeUtility - PAIRED_UTILITY_THRESHOLD) <
			PAIRED_CLOSE_MARGIN - 1e-9 || medianClears !== majorityClears;
	let decision: RepeatedPairedResult["decision"];
	if (reasons.length > 0) {
		decision = "fail";
	} else if (close && n < PAIRED_MAX_RUNS_PER_ARM) {
		decision = "extend";
	} else if (medianClears && majorityClears) {
		decision = "pass";
	} else {
		decision = "fail";
		if (!medianClears) {
			reasons.push(
				`median relative utility ${relativeUtility.toFixed(3)} is below ${PAIRED_UTILITY_THRESHOLD.toFixed(1)}`,
			);
		}
		if (!majorityClears) {
			reasons.push(
				`only ${pairsClearingBar} of ${n} runs cleared ${PAIRED_UTILITY_THRESHOLD.toFixed(1)}`,
			);
		}
	}
	const medianOf = (pick: (result: PairedEvaluationResult) => number) =>
		median(results.map(pick));
	const costs = results.map((result) => result.efficiency.costUsdDelta);
	return {
		candidateId: evidence.candidateId,
		decision,
		passed: decision === "pass",
		runsPerArm: n,
		extendToRunsPerArm: decision === "extend" ? PAIRED_MAX_RUNS_PER_ARM : null,
		relativeUtility,
		pairsClearingBar,
		signTestP: signTestP(pairsClearingBar, n),
		criticalMisses: Math.max(...results.map((result) => result.criticalMisses)),
		reasons,
		efficiency: {
			usageUnit: results[0]?.efficiency.usageUnit ?? "tokens",
			inputDelta: medianOf((result) => result.efficiency.inputDelta),
			outputDelta: medianOf((result) => result.efficiency.outputDelta),
			costUsdDelta: costs.every((cost) => cost !== null)
				? median(costs as number[])
				: null,
			wallTimeMsDelta: medianOf((result) => result.efficiency.wallTimeMsDelta),
			repairAttemptsDelta: medianOf(
				(result) => result.efficiency.repairAttemptsDelta,
			),
			deliveredCodeBytesDelta: medianOf(
				(result) => result.efficiency.deliveredCodeBytesDelta,
			),
		},
		pairs: results.map((result, index) => ({
			order: evidence.pairs[index]?.order ?? expectedOrder(index),
			relativeUtility: result.relativeUtility,
			passed: result.relativeUtility >= PAIRED_UTILITY_THRESHOLD,
		})),
	};
}

if (import.meta.main) {
	const evidenceFile = process.argv[2];
	const resultFile = process.argv[3];
	if (!evidenceFile) {
		console.error(
			"usage: paired-evaluation <paired-evidence.json> [paired-result.json]",
		);
		process.exit(2);
	}
	try {
		const input = await Bun.file(evidenceFile).json();
		if (input?.version !== 2) {
			throw new Error(
				`a paired evaluation needs version 2 evidence with ${PAIRED_RUNS_PER_ARM} runs per arm; one run per arm is not evidence`,
			);
		}
		const result = evaluateRepeatedPairs(input);
		const output = `${JSON.stringify(result, null, 2)}\n`;
		if (resultFile) await Bun.write(resultFile, output);
		else process.stdout.write(output);
		if (result.decision === "extend") process.exit(3);
		if (!result.passed) process.exit(1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
