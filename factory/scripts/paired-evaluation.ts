import { z } from "zod";

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
		const result = evaluatePairedEvidence(await Bun.file(evidenceFile).json());
		const output = `${JSON.stringify(result, null, 2)}\n`;
		if (resultFile) await Bun.write(resultFile, output);
		else process.stdout.write(output);
		if (!result.passed) process.exit(1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
