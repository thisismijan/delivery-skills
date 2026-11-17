import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
	PAIRED_CLOSE_MARGIN,
	PAIRED_UTILITY_THRESHOLD,
	RepeatedPairedEvidence,
	evaluateRepeatedPairs,
	median,
} from "./paired-evaluation";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const PAIRED_SPREAD_RECORD_INVOCATION = "scripts/paired-spread.ts record <paired-evidence.json> <task-class> <paired-runs.jsonl>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const PAIRED_SPREAD_REPORT_INVOCATION = "scripts/paired-spread.ts report <paired-runs.jsonl>";

export const PairedRunRecord = z
	.object({
		version: z.literal(1),
		candidateId: z.string().min(1),
		taskClass: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
		baseline: z.array(z.number().positive()).min(3).max(5),
		candidate: z.array(z.number().positive()).min(3).max(5),
		decision: z.enum(["pass", "fail", "extend"]),
	})
	.strict()
	.refine((record) => record.baseline.length === record.candidate.length, {
		message: "each run has a baseline and a candidate utility",
	});
export type PairedRunRecord = z.infer<typeof PairedRunRecord>;

export function recordFor(
	evidence: unknown,
	taskClass: string,
): PairedRunRecord {
	const parsed = RepeatedPairedEvidence.parse(evidence);
	return PairedRunRecord.parse({
		version: 1,
		candidateId: parsed.candidateId,
		taskClass,
		baseline: parsed.pairs.map((pair) => pair.baseline.utility),
		candidate: parsed.pairs.map((pair) => pair.candidate.utility),
		decision: evaluateRepeatedPairs(parsed).decision,
	});
}

export interface ClassSpread {
	taskClass: string;
	evaluations: number;
	// The largest distance of one run's ratio from its evaluation's median ratio.
	largestDeviation: number;
	medianDeviation: number;
	extendedAtCurrentMargin: number;
	suggestedMargin: number;
}

export function deviation(record: PairedRunRecord): {
	medianRatio: number;
	largest: number;
} {
	const ratios = record.candidate.map(
		(value, index) => value / (record.baseline[index] as number),
	);
	const medianRatio = median(record.candidate) / median(record.baseline);
	return {
		medianRatio,
		largest: Math.max(...ratios.map((ratio) => Math.abs(ratio - medianRatio))),
	};
}

// Suggests the smallest margin, rounded up to 0.01, that a single run's
// observed deviation could not carry across the bar. It never sets the margin.
export function spreadReport(records: PairedRunRecord[]): ClassSpread[] {
	const byClass = new Map<string, PairedRunRecord[]>();
	for (const record of records) {
		byClass.set(record.taskClass, [
			...(byClass.get(record.taskClass) ?? []),
			record,
		]);
	}
	return [...byClass.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([taskClass, list]) => {
			const deviations = list.map(deviation);
			const largest = Math.max(...deviations.map((entry) => entry.largest));
			return {
				taskClass,
				evaluations: list.length,
				largestDeviation: largest,
				medianDeviation: median(deviations.map((entry) => entry.largest)),
				extendedAtCurrentMargin: deviations.filter(
					(entry) =>
						Math.abs(entry.medianRatio - PAIRED_UTILITY_THRESHOLD) <
						PAIRED_CLOSE_MARGIN - 1e-9,
				).length,
				suggestedMargin: Math.max(0, Math.ceil(largest * 100 - 1e-9)) / 100,
			};
		});
}

export function readRecords(path: string): PairedRunRecord[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line, index) => {
			try {
				return PairedRunRecord.parse(JSON.parse(line));
			} catch (error) {
				throw new Error(
					`${path} line ${index + 1} is not a paired-run record: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		});
}

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	try {
		if (command === "record" && args[0] && args[1] && args[2]) {
			const record = recordFor(
				JSON.parse(readFileSync(args[0], "utf8")),
				args[1],
			);
			mkdirSync(dirname(args[2]), { recursive: true });
			appendFileSync(args[2], `${JSON.stringify(record)}\n`);
			console.log(JSON.stringify(record));
		} else if (command === "report" && args[0]) {
			const report = spreadReport(readRecords(args[0]));
			console.log(
				JSON.stringify(
					report.length === 0
						? { evidence: "none", classes: [] }
						: {
								evidence: "recorded",
								currentMargin: PAIRED_CLOSE_MARGIN,
								classes: report,
							},
					null,
					2,
				),
			);
		} else {
			console.error(
				`usage: ${PAIRED_SPREAD_RECORD_INVOCATION} | ${PAIRED_SPREAD_REPORT_INVOCATION}`,
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
