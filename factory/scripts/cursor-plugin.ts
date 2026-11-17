import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CURSOR_PLUGIN_INVOCATION = "scripts/cursor-plugin.ts build <plugin-dir> <factory-root>";

export const PLUGIN_NAME = "delivery";

// Stage skills act on a repository or tracker, so they start only when someone
// asks; the conductor reaches them through their sibling SKILL.md instead.
export const NOT_MODEL_INVOKED = [
	"groom",
	"draft",
	"execute",
	"address-comments",
	"mr-review",
	"openspec-archive",
] as const;

const NO_MODEL_INVOCATION = "disable-model-invocation: true";

export function withoutModelInvocation(skill: string): string {
	const end = skill.indexOf("\n---\n", 4);
	if (!skill.startsWith("---\n") || end < 0) {
		throw new Error("skill file has no frontmatter");
	}
	const frontmatter = skill.slice(4, end);
	if (frontmatter.split("\n").includes(NO_MODEL_INVOCATION)) return skill;
	return `---\n${frontmatter}\n${NO_MODEL_INVOCATION}${skill.slice(end)}`;
}

const WRITE_TOOLS = new Set([
	"Write",
	"Edit",
	"MultiEdit",
	"NotebookEdit",
	"Bash",
]);

interface AgentSource {
	name: string;
	description: string;
	tools: string[];
	body: string;
}

export function parseAgent(text: string): AgentSource {
	const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) throw new Error("agent file has no frontmatter");
	const fields = new Map<string, string>();
	for (const line of (match[1] as string).split("\n")) {
		const field = line.match(/^([a-z-]+):\s*(.*)$/);
		if (field) fields.set(field[1] as string, (field[2] as string).trim());
	}
	const name = fields.get("name");
	const description = fields.get("description");
	if (!name || !description) {
		throw new Error("agent frontmatter needs name and description");
	}
	return {
		name,
		description,
		tools: (fields.get("tools") ?? "")
			.split(",")
			.map((tool) => tool.trim())
			.filter(Boolean),
		body: match[2] as string,
	};
}

// An agent that declares no tool able to change files or run commands is a
// judge; the plugin asks the host to enforce that rather than trust the prompt.
export function isReadOnly(tools: string[]): boolean {
	return tools.length > 0 && !tools.some((tool) => WRITE_TOOLS.has(tool));
}

export function pluginAgent(text: string): {
	name: string;
	markdown: string;
	readonly: boolean;
} {
	const agent = parseAgent(text);
	const readonly = isReadOnly(agent.tools);
	return {
		name: agent.name,
		readonly,
		markdown: [
			"---",
			`name: ${agent.name}`,
			`description: ${JSON.stringify(agent.description)}`,
			"model: inherit",
			`readonly: ${readonly}`,
			"---",
			agent.body,
		].join("\n"),
	};
}

export function pluginManifest(version: string) {
	return {
		name: PLUGIN_NAME,
		displayName: "Delivery",
		version,
		description:
			"Delivery lifecycle skills with their judging agents run read-only by the host.",
		skills: "./skills/",
		agents: "./agents/",
	};
}

export async function buildPlugin(pluginDir: string, factoryRoot: string) {
	const agentsDir = join(pluginDir, "agents");
	await mkdir(agentsDir, { recursive: true });
	await mkdir(join(pluginDir, ".cursor-plugin"), { recursive: true });
	const agents: { name: string; readonly: boolean }[] = [];
	for (const file of (await readdir(join(factoryRoot, "agents"))).sort()) {
		if (!file.endsWith(".md")) continue;
		const agent = pluginAgent(
			await readFile(join(factoryRoot, "agents", file), "utf8"),
		);
		await writeFile(join(agentsDir, `${agent.name}.md`), agent.markdown);
		agents.push({ name: agent.name, readonly: agent.readonly });
	}
	const skillsDir = join(pluginDir, "skills");
	const stageSkills: string[] = [];
	if (existsSync(skillsDir)) {
		for (const name of NOT_MODEL_INVOKED) {
			const path = join(skillsDir, name, "SKILL.md");
			await writeFile(
				path,
				withoutModelInvocation(await readFile(path, "utf8")),
			);
			stageSkills.push(name);
		}
	}
	const pkg = JSON.parse(
		await readFile(join(factoryRoot, "package.json"), "utf8"),
	) as { version?: string };
	const manifest = pluginManifest(pkg.version ?? "0.1.0");
	await writeFile(
		join(pluginDir, ".cursor-plugin", "plugin.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	return { manifest, agents, stageSkills };
}

// A plugin install keeps the factory at <plugin>/skills/_factory. Returns null
// for any other install, so only a plugin is checked.
export function pluginDrift(
	factoryRoot: string,
): { plugin: string; differences: string[] } | null {
	const plugin = resolve(factoryRoot, "..", "..");
	if (!existsSync(join(plugin, ".cursor-plugin", "plugin.json"))) return null;
	const differences: string[] = [];
	const expected = new Map<string, string>();
	for (const file of readdirSync(join(factoryRoot, "agents")).sort()) {
		if (!file.endsWith(".md")) continue;
		const agent = pluginAgent(
			readFileSync(join(factoryRoot, "agents", file), "utf8"),
		);
		expected.set(agent.name, agent.markdown);
		const path = join(plugin, "agents", `${agent.name}.md`);
		if (!existsSync(path)) {
			differences.push(`agent ${agent.name} is missing`);
			continue;
		}
		const installed = readFileSync(path, "utf8");
		if (agent.readonly && !/^readonly: true$/m.test(installed)) {
			differences.push(`agent ${agent.name} is not read-only`);
		} else if (installed !== agent.markdown) {
			differences.push(
				`agent ${agent.name} differs from the installed factory`,
			);
		}
	}
	const agentsDir = join(plugin, "agents");
	for (const file of existsSync(agentsDir)
		? readdirSync(agentsDir).sort()
		: []) {
		const name = file.replace(/\.md$/, "");
		if (file.endsWith(".md") && !expected.has(name)) {
			differences.push(`agent ${name} is not in the installed factory`);
		}
	}
	for (const name of NOT_MODEL_INVOKED) {
		const path = join(plugin, "skills", name, "SKILL.md");
		const text = existsSync(path) ? readFileSync(path, "utf8") : "";
		if (!text.split("\n---\n")[0]?.split("\n").includes(NO_MODEL_INVOCATION)) {
			differences.push(`skill ${name} can be started by the model`);
		}
	}
	return { plugin, differences };
}

if (import.meta.main) {
	const [command, pluginDir, factoryRoot] = process.argv.slice(2);
	if (command !== "build" || !pluginDir || !factoryRoot) {
		console.error(`usage: ${CURSOR_PLUGIN_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(
			JSON.stringify(await buildPlugin(pluginDir, factoryRoot), null, 2),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
