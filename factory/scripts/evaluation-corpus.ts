import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadObservations } from "./record-routing";
import {
	type RoutingObservation,
	RoutingObservation as RoutingObservationSchema,
} from "./routing-observation";

export const CorpusEntry = z.object({
	taskId: RoutingObservationSchema.shape.profile.shape.taskId,
	runId: RoutingObservationSchema.shape.runId,
	stage: z.string().min(1),
	workType: z.string().min(1),
	allowedContext: z.object({
		size: z.enum(["small", "medium", "large"]),
		usage: RoutingObservationSchema.shape.context.shape.usage,
	}),
	expectedOutputContract: z.string().min(1),
	deterministicChecks: z.array(z.string().min(1)),
	knownImportantFindings: z.array(z.string()),
	knownForbiddenActions: z.array(z.string()),
	liveOutcome: RoutingObservationSchema.shape.currentOutcome,
	currentTier: RoutingObservationSchema.shape.currentTier,
	shadowTier: RoutingObservationSchema.shape.shadowTier,
	observation: RoutingObservationSchema,
	evaluation: z
		.object({
			candidateModel: z.string().min(1),
			relativeUtility: z.number().min(0).max(1),
			criticalMisses: z.number().int().nonnegative(),
			taskClass: z.string().min(1).optional(),
		})
		.optional(),
});
export type CorpusEntry = z.infer<typeof CorpusEntry>;

export const CandidateResult = z.object({
	candidateModel: z.string().min(1),
	relativeUtility: z.number().min(0).max(1),
	criticalMisses: z.number().int().nonnegative(),
});
export type CandidateResult = z.infer<typeof CandidateResult>;

export const PromotionGroup = z.object({
	candidateModel: z.string().min(1),
	taskClass: z.string().min(1),
	source: RoutingObservationSchema.shape.source,
	sampleSize: z.number().int().nonnegative(),
	relativeUtility: z.number().min(0).max(1),
	criticalMisses: z.number().int().nonnegative(),
});
export type PromotionGroup = z.infer<typeof PromotionGroup>;

export const PromotionReport = z.object({
	groups: z.array(PromotionGroup),
});
export type PromotionReport = z.infer<typeof PromotionReport>;

const CONTRACT: Record<string, string> = {
	search: "Return the named sources and omit unrelated files.",
	classify: "Label each item with one allowed class and a checkable reason.",
	summarise: "Summarise the supplied logs without inventing failures.",
	decompose: "Split into atomic, vertically complete tickets.",
	design: "Author the OpenSpec change without writing product code.",
	"write-tests": "Write failing tests for the accepted scenarios.",
	implement: "Make the accepted tests pass without weakening them.",
	review: "Judge the committed diff against the spec and gate evidence.",
};

export function scoreCandidate(
	observation: RoutingObservation,
	candidateResult: CandidateResult,
): CorpusEntry {
	const scored = CandidateResult.parse(candidateResult);
	return corpusEntryFrom(observation, {
		...scored,
		taskClass: observation.profile.workType,
	});
}

export function buildPromotionReport(entries: CorpusEntry[]): PromotionReport {
	const buckets = new Map<
		string,
		{
			candidateModel: string;
			taskClass: string;
			source: PromotionGroup["source"];
			utilities: number[];
			criticalMisses: number;
		}
	>();
	for (const entry of entries) {
		const evaluation = entry.evaluation;
		if (!evaluation) continue;
		const taskClass = evaluation.taskClass ?? entry.workType;
		const source = entry.observation.source;
		const key = `${evaluation.candidateModel}\0${taskClass}\0${source}`;
		const bucket = buckets.get(key) ?? {
			candidateModel: evaluation.candidateModel,
			taskClass,
			source,
			utilities: [],
			criticalMisses: 0,
		};
		bucket.utilities.push(evaluation.relativeUtility);
		bucket.criticalMisses += evaluation.criticalMisses;
		buckets.set(key, bucket);
	}
	const groups = [...buckets.values()].map((bucket) => ({
		candidateModel: bucket.candidateModel,
		taskClass: bucket.taskClass,
		source: bucket.source,
		sampleSize: bucket.utilities.length,
		relativeUtility:
			bucket.utilities.reduce((sum, value) => sum + value, 0) /
			bucket.utilities.length,
		criticalMisses: bucket.criticalMisses,
	}));
	groups.sort(
		(left, right) =>
			left.candidateModel.localeCompare(right.candidateModel) ||
			left.taskClass.localeCompare(right.taskClass) ||
			left.source.localeCompare(right.source),
	);
	return PromotionReport.parse({ groups });
}

export function corpusEntryFrom(
	observation: RoutingObservation,
	evaluation?: CorpusEntry["evaluation"],
): CorpusEntry {
	const workType = observation.profile.workType;
	return CorpusEntry.parse({
		taskId: observation.profile.taskId,
		runId: observation.runId,
		stage: observation.profile.stage,
		workType,
		allowedContext: observation.context,
		expectedOutputContract:
			CONTRACT[workType] ??
			"Complete the named task against its evidence bundle.",
		deterministicChecks: [
			"profile validates as TaskProfileInput",
			"shadow decision does not change live dispatch",
			"gate outcomes are recorded",
		],
		knownImportantFindings: observation.profile.reason,
		knownForbiddenActions: [
			"dispatch the shadow recommendation",
			"merge or close an MR",
			"transition Jira status",
		],
		liveOutcome: observation.currentOutcome,
		currentTier: observation.currentTier,
		shadowTier: observation.shadowTier,
		observation,
		evaluation,
	});
}

export function buildCorpus(observations: RoutingObservation[]): CorpusEntry[] {
	return observations.map((item) => corpusEntryFrom(item));
}

export async function writeCorpus(
	outDir: string,
	entries: CorpusEntry[],
): Promise<string> {
	const validated = CorpusEntry.array().parse(entries);
	await mkdir(outDir, { recursive: true });
	const index = validated.map((entry) => ({
		runId: entry.runId,
		taskId: entry.taskId,
		workType: entry.workType,
		shadowTier: entry.shadowTier,
		hasEvaluation: Boolean(entry.evaluation),
	}));
	await Bun.write(
		join(outDir, "index.json"),
		`${JSON.stringify({ version: 1, entries: index }, null, 2)}\n`,
	);
	for (const entry of validated) {
		const name = `${entry.runId}-${entry.taskId}.json`;
		await Bun.write(join(outDir, name), `${JSON.stringify(entry, null, 2)}\n`);
	}
	return join(outDir, "index.json");
}

if (import.meta.main) {
	const root = process.argv[2];
	if (!root) {
		console.error("usage: evaluation-corpus <routing-root> [corpus-dir]");
		process.exit(2);
	}
	try {
		const observations = await loadObservations(root);
		const entries = buildCorpus(observations);
		const outDir = process.argv[3] ?? join(root, "corpus");
		const index = await writeCorpus(outDir, entries);
		console.log(JSON.stringify({ index, count: entries.length }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
