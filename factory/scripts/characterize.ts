import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { TEST_PATH } from "./diff-scan";
import { plannedPaths } from "./planned-paths";
import { NON_CODE_PREFIXES } from "./review-fanout";
import { safeGit } from "./safe-git";
import { type Zone, loadZones, zoneHits, zonesRoot } from "./zone-map";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CHARACTERIZE_INVOCATION = "scripts/characterize.ts check <repoRoot> <changeDir>";

const SOURCE =
	/\.(c|cc|cpp|cs|go|java|js|jsx|kt|mjs|cjs|php|py|rb|rs|scala|swift|ts|tsx)$/;
const MAX_TEST_BYTES = 1_000_000;

export type PinReason = "no test references it" | "yellow zone";

export interface Characterization {
	uncovered: string[];
	covered: { path: string; tests: string[] }[];
	// Every file to pin before the change's tests, with why.
	pinned: { path: string; reason: PinReason }[];
	characterize: boolean;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stemOf(path: string): string {
	return basename(path, extname(path));
}

// A test references a source file when its own name carries the file's stem,
// or it names the stem as a module: after a path separator or a dot, inside
// quotes, or after import, from, use, or require.
export function references(
	sourcePath: string,
	testPath: string,
	testText: string,
): boolean {
	const stem = stemOf(sourcePath);
	if (stem.length < 2) return false;
	const testName = basename(testPath).toLowerCase();
	const lower = stem.toLowerCase();
	if (
		new RegExp(`(^|[._-])${escapeRegExp(lower)}([._-]|test|tests|spec|$)`).test(
			testName.replace(/\.[^.]+$/, ""),
		) ||
		testName.startsWith(`${lower}test`) ||
		testName.startsWith(`${lower}.`)
	) {
		return true;
	}
	const s = escapeRegExp(stem);
	return new RegExp(
		`[/.'"]${s}(\\.[A-Za-z]+)?['"]|[/.]${s}\\b|\\b(import|from|use|require)\\s+${s}\\b|\\b${s}::`,
	).test(testText);
}

// Existing source files a change plans to touch that no test references, plus
// referenced ones the owner marked yellow; new files have no current behaviour
// to pin and are never listed.
export function characterization(
	sources: string[],
	tests: { path: string; text: string }[],
	zones: Zone[] | null = null,
): Characterization {
	const uncovered: string[] = [];
	const covered: Characterization["covered"] = [];
	for (const path of sources) {
		const hits = tests
			.filter((test) => references(path, test.path, test.text))
			.map((test) => test.path);
		if (hits.length === 0) uncovered.push(path);
		else covered.push({ path, tests: hits });
	}
	const yellow =
		zones === null
			? []
			: zoneHits(
					covered.map((entry) => entry.path),
					zones,
				).yellow.map((hit) => hit.path);
	const pinned = [
		...uncovered.map((path) => ({
			path,
			reason: "no test references it" as const,
		})),
		...yellow.map((path) => ({ path, reason: "yellow zone" as const })),
	];
	return { uncovered, covered, pinned, characterize: pinned.length > 0 };
}

export function isCharacterizable(path: string): boolean {
	return (
		SOURCE.test(path) &&
		!TEST_PATH.test(path) &&
		!NON_CODE_PREFIXES.some((prefix) => path.startsWith(prefix))
	);
}

export async function checkCharacterization(
	repoRoot: string,
	changeDir: string,
): Promise<Characterization & { planned: string[] }> {
	const { planned, tracked } = await plannedPaths(repoRoot, changeDir);
	const sources = tracked.filter(isCharacterizable);
	const listed = safeGit(repoRoot, ["ls-files", "-z"]);
	if (listed.code !== 0)
		throw new Error(listed.stderr.trim() || "git ls-files failed");
	const tests = listed.stdout
		.split("\0")
		.filter((path) => path && TEST_PATH.test(path) && SOURCE.test(path))
		.flatMap((path) => {
			try {
				const text = readFileSync(join(repoRoot, path), "utf8");
				return text.length > MAX_TEST_BYTES ? [] : [{ path, text }];
			} catch {
				return [];
			}
		});
	const zones = loadZones(zonesRoot(repoRoot));
	return { planned, ...characterization(sources, tests, zones) };
}

if (import.meta.main) {
	const [command, repoRoot, changeDir] = process.argv.slice(2);
	if (command !== "check" || !repoRoot || !changeDir) {
		console.error(`usage: ${CHARACTERIZE_INVOCATION}`);
		process.exit(2);
	}
	try {
		const result = await checkCharacterization(repoRoot, changeDir);
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.characterize ? 3 : 0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
