import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { readChangeMeta } from "./change-meta";
import { TEST_PATH } from "./diff-scan";
import { impactPaths } from "./plan-drift";

// A worker that can see what the affected code already exports reuses it
// instead of searching for it, so the map is built without a model and capped
// so a large area cannot crowd the rest of the packet out.
export const CODE_MAP_MAX_CHARS = 4000;

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CODE_MAP_INVOCATION = "scripts/code-map.ts <repoRoot> <changeDir>";

const TS_EXPORT =
	/^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const PATTERNS: Record<string, RegExp[]> = {
	ts: [TS_EXPORT],
	py: [/^(?:async\s+)?(?:def|class)\s+([A-Za-z]\w*)/gm],
	go: [/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm, /^type\s+([A-Z]\w*)/gm],
	java: [
		/^\s*public\s+(?:(?:static|final|abstract|sealed)\s+)*(?:class|interface|enum|record)\s+(\w+)/gm,
	],
	kt: [
		/^(?:(?:public|internal|data|sealed|abstract|open|enum)\s+)*(?:class|interface|object|fun)\s+(\w+)/gm,
	],
};
const LANGUAGE: Record<string, keyof typeof PATTERNS> = {
	".ts": "ts",
	".tsx": "ts",
	".mts": "ts",
	".cts": "ts",
	".js": "ts",
	".jsx": "ts",
	".mjs": "ts",
	".cjs": "ts",
	".py": "py",
	".go": "go",
	".java": "java",
	".kt": "kt",
};

export function exportedSymbols(path: string, text: string): string[] {
	const language = LANGUAGE[extname(path)];
	if (!language) return [];
	const found = new Set<string>();
	for (const pattern of PATTERNS[language] as RegExp[]) {
		for (const match of text.matchAll(pattern)) {
			const name = match[1] as string;
			if (language === "py" && name.startsWith("_")) continue;
			found.add(name);
		}
	}
	if (language === "ts" && /^export\s+default\s/m.test(text))
		found.add("default");
	return [...found];
}

export function buildCodeMap(
	files: Array<{ path: string; text: string }>,
	cap = CODE_MAP_MAX_CHARS,
): string {
	const header = [
		"Exported top-level symbols in the change's affected areas, without their bodies.",
		`Built without a model and capped at ${cap} characters.`,
		"",
	];
	const rows = files
		.map(({ path, text }) => ({ path, symbols: exportedSymbols(path, text) }))
		.filter((row) => row.symbols.length > 0)
		.map((row) => `- \`${row.path}\`: ${row.symbols.join(", ")}`);
	if (rows.length === 0) {
		return [
			...header,
			"No exported symbols were found in the affected areas.",
		].join("\n");
	}
	const lines = [...header];
	let used = lines.join("\n").length;
	let shown = 0;
	for (const row of rows) {
		const reserve =
			`\n[${rows.length} more files left out to stay within the cap]`.length;
		if (used + row.length + 1 + reserve > cap) break;
		lines.push(row);
		used += row.length + 1;
		shown += 1;
	}
	if (shown < rows.length) {
		lines.push(
			`[${rows.length - shown} more files left out to stay within the cap]`,
		);
	}
	return lines.join("\n");
}

function trackedFiles(repoRoot: string, area: string): string[] {
	const proc = Bun.spawnSync(
		["git", "-c", "core.quotepath=false", "ls-files", "--", area],
		{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
	);
	if (proc.exitCode !== 0) throw new Error(`git ls-files failed for ${area}`);
	return proc.stdout.toString().split("\n").filter(Boolean);
}

export async function codeMapFor(
	repoRoot: string,
	changeDir: string,
): Promise<string> {
	const meta = await readChangeMeta(changeDir);
	const proposalPath = join(changeDir, "proposal.md");
	const areas = [
		...new Set([
			...(meta.affectedAreas ?? []),
			...(existsSync(proposalPath)
				? impactPaths(readFileSync(proposalPath, "utf8"))
				: []),
		]),
	].filter((area) => !area.startsWith("openspec/"));
	if (areas.length === 0) {
		return "No affected areas are recorded for this change, so there is no code map.";
	}
	const paths = [
		...new Set(areas.flatMap((area) => trackedFiles(repoRoot, area))),
	]
		.filter((path) => !TEST_PATH.test(path))
		.sort();
	return buildCodeMap(
		paths.map((path) => ({
			path,
			text: readFileSync(join(repoRoot, path), "utf8"),
		})),
	);
}

if (import.meta.main) {
	const [repoRoot, changeDir] = process.argv.slice(2);
	if (!repoRoot || !changeDir) {
		console.error(`usage: ${CODE_MAP_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(await codeMapFor(repoRoot, changeDir));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
