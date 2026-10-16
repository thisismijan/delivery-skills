import {
	CorpusEntry,
	type CorpusEntry as CorpusEntryType,
} from "./evaluation-corpus";
import { isFastEligible } from "./shadow-route";
import type { FastEligibleFields } from "./shadow-route";

export const FAST_RELATIVE_UTILITY_THRESHOLD = 0.9;
export const MIN_EVALUATED_FAST_SAMPLES = 5;

export interface FastDispatchVerdict {
	allowed: boolean;
	sampleSize: number;
	relativeUtility: number | null;
	criticalMisses: number;
	reason: string;
}

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateFastDispatch(
	entries: CorpusEntryType[],
	profile?: FastEligibleFields,
): FastDispatchVerdict {
	if (profile && !isFastEligible(profile)) {
		return {
			allowed: false,
			sampleSize: 0,
			relativeUtility: null,
			criticalMisses: 0,
			reason:
				"this task is not reversible, local, and strongly verified mechanical work",
		};
	}
	const evaluated = entries.filter((entry) => {
		if (!entry.evaluation) return false;
		if (!isFastEligible(entry.observation.profile)) return false;
		if (profile && entry.workType !== profile.workType) return false;
		return true;
	});
	const criticalMisses = evaluated.reduce(
		(sum, entry) => sum + (entry.evaluation?.criticalMisses ?? 0),
		0,
	);
	if (evaluated.length < MIN_EVALUATED_FAST_SAMPLES) {
		return {
			allowed: false,
			sampleSize: evaluated.length,
			relativeUtility: null,
			criticalMisses,
			reason: `need ${MIN_EVALUATED_FAST_SAMPLES} scored reversible tasks before a fast model may run; have ${evaluated.length}`,
		};
	}
	const relativeUtility = mean(
		evaluated.map((entry) => entry.evaluation?.relativeUtility ?? 0),
	);
	if (criticalMisses > 0) {
		return {
			allowed: false,
			sampleSize: evaluated.length,
			relativeUtility,
			criticalMisses,
			reason: "a scored task had a critical miss, so fast models stay off",
		};
	}
	if (relativeUtility < FAST_RELATIVE_UTILITY_THRESHOLD) {
		return {
			allowed: false,
			sampleSize: evaluated.length,
			relativeUtility,
			criticalMisses,
			reason: `mean relative utility ${relativeUtility.toFixed(2)} is below the 90 percent bar`,
		};
	}
	return {
		allowed: true,
		sampleSize: evaluated.length,
		relativeUtility,
		criticalMisses: 0,
		reason: "reversible, strongly verified work cleared the 90 percent bar",
	};
}

export function parseCorpusEntries(input: unknown): CorpusEntryType[] {
	return CorpusEntry.array().parse(input);
}

if (import.meta.main) {
	const corpusFile = process.argv[2];
	if (!corpusFile) {
		console.error("usage: fast-dispatch <corpus-entries.json>");
		process.exit(2);
	}
	try {
		const verdict = evaluateFastDispatch(
			parseCorpusEntries(await Bun.file(corpusFile).json()),
		);
		console.log(JSON.stringify(verdict));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
