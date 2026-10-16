import {
	CorpusEntry,
	type CorpusEntry as CorpusEntryType,
} from "./evaluation-corpus";
import type { ModelCatalogue } from "./model-catalogue";
import {
	ALWAYS_FRONTIER_DOMAINS,
	HOLD_OUT_STAGES,
	isFastEligible,
} from "./shadow-route";
import type { FastEligibleFields } from "./shadow-route";
import type { TaskProfileInput } from "./task-profile";

export const FAST_RELATIVE_UTILITY_THRESHOLD = 0.9;
export const MIN_EVALUATED_FAST_SAMPLES = 5;

export const FAST_SAFETY_FLOORS = [
	"auth",
	"migration",
	"concurrency",
	"distributed-state",
	"weak-verification",
	"holdout",
] as const;
export type FastSafetyFloor = (typeof FAST_SAFETY_FLOORS)[number];

export type FastDispatchProfile = FastEligibleFields &
	Partial<Pick<TaskProfileInput, "domains" | "stage">>;

export interface FastDispatchVerdict {
	allowed: boolean;
	candidateModel: string | null;
	sampleSize: number;
	relativeUtility: number | null;
	criticalMisses: number;
	reason: string;
}

export interface PromotionApproval {
	candidateModel: string;
}

export interface PromotionVerdict {
	candidateModel: string;
	evidenceCleared: boolean;
	availability: "live" | "evaluation-only";
	sampleSize: number;
	relativeUtility: number | null;
	criticalMisses: number;
	reason: string;
}

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function namedSafetyFloor(
	profile: FastDispatchProfile,
): FastSafetyFloor | null {
	const domains = profile.domains ?? [];
	for (const floor of FAST_SAFETY_FLOORS) {
		if (floor === "weak-verification") {
			if (profile.verificationStrength === "weak") return floor;
			continue;
		}
		if (floor === "holdout") {
			if (
				profile.workType === "review" &&
				profile.stage !== undefined &&
				HOLD_OUT_STAGES.has(profile.stage)
			) {
				return floor;
			}
			continue;
		}
		if (ALWAYS_FRONTIER_DOMAINS.has(floor) && domains.includes(floor)) {
			return floor;
		}
	}
	return null;
}

function representativeExactScores(
	entries: CorpusEntryType[],
	candidateModel: string,
	workType?: string,
): CorpusEntryType[] {
	return entries.filter((entry) => {
		if (!entry.evaluation) return false;
		if (entry.evaluation.candidateModel !== candidateModel) return false;
		if (entry.observation.source !== "representative-run") return false;
		if (!isFastEligible(entry.observation.profile)) return false;
		if (workType && entry.workType !== workType) return false;
		return true;
	});
}

function scoredStats(evaluated: CorpusEntryType[]): {
	sampleSize: number;
	relativeUtility: number | null;
	criticalMisses: number;
} {
	const sampleSize = evaluated.length;
	const criticalMisses = evaluated.reduce(
		(sum, entry) => sum + (entry.evaluation?.criticalMisses ?? 0),
		0,
	);
	const relativeUtility =
		sampleSize === 0
			? null
			: mean(evaluated.map((entry) => entry.evaluation?.relativeUtility ?? 0));
	return { sampleSize, relativeUtility, criticalMisses };
}

function evidenceCleared(stats: {
	sampleSize: number;
	relativeUtility: number | null;
	criticalMisses: number;
}): boolean {
	return (
		stats.sampleSize >= MIN_EVALUATED_FAST_SAMPLES &&
		stats.criticalMisses === 0 &&
		stats.relativeUtility !== null &&
		stats.relativeUtility >= FAST_RELATIVE_UTILITY_THRESHOLD
	);
}

export function evaluateFastDispatch(
	entries: CorpusEntryType[],
	profile?: FastDispatchProfile,
	candidateModel?: string,
): FastDispatchVerdict {
	if (profile) {
		const floor = namedSafetyFloor(profile);
		if (floor) {
			return {
				allowed: false,
				candidateModel: candidateModel ?? null,
				sampleSize: 0,
				relativeUtility: null,
				criticalMisses: 0,
				reason: `the ${floor} safety floor blocks a fast model for this task`,
			};
		}
		if (!isFastEligible(profile)) {
			return {
				allowed: false,
				candidateModel: candidateModel ?? null,
				sampleSize: 0,
				relativeUtility: null,
				criticalMisses: 0,
				reason:
					"this task is not reversible, local, and strongly verified mechanical work",
			};
		}
	}
	if (!candidateModel) {
		return {
			allowed: false,
			candidateModel: null,
			sampleSize: 0,
			relativeUtility: null,
			criticalMisses: 0,
			reason:
				"an exact candidate model is required; scores cannot be pooled across models",
		};
	}
	const evaluated = representativeExactScores(
		entries,
		candidateModel,
		profile?.workType,
	);
	const stats = scoredStats(evaluated);
	if (stats.sampleSize < MIN_EVALUATED_FAST_SAMPLES) {
		return {
			allowed: false,
			candidateModel,
			sampleSize: stats.sampleSize,
			relativeUtility: null,
			criticalMisses: stats.criticalMisses,
			reason: `need ${MIN_EVALUATED_FAST_SAMPLES} scored reversible tasks before a fast model may run; have ${stats.sampleSize}`,
		};
	}
	if (stats.criticalMisses > 0) {
		return {
			allowed: false,
			candidateModel,
			sampleSize: stats.sampleSize,
			relativeUtility: stats.relativeUtility,
			criticalMisses: stats.criticalMisses,
			reason: "a scored task had a critical miss, so fast models stay off",
		};
	}
	if (
		stats.relativeUtility === null ||
		stats.relativeUtility < FAST_RELATIVE_UTILITY_THRESHOLD
	) {
		return {
			allowed: false,
			candidateModel,
			sampleSize: stats.sampleSize,
			relativeUtility: stats.relativeUtility,
			criticalMisses: stats.criticalMisses,
			reason: `mean relative utility ${(stats.relativeUtility ?? 0).toFixed(2)} is below the 90 percent bar`,
		};
	}
	return {
		allowed: true,
		candidateModel,
		sampleSize: stats.sampleSize,
		relativeUtility: stats.relativeUtility,
		criticalMisses: 0,
		reason: "reversible, strongly verified work cleared the 90 percent bar",
	};
}

export function evaluatePromotion(
	entries: CorpusEntryType[],
	candidateModel: string,
	options?: {
		approval?: PromotionApproval | null;
		rankings?: unknown;
	},
): PromotionVerdict {
	void options?.rankings;
	const stats = scoredStats(representativeExactScores(entries, candidateModel));
	const base = {
		candidateModel,
		sampleSize: stats.sampleSize,
		relativeUtility: stats.relativeUtility,
		criticalMisses: stats.criticalMisses,
	};
	if (!evidenceCleared(stats)) {
		return {
			...base,
			evidenceCleared: false,
			availability: "evaluation-only",
			reason:
				stats.sampleSize < MIN_EVALUATED_FAST_SAMPLES
					? `need ${MIN_EVALUATED_FAST_SAMPLES} scored reversible tasks before a fast model may run; have ${stats.sampleSize}`
					: stats.criticalMisses > 0
						? "a scored task had a critical miss, so fast models stay off"
						: `mean relative utility ${(stats.relativeUtility ?? 0).toFixed(2)} is below the 90 percent bar`,
		};
	}
	if (options?.approval?.candidateModel !== candidateModel) {
		return {
			...base,
			evidenceCleared: true,
			availability: "evaluation-only",
			reason:
				"an exact operator promotion approval naming this candidate is required before live availability can change",
		};
	}
	return {
		...base,
		evidenceCleared: true,
		availability: "live",
		reason:
			"representative reversible work cleared the 90 percent bar and the operator approved this candidate",
	};
}

export function applyFastPromotion(
	catalogue: ModelCatalogue,
	verdict: PromotionVerdict,
): ModelCatalogue {
	const next = structuredClone(catalogue);
	if (verdict.availability !== "live") return next;
	for (const candidate of next.tiers.fast.candidates) {
		if (candidate.id === verdict.candidateModel) {
			candidate.availability = "live";
		}
	}
	return next;
}

export function parseCorpusEntries(input: unknown): CorpusEntryType[] {
	return CorpusEntry.array().parse(input);
}

if (import.meta.main) {
	const corpusFile = process.argv[2];
	const candidateModel = process.argv[3];
	if (!corpusFile || !candidateModel) {
		console.error(
			"usage: fast-dispatch <corpus-entries.json> <candidate-model>",
		);
		process.exit(2);
	}
	try {
		const verdict = evaluateFastDispatch(
			parseCorpusEntries(await Bun.file(corpusFile).json()),
			undefined,
			candidateModel,
		);
		console.log(JSON.stringify(verdict));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
