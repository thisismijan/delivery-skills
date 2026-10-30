import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config";
import { type DiffScan, scanDiff } from "./diff-scan";
import type { ReviewBreadth } from "./levels";
import {
	CONTAINED_MAX_FILES,
	CONTAINED_MAX_LINES,
	NON_CODE_PREFIXES,
	type ReviewableDiff,
	measureReviewableDiff,
} from "./review-fanout";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const REVIEW_SCOPE_INVOCATION =
	"scripts/review-scope.ts <repoRoot> <iid> <base-sha> <head-sha>";

const SHA = /^[0-9a-f]{40}$/;
const FULL_REVIEW_SURFACES = new Set([
	"data",
	"contract",
	"config",
	"auth",
	"infra",
	"dependencies",
]);

export interface PreviousReview {
	head: string;
	verdict: "PASS" | "BLOCK" | undefined;
	paths: string[];
}

export interface ScopeInput {
	breadth: ReviewBreadth;
	previous?: PreviousReview;
	unrelatedPrevious: boolean;
	mergeCommits: number;
	delta?: ReviewableDiff;
	deltaScan?: DiffScan;
}

export type ReviewScope =
	| { scope: "full"; reasons: string[] }
	| { scope: "delta"; since: string; reasons: string[] };

export function decideReviewScope(input: ScopeInput): ReviewScope {
	if (input.breadth === "every-lens") {
		return {
			scope: "full",
			reasons: ["The max level reviews the whole change every round."],
		};
	}
	const previous = input.previous;
	if (!previous) {
		return {
			scope: "full",
			reasons: [
				input.unrelatedPrevious
					? "The last reviewed commit is not in this branch's history."
					: "This is the first review of this change.",
			],
		};
	}
	const reasons: string[] = [];
	if (!previous.verdict) {
		reasons.push("The last review has no verdict to build on.");
	}
	if (input.mergeCommits > 0) {
		reasons.push(
			"The branch merged other commits since the last review, so the change since then is not only its own.",
		);
	}
	const delta = input.delta;
	const scan = input.deltaScan;
	if (!delta || !scan) {
		reasons.push("The change since the last review could not be measured.");
	} else {
		const surfaces = scan.surfaces.filter((surface) =>
			FULL_REVIEW_SURFACES.has(surface),
		);
		if (surfaces.length > 0) {
			reasons.push(
				`The change since the last review touches ${surfaces.join(", ")}.`,
			);
		}
		if (scan.oneWay.length > 0) {
			reasons.push("The change since the last review has a one-way step.");
		}
		if (scan.loweredBar.length > 0) {
			reasons.push(
				"The change since the last review deletes, skips, or weakens a test.",
			);
		}
		if (
			delta.changedFiles > CONTAINED_MAX_FILES ||
			delta.changedLines >= CONTAINED_MAX_LINES
		) {
			reasons.push(
				`The change since the last review is larger than ${CONTAINED_MAX_FILES} files or ${CONTAINED_MAX_LINES} lines.`,
			);
		}
		const covered = new Set(previous.paths);
		const unseen = delta.paths.filter((path) => !covered.has(path));
		if (unseen.length > 0) {
			reasons.push(
				`The change since the last review touches files it did not cover: ${unseen.join(", ")}.`,
			);
		}
	}
	if (reasons.length > 0) return { scope: "full", reasons };
	return {
		scope: "delta",
		since: previous.head,
		reasons: [
			`Only ${delta?.changedFiles ?? 0} file(s) the last review covered changed since ${previous.head.slice(0, 12)}.`,
		],
	};
}

function git(cwd: string, args: string[]): { code: number; stdout: string } {
	const proc = Bun.spawnSync(["git", "-c", "core.quotepath=false", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode ?? 1, stdout: proc.stdout.toString() };
}

function required(cwd: string, args: string[]): string {
	const run = git(cwd, args);
	if (run.code !== 0) throw new Error(`git ${args.join(" ")} failed`);
	return run.stdout;
}

export function readVerdict(
	maxPath: string,
	iid: string,
	head: string,
): "PASS" | "BLOCK" | undefined | null {
	const lines = readFileSync(maxPath, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (lines.at(-1) !== `<!-- code-review-max:mr=${iid} head=${head} -->`) {
		return null;
	}
	const verdict = lines
		.find((line) => line.startsWith("**Verdict:**"))
		?.match(/\b(PASS|BLOCK)\b/)?.[1];
	return verdict === "PASS" || verdict === "BLOCK" ? verdict : undefined;
}

export function reviewScope(options: {
	repoRoot: string;
	iid: string;
	base: string;
	head: string;
	breadth: ReviewBreadth;
}): ReviewScope {
	const { repoRoot, iid, base, head } = options;
	if (!/^\d+$/.test(iid)) throw new Error("the change iid must be digits");
	if (!SHA.test(base) || !SHA.test(head)) {
		throw new Error("base and head must be full commit SHAs");
	}
	const reviews = join(repoRoot, ".review", `mr-${iid}`);
	const candidates = existsSync(reviews)
		? readdirSync(reviews).filter(
				(name) =>
					SHA.test(name) &&
					name !== head &&
					existsSync(join(reviews, name, "max.md")) &&
					readVerdict(join(reviews, name, "max.md"), iid, name) !== null,
			)
		: [];
	const ancestors = candidates
		.filter(
			(sha) =>
				git(repoRoot, ["merge-base", "--is-ancestor", sha, head]).code === 0,
		)
		.map((sha) => ({
			sha,
			distance: Number(
				required(repoRoot, ["rev-list", "--count", `${sha}..${head}`]).trim(),
			),
		}))
		.sort((left, right) => left.distance - right.distance);
	const nearest = ancestors[0]?.sha;
	if (!nearest) {
		return decideReviewScope({
			breadth: options.breadth,
			unrelatedPrevious: candidates.length > 0,
			mergeCommits: 0,
		});
	}
	const verdict = readVerdict(join(reviews, nearest, "max.md"), iid, nearest);
	const previousBase = required(repoRoot, ["merge-base", base, nearest]).trim();
	const previousPaths = required(repoRoot, [
		"diff",
		"--name-only",
		previousBase,
		nearest,
	])
		.split("\n")
		.filter(
			(path) =>
				path.length > 0 &&
				!NON_CODE_PREFIXES.some((prefix) => path.startsWith(prefix)),
		);
	const mergeCommits = required(repoRoot, [
		"rev-list",
		"--merges",
		`${nearest}..${head}`,
	])
		.split("\n")
		.filter((line) => line.length > 0).length;
	const delta = measureReviewableDiff(
		required(repoRoot, ["diff", "--numstat", nearest, head]),
	);
	const deltaScan = scanDiff(
		required(repoRoot, [
			"diff",
			"--no-color",
			"--no-ext-diff",
			"-M",
			nearest,
			head,
		]),
	);
	return decideReviewScope({
		breadth: options.breadth,
		previous: {
			head: nearest,
			verdict: verdict ?? undefined,
			paths: previousPaths,
		},
		unrelatedPrevious: false,
		mergeCommits,
		delta,
		deltaScan,
	});
}

if (import.meta.main) {
	const [repoRoot, iid, base, head] = process.argv.slice(2);
	if (!repoRoot || !iid || !base || !head) {
		console.error(`usage: ${REVIEW_SCOPE_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(
			JSON.stringify(
				reviewScope({
					repoRoot,
					iid,
					base,
					head,
					breadth: loadConfig().reviewBreadth,
				}),
				null,
				2,
			),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
