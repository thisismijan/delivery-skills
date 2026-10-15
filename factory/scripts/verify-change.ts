import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ChangeArtifacts {
	ok: boolean;
	missing: string[];
	warnings: string[];
}

async function isNonEmptyFile(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isFile() && s.size > 0;
	} catch {
		return false;
	}
}

async function isNonEmptyDir(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		if (!s.isDirectory()) return false;
		return (await readdir(path)).length > 0;
	} catch {
		return false;
	}
}

// Heuristic: a test-related task line appears before an implementation task line.
export function isTestsFirst(tasksMd: string): boolean {
	const lines = tasksMd.split("\n").map((l) => l.toLowerCase());
	const firstTest = lines.findIndex((l) => /\b(test|spec)\b/.test(l));
	const firstImpl = lines.findIndex((l) =>
		/\b(implement|implementation)\b/.test(l),
	);
	if (firstTest === -1) return false;
	if (firstImpl === -1) return true;
	return firstTest < firstImpl;
}

export async function verifyChangeArtifacts(
	changeDir: string,
): Promise<ChangeArtifacts> {
	const missing: string[] = [];
	const warnings: string[] = [];

	if (!(await isNonEmptyFile(join(changeDir, "proposal.md"))))
		missing.push("proposal.md");
	if (!(await isNonEmptyDir(join(changeDir, "specs")))) missing.push("specs/");
	if (!(await isNonEmptyFile(join(changeDir, "design.md"))))
		missing.push("design.md");

	const tasksPath = join(changeDir, "tasks.md");
	if (!(await isNonEmptyFile(tasksPath))) {
		missing.push("tasks.md");
	} else if (!isTestsFirst(await Bun.file(tasksPath).text())) {
		warnings.push("tasks.md does not appear tests-first");
	}

	return {
		ok: missing.length === 0 && warnings.length === 0,
		missing,
		warnings,
	};
}

if (import.meta.main) {
	const dir = process.argv[2];
	if (!dir) {
		console.error("usage: verify-change <changeDir>");
		process.exit(2);
	}
	const result = await verifyChangeArtifacts(dir);
	console.log(JSON.stringify(result));
	process.exit(result.ok ? 0 : 1);
}
