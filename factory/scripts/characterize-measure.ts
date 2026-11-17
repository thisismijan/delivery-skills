import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { checkCharacterization } from "./characterize";
import { safeGit } from "./safe-git";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CHARACTERIZE_MEASURE_INVOCATION = "scripts/characterize-measure.ts <repoRoot> <lcov.info>";

export type FileVerdict =
	| "false-cover"
	| "true-cover"
	| "no-surviving-lines"
	| "uncovered"
	| "needless-pass";

export interface FileMeasurement {
	change: string;
	path: string;
	verdict: FileVerdict;
	changedLines: number;
	executedLines: number;
}

export interface Measurement {
	changes: number;
	files: FileMeasurement[];
	calledCovered: number;
	falseCover: number;
	falseCoverShare: number | null;
	calledUncovered: number;
	needlessPass: number;
	coveredLineShare: number | null;
	underHalfExecuted: number;
	skipped: number;
}

// Executed line numbers per file from an lcov report, keyed by path relative
// to the repository root.
export function parseLcov(
	text: string,
	prefix = "",
): Map<string, Map<number, number>> {
	const files = new Map<string, Map<number, number>>();
	let current: Map<number, number> | null = null;
	for (const line of text.split(/\r?\n/)) {
		if (line.startsWith("SF:")) {
			current = new Map();
			files.set(posix.normalize(`${prefix}${line.slice(3)}`), current);
		} else if (line.startsWith("DA:") && current) {
			const [number, hits] = line.slice(3).split(",");
			current.set(Number(number), Number(hits));
		} else if (line === "end_of_record") {
			current = null;
		}
	}
	return files;
}

// A file the reference check called covered is a false cover when none of the
// executable lines the change wrote, and that survive today, ran under test. A
// file it called uncovered is a needless pass when some of those lines did run.
export function classify(
	calledCovered: boolean,
	changedLines: number[],
	coverage: Map<number, number> | undefined,
): { verdict: FileVerdict; changedLines: number; executedLines: number } {
	const executable = changedLines.filter((line) => coverage?.has(line) ?? true);
	const executed = executable.filter((line) => (coverage?.get(line) ?? 0) > 0);
	const counts = {
		changedLines: executable.length,
		executedLines: executed.length,
	};
	if (!calledCovered) {
		return {
			verdict: executed.length > 0 ? "needless-pass" : "uncovered",
			...counts,
		};
	}
	if (executable.length === 0)
		return { verdict: "no-surviving-lines", ...counts };
	return {
		verdict: executed.length === 0 ? "false-cover" : "true-cover",
		...counts,
	};
}

export function summarize(
	changes: number,
	files: FileMeasurement[],
): Measurement {
	const covered = files.filter(
		(file) => file.verdict === "false-cover" || file.verdict === "true-cover",
	);
	const falseCover = files.filter(
		(file) => file.verdict === "false-cover",
	).length;
	const lines = covered.reduce((sum, file) => sum + file.changedLines, 0);
	const ran = covered.reduce((sum, file) => sum + file.executedLines, 0);
	return {
		changes,
		files,
		calledCovered: covered.length,
		falseCover,
		falseCoverShare: covered.length === 0 ? null : falseCover / covered.length,
		calledUncovered: files.filter(
			(file) =>
				file.verdict === "uncovered" || file.verdict === "needless-pass",
		).length,
		needlessPass: files.filter((file) => file.verdict === "needless-pass")
			.length,
		coveredLineShare: lines === 0 ? null : ran / lines,
		underHalfExecuted: covered.filter(
			(file) => file.executedLines * 2 < file.changedLines,
		).length,
		skipped: files.filter((file) => file.verdict === "no-surviving-lines")
			.length,
	};
}

function changeCommits(repoRoot: string, name: string): Set<string> {
	const log = safeGit(repoRoot, [
		"log",
		"--diff-filter=A",
		"--format=%H",
		"--",
		`openspec/changes/${name}/proposal.md`,
	]);
	return new Set(log.stdout.split("\n").filter(Boolean));
}

function linesBy(
	repoRoot: string,
	path: string,
	commits: Set<string>,
): number[] {
	const blame = safeGit(repoRoot, [
		"blame",
		"--line-porcelain",
		"HEAD",
		"--",
		path,
	]);
	if (blame.code !== 0) return [];
	const lines: number[] = [];
	for (const line of blame.stdout.split("\n")) {
		const header = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
		if (header && commits.has(header[1] as string))
			lines.push(Number(header[2]));
	}
	return lines;
}

export async function measure(
	repoRoot: string,
	lcov: string,
): Promise<Measurement> {
	const archive = join(repoRoot, "openspec/changes/archive");
	const coverage = parseLcov(readFileSync(lcov, "utf8"), "factory/");
	const files: FileMeasurement[] = [];
	const dirs = existsSync(archive) ? readdirSync(archive).sort() : [];
	for (const dir of dirs) {
		const name = dir.replace(/^\d{4}-\d{2}-\d{2}-/, "");
		const commits = changeCommits(repoRoot, name);
		if (commits.size === 0) continue;
		const result = await checkCharacterization(repoRoot, join(archive, dir));
		const covered = new Set(result.covered.map((entry) => entry.path));
		for (const path of [...covered, ...result.uncovered].sort()) {
			const verdict = classify(
				covered.has(path),
				linesBy(repoRoot, path, commits),
				coverage.get(path),
			);
			files.push({ change: name, path, ...verdict });
		}
	}
	return summarize(dirs.length, files);
}

if (import.meta.main) {
	const [repoRoot, lcov] = process.argv.slice(2);
	if (!repoRoot || !lcov) {
		console.error(`usage: ${CHARACTERIZE_MEASURE_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(JSON.stringify(await measure(repoRoot, lcov), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
