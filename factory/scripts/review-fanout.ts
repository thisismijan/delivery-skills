import { z } from "zod";
import { loadConfig } from "./config";
import type { ReviewBreadth } from "./levels";

export const REVIEW_LENSES = [
	"correctness-security",
	"tests-specification",
	"reliability-operations",
	"repository-blast-radius",
] as const;

const SENSITIVE_SURFACES = new Set([
	"data",
	"contract",
	"config",
	"auth",
	"infra",
]);

export const ReviewFanoutInput = z.object({
	changedFiles: z.number().int().nonnegative(),
	changedLines: z.number().int().nonnegative(),
	reversible: z.boolean(),
	classificationComplete: z.boolean(),
	surfaces: z
		.array(
			z.enum([
				"data",
				"contract",
				"config",
				"auth",
				"infra",
				"dependencies",
				"user-facing",
			]),
		)
		.default([]),
});

export type ReviewFanoutInput = z.infer<typeof ReviewFanoutInput>;

// Measured across benchmark loops: every blocking finding on a reversible,
// non-sensitive change came from the first two lenses, so the other two run
// only where their surfaces (rollout, dependencies, blast radius) are present.
export const CONTAINED_MAX_FILES = 6;
export const CONTAINED_MAX_LINES = 400;

export interface ReviewFanoutPlan {
	mode: "empty" | "small" | "contained" | "full";
	lenses: (typeof REVIEW_LENSES)[number][];
	reason: string;
}

export const READINESS_LENSES = [
	"rollback",
	"compatibility",
	"security",
	"operability",
] as const;

export interface ReadinessFanoutPlan {
	mode: "empty" | "small" | "full";
	lenses: (typeof READINESS_LENSES)[number][];
	reason: string;
}

function sensitiveSurfaces(parsed: ReviewFanoutInput): string[] {
	return parsed.surfaces.filter((surface) => SENSITIVE_SURFACES.has(surface));
}

function emptyChange(parsed: ReviewFanoutInput, sensitive: string[]): boolean {
	return (
		parsed.classificationComplete &&
		parsed.changedFiles === 0 &&
		parsed.changedLines === 0 &&
		parsed.reversible &&
		sensitive.length === 0
	);
}

function smallChange(parsed: ReviewFanoutInput, sensitive: string[]): boolean {
	return (
		parsed.classificationComplete &&
		parsed.changedFiles <= 2 &&
		parsed.changedLines < 50 &&
		parsed.reversible &&
		sensitive.length === 0
	);
}

export function planReadinessFanout(
	input: ReviewFanoutInput,
	breadth: ReviewBreadth = "measured",
): ReadinessFanoutPlan {
	const parsed = ReviewFanoutInput.parse(input);
	const sensitive = sensitiveSurfaces(parsed);
	if (emptyChange(parsed, sensitive)) {
		return {
			mode: "empty",
			lenses: [],
			reason: "no reviewable code in the pinned diff",
		};
	}
	if (breadth === "every-lens") {
		return {
			mode: "full",
			lenses: [...READINESS_LENSES],
			reason: "the max level runs every readiness lens on every change",
		};
	}
	if (smallChange(parsed, sensitive)) {
		return {
			mode: "small",
			lenses: [],
			reason: "small reversible change with no sensitive surface",
		};
	}
	const reasons = [
		!parsed.classificationComplete ? "classification incomplete" : undefined,
		parsed.changedFiles > 2 ? "more than 2 changed files" : undefined,
		parsed.changedLines >= 50 ? "at least 50 changed lines" : undefined,
		!parsed.reversible ? "one-way change" : undefined,
		sensitive.length > 0
			? `sensitive surfaces: ${sensitive.join(", ")}`
			: undefined,
	].filter((reason): reason is string => reason !== undefined);
	return {
		mode: "full",
		lenses: [...READINESS_LENSES],
		reason: reasons.join("; "),
	};
}

export function planReviewFanout(
	input: ReviewFanoutInput,
	breadth: ReviewBreadth = "measured",
): ReviewFanoutPlan {
	const parsed = ReviewFanoutInput.parse(input);
	const sensitive = sensitiveSurfaces(parsed);
	if (emptyChange(parsed, sensitive)) {
		return {
			mode: "empty",
			lenses: [],
			reason: "no reviewable code in the pinned diff",
		};
	}

	if (breadth === "every-lens") {
		return {
			mode: "full",
			lenses: [...REVIEW_LENSES],
			reason: "the max level runs every lens on every change",
		};
	}

	if (smallChange(parsed, sensitive)) {
		return {
			mode: "small",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason: "small reversible change with no sensitive surface",
		};
	}

	const dependencies = parsed.surfaces.includes("dependencies");
	const contained =
		parsed.classificationComplete &&
		parsed.changedFiles <= CONTAINED_MAX_FILES &&
		parsed.changedLines < CONTAINED_MAX_LINES &&
		parsed.reversible &&
		sensitive.length === 0 &&
		!dependencies;

	if (contained) {
		return {
			mode: "contained",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason: `reversible change within ${CONTAINED_MAX_FILES} files and ${CONTAINED_MAX_LINES} lines with no sensitive surface or dependency change`,
		};
	}

	const sizeOnly =
		parsed.classificationComplete &&
		parsed.reversible &&
		sensitive.length === 0 &&
		!dependencies;
	if (breadth === "size-trimmed" && sizeOnly) {
		return {
			mode: "contained",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason:
				"the min level does not add lenses for size alone on a reversible change with no sensitive surface or dependency change",
		};
	}

	const reasons = [
		!parsed.classificationComplete ? "classification incomplete" : undefined,
		parsed.changedFiles > CONTAINED_MAX_FILES
			? `more than ${CONTAINED_MAX_FILES} changed files`
			: undefined,
		parsed.changedLines >= CONTAINED_MAX_LINES
			? `at least ${CONTAINED_MAX_LINES} changed lines`
			: undefined,
		!parsed.reversible ? "one-way change" : undefined,
		sensitive.length > 0
			? `sensitive surfaces: ${sensitive.join(", ")}`
			: undefined,
		dependencies ? "dependency change" : undefined,
	].filter((reason): reason is string => reason !== undefined);

	return {
		mode: "full",
		lenses: [...REVIEW_LENSES],
		reason: reasons.join("; "),
	};
}

// Spec artefacts are reviewed by the holdout reviewer and lens 2 against the
// code; counting them made every change look large and sensitive.
export const NON_CODE_PREFIXES = ["openspec/", ".delivery/", ".review/"];

export interface ReviewableDiff {
	changedFiles: number;
	changedLines: number;
	paths: string[];
	excluded: string[];
}

export function measureReviewableDiff(numstat: string): ReviewableDiff {
	const paths: string[] = [];
	const excluded: string[] = [];
	let changedLines = 0;
	for (const line of numstat.split("\n")) {
		if (!line.trim()) continue;
		const [added, deleted, ...rest] = line.split("\t");
		const path = rest.join("\t");
		if (!path || added === undefined || deleted === undefined) {
			throw new Error(`unreadable numstat line: ${line}`);
		}
		if (NON_CODE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
			excluded.push(path);
			continue;
		}
		paths.push(path);
		// Binary files report "-" and count as one changed line so they are never free.
		changedLines +=
			added === "-" || deleted === "-" ? 1 : Number(added) + Number(deleted);
	}
	return { changedFiles: paths.length, changedLines, paths, excluded };
}

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

export const LensCandidates = z.object({
	candidates: z.array(z.object({ severity: z.enum(SEVERITIES) })),
});

export type LensCandidates = z.infer<typeof LensCandidates>;

export interface AdjudicationPlan {
	mode: "none" | "standard" | "main";
	reason: string;
}

export function planAdjudication(input: LensCandidates): AdjudicationPlan {
	const { candidates } = LensCandidates.parse(input);
	if (candidates.length === 0) {
		return { mode: "none", reason: "no lens returned a candidate" };
	}
	if (candidates.every((candidate) => candidate.severity === "Low")) {
		return {
			mode: "standard",
			reason: "every candidate is Low, which cannot block on its own",
		};
	}
	return {
		mode: "main",
		reason: "a candidate at Medium or above can block readiness",
	};
}

async function gitNumstat(base: string, head: string): Promise<string> {
	const proc = Bun.spawn(["git", "diff", "--numstat", `${base}...${head}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(err.trim() || `git diff exited ${code}`);
	return out;
}

const USAGE = [
	"usage: review-fanout <input.json>",
	"       review-fanout measure <base> <head>",
	"       review-fanout adjudication <candidates.json>",
	"       review-fanout readiness <input.json>",
].join("\n");

if (import.meta.main) {
	const [first, ...rest] = process.argv.slice(2);
	if (!first) {
		console.error(USAGE);
		process.exit(2);
	}
	try {
		if (first === "measure") {
			const [base, head] = rest;
			if (!base || !head) {
				console.error(USAGE);
				process.exit(2);
			}
			const diff = measureReviewableDiff(await gitNumstat(base, head));
			console.log(JSON.stringify(diff, null, 2));
		} else if (first === "adjudication") {
			if (!rest[0]) {
				console.error(USAGE);
				process.exit(2);
			}
			const input = LensCandidates.parse(await Bun.file(rest[0]).json());
			console.log(JSON.stringify(planAdjudication(input), null, 2));
		} else if (first === "readiness") {
			if (!rest[0]) {
				console.error(USAGE);
				process.exit(2);
			}
			const input = ReviewFanoutInput.parse(await Bun.file(rest[0]).json());
			console.log(
				JSON.stringify(
					planReadinessFanout(input, loadConfig().reviewBreadth),
					null,
					2,
				),
			);
		} else {
			const input = ReviewFanoutInput.parse(await Bun.file(first).json());
			console.log(
				JSON.stringify(
					planReviewFanout(input, loadConfig().reviewBreadth),
					null,
					2,
				),
			);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
