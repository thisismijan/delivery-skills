import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readChangeMeta } from "./change-meta";
import { TEST_PATH } from "./diff-scan";
import {
	CONTAINED_MAX_FILES,
	CONTAINED_MAX_LINES,
	measureReviewableDiff,
} from "./review-fanout";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const PLAN_DRIFT_INVOCATION = "scripts/plan-drift.ts <changeDir> <base> <head>";

export interface PlanDrift {
	plan: "present" | "missing";
	planned: string[];
	unplanned: string[];
	tests: string[];
	changedFiles: number;
	changedLines: number;
	sizeOverrun: boolean;
	drift: boolean;
	reasons: string[];
}

const PATH_LIKE = /\/|\.[A-Za-z0-9]+$/;

function section(markdown: string, heading: string): string {
	const lines = markdown.split(/\r?\n/);
	const start = lines.findIndex((line) =>
		new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line),
	);
	if (start < 0) return "";
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s/.test(line));
	return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

// The paths a proposal's Impact section names in backticks. A backticked name
// with no slash and no file extension is a symbol, not a path.
export function impactPaths(proposal: string): string[] {
	const found = new Set<string>();
	for (const match of section(proposal, "Impact").matchAll(/`([^`\s]+)`/g)) {
		const token = (match[1] as string).replace(/\/+$/, "");
		if (PATH_LIKE.test(token) && !token.startsWith("-")) found.add(token);
	}
	return [...found];
}

function plannedBy(path: string, planned: string): boolean {
	return path === planned || path.startsWith(`${planned}/`);
}

export function planDrift(input: {
	numstat: string;
	impactPaths: string[];
	affectedAreas: string[];
	complexitySignal: "low" | "medium" | "high";
}): PlanDrift {
	const diff = measureReviewableDiff(input.numstat);
	const planned = [
		...new Set(
			[...input.impactPaths, ...input.affectedAreas]
				.map((path) => path.trim().replace(/^\.\//, "").replace(/\/+$/, ""))
				.filter(Boolean),
		),
	];
	const tests = diff.paths.filter((path) => TEST_PATH.test(path));
	const unplanned = diff.paths.filter(
		(path) =>
			!TEST_PATH.test(path) && !planned.some((entry) => plannedBy(path, entry)),
	);
	const sizeOverrun =
		input.complexitySignal === "low" &&
		(diff.changedFiles > CONTAINED_MAX_FILES ||
			diff.changedLines > CONTAINED_MAX_LINES);
	const reasons: string[] = [];
	if (planned.length === 0) {
		reasons.push(
			"The change names no planned paths, so every changed file is unplanned.",
		);
	}
	for (const path of unplanned) {
		reasons.push(`${path} changed but the plan does not name it.`);
	}
	if (sizeOverrun) {
		reasons.push(
			`The change was rated low complexity but changes ${diff.changedFiles} files and ${diff.changedLines} lines, more than ${CONTAINED_MAX_FILES} files or ${CONTAINED_MAX_LINES} lines.`,
		);
	}
	return {
		plan: planned.length > 0 ? "present" : "missing",
		planned,
		unplanned,
		tests,
		changedFiles: diff.changedFiles,
		changedLines: diff.changedLines,
		sizeOverrun,
		drift: reasons.length > 0,
		reasons,
	};
}

if (import.meta.main) {
	const [changeDir, base, head] = process.argv.slice(2);
	if (!changeDir || !base || !head) {
		console.error(`usage: ${PLAN_DRIFT_INVOCATION}`);
		process.exit(2);
	}
	try {
		const meta = await readChangeMeta(changeDir);
		const proposal = readFileSync(join(changeDir, "proposal.md"), "utf8");
		const proc = Bun.spawnSync(
			[
				"git",
				"-c",
				"core.quotepath=false",
				"diff",
				"--numstat",
				`${base}...${head}`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		if (proc.exitCode !== 0) {
			throw new Error(
				`git diff failed: ${proc.stderr.toString().trim() || "unknown error"}`,
			);
		}
		const result = planDrift({
			numstat: proc.stdout.toString(),
			impactPaths: impactPaths(proposal),
			affectedAreas: meta.affectedAreas ?? [],
			complexitySignal: meta.complexitySignal,
		});
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
