import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ChangeArtifacts {
	ok: boolean;
	missing: string[];
	warnings: string[];
}

const TEST_WORD = /\b(test|tests|testing|spec|specs)\b/;
const BUILD_WORD = /\b(implement|implementation)\b/;

async function hasContent(path: string, kind: "file" | "dir") {
	const info = await stat(path).catch(() => undefined);
	if (info === undefined) return false;
	if (kind === "file") return info.isFile() && info.size > 0;
	return info.isDirectory() && (await readdir(path)).length > 0;
}

// A rough ordering check: some line about tests must come before the first
// line about implementing.
export function isTestsFirst(tasks: string): boolean {
	const lower = tasks.toLowerCase().split("\n");
	const testAt = lower.findIndex((line) => TEST_WORD.test(line));
	const buildAt = lower.findIndex((line) => BUILD_WORD.test(line));
	if (testAt < 0) return false;
	return buildAt < 0 || testAt < buildAt;
}

export async function verifyChangeArtifacts(
	changeDir: string,
): Promise<ChangeArtifacts> {
	const required: Array<[string, string, "file" | "dir"]> = [
		["proposal.md", "proposal.md", "file"],
		["specs/", "specs", "dir"],
		["design.md", "design.md", "file"],
		["tasks.md", "tasks.md", "file"],
	];
	const missing: string[] = [];
	for (const [label, name, kind] of required) {
		if (!(await hasContent(join(changeDir, name), kind))) missing.push(label);
	}
	const warnings: string[] = [];
	if (!missing.includes("tasks.md")) {
		const tasks = await Bun.file(join(changeDir, "tasks.md")).text();
		if (!isTestsFirst(tasks))
			warnings.push("tasks.md is not ordered tests-first");
	}
	const ok = missing.length + warnings.length === 0;
	return { ok, missing, warnings };
}

const USAGE = "usage: verify-change <changeDir>";

if (import.meta.main) {
	const changeDir = process.argv[2];
	if (changeDir === undefined || changeDir === "") {
		console.error(USAGE);
		process.exit(2);
	}
	const report = await verifyChangeArtifacts(changeDir);
	console.log(JSON.stringify(report));
	process.exit(report.ok ? 0 : 1);
}
