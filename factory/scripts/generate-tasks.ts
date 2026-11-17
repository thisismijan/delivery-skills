import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { sanitizeHumanText } from "./human-text";

export interface SpecScenario {
	capability: string;
	requirement: string;
	name: string;
}

const SCENARIO = /^#{4}\s+Scenario:\s+(.+?)\s*$/;
const REQUIREMENT = /^#{3}\s+Requirement:\s+(.+?)\s*$/;

export function collectScenarios(
	specMarkdown: string,
	capability: string,
): SpecScenario[] {
	const scenarios: SpecScenario[] = [];
	let requirement = "";
	for (const line of specMarkdown.split("\n")) {
		const req = line.match(REQUIREMENT);
		if (req?.[1]) {
			requirement = sanitizeHumanText(req[1]);
			continue;
		}
		const scenario = line.match(SCENARIO);
		if (!scenario?.[1]) {
			continue;
		}
		if (!requirement) {
			throw new Error("scenario is missing a requirement heading");
		}
		scenarios.push({
			capability,
			requirement,
			name: sanitizeHumanText(scenario[1]),
		});
	}
	return scenarios;
}

export function generateTasksMarkdown(scenarios: SpecScenario[]): string {
	if (scenarios.length === 0) {
		throw new Error("no spec scenarios to turn into tasks");
	}
	const tests = scenarios.map(
		(scenario, index) =>
			`- [ ] 1.${index + 1} Prove ${scenario.name.replace(/\.$/, "")}.`,
	);
	return [
		"## 1. Tests",
		"",
		...tests,
		"",
		"## 2. Implementation",
		"",
		"- [ ] 2.1 Implement the specified behaviour so every scenario above holds.",
		"",
	].join("\n");
}

async function specFiles(specsDir: string): Promise<string[]> {
	const found: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (entry.isFile() && entry.name === "spec.md") {
				found.push(full);
			}
		}
	};
	await walk(specsDir);
	return found.sort();
}

function capabilityOf(specsDir: string, specFile: string): string {
	const rel = specFile.slice(specsDir.length).split(sep).filter(Boolean);
	if (rel.length >= 2 && rel[rel.length - 1] === "spec.md") {
		return rel[rel.length - 2] ?? "change";
	}
	return "change";
}

export async function generateTasksFile(changeDir: string): Promise<string> {
	const root = resolve(changeDir);
	const specsDir = join(root, "specs");
	const stats = await stat(specsDir).catch(() => undefined);
	if (!stats?.isDirectory()) {
		throw new Error("change specs directory is missing");
	}
	const files = await specFiles(specsDir);
	if (files.length === 0) {
		throw new Error("change specs directory is missing");
	}
	const scenarios: SpecScenario[] = [];
	for (const file of files) {
		const text = await Bun.file(file).text();
		scenarios.push(...collectScenarios(text, capabilityOf(specsDir, file)));
	}
	const markdown = generateTasksMarkdown(scenarios);
	const out = join(root, "tasks.md");
	if (dirname(out) !== root || basename(out) !== "tasks.md") {
		throw new Error("tasks path escaped the change directory");
	}
	await mkdir(root, { recursive: true });
	await Bun.write(out, markdown);
	return out;
}

if (import.meta.main) {
	const changeDir = process.argv[2];
	if (!changeDir) {
		console.error("usage: generate-tasks <changeDir>");
		process.exit(2);
	}
	try {
		const path = await generateTasksFile(changeDir);
		console.log(JSON.stringify({ path }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
