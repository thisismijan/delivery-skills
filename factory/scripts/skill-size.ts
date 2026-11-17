import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// Each SKILL.md loads in full when its skill starts, so every byte added is
// paid on every run. A recorded ceiling makes growth a deliberate choice.
export const PACK_ROOT = join(import.meta.dir, "..", "..");
export const SKILL_SIZE_CEILINGS_PATH = join(
	PACK_ROOT,
	"factory",
	"skill-size-ceilings.json",
);

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SKILL_SIZE_CHECK_INVOCATION = "scripts/skill-size.ts check";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SKILL_SIZE_RAISE_INVOCATION = "scripts/skill-size.ts raise <skill-path>";

export type SkillSizes = Record<string, number>;

export function skillFiles(root = join(PACK_ROOT, "skills")): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(root)) {
		const full = join(root, entry);
		if (statSync(full).isDirectory()) files.push(...skillFiles(full));
		else if (entry === "SKILL.md") files.push(full);
	}
	return files.sort();
}

export function currentSizes(packRoot = PACK_ROOT): SkillSizes {
	return Object.fromEntries(
		skillFiles(join(packRoot, "skills")).map((path) => [
			relative(packRoot, path),
			statSync(path).size,
		]),
	);
}

export function skillSizeIssues(
	ceilings: SkillSizes,
	sizes: SkillSizes,
): string[] {
	const issues: string[] = [];
	for (const [path, size] of Object.entries(sizes)) {
		const ceiling = ceilings[path];
		if (ceiling === undefined) {
			issues.push(
				`${path} has no recorded size ceiling. Record one with ${SKILL_SIZE_RAISE_INVOCATION}.`,
			);
		} else if (size > ceiling) {
			issues.push(
				`${path} is ${size} bytes, over its ceiling of ${ceiling}. Slim it, or raise the ceiling deliberately with ${SKILL_SIZE_RAISE_INVOCATION}.`,
			);
		}
	}
	for (const path of Object.keys(ceilings)) {
		if (!(path in sizes))
			issues.push(`${path} has a ceiling but no such skill exists.`);
	}
	return issues;
}

export function readCeilings(path = SKILL_SIZE_CEILINGS_PATH): SkillSizes {
	return JSON.parse(readFileSync(path, "utf8")) as SkillSizes;
}

if (import.meta.main) {
	const [command, target] = process.argv.slice(2);
	if (command === "check") {
		const issues = skillSizeIssues(readCeilings(), currentSizes());
		for (const issue of issues) console.error(issue);
		process.exit(issues.length > 0 ? 1 : 0);
	} else if (command === "raise" && target) {
		const sizes = currentSizes();
		if (!(target in sizes)) {
			console.error(`${target} is not a SKILL.md in this pack.`);
			process.exit(1);
		}
		const ceilings = { ...readCeilings(), [target]: sizes[target] as number };
		const sorted = Object.fromEntries(
			Object.entries(ceilings).sort(([a], [b]) => a.localeCompare(b)),
		);
		writeFileSync(
			SKILL_SIZE_CEILINGS_PATH,
			`${JSON.stringify(sorted, null, "\t")}\n`,
		);
		console.log(JSON.stringify({ [target]: sizes[target] }));
	} else {
		console.error(
			`usage: ${SKILL_SIZE_CHECK_INVOCATION}\n       ${SKILL_SIZE_RAISE_INVOCATION}`,
		);
		process.exit(2);
	}
}
