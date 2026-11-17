import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parseAgent } from "./cursor-plugin";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const CLAUDE_AGENTS_INVOCATION = "scripts/claude-agents.ts install <agents-dir> <factory-root>";

export const MANAGED_AGENTS_FILE = ".delivery-agents.json";

const Managed = z
	.object({ managed: z.array(z.string().regex(/^[a-z0-9-]+$/)) })
	.strict();

// The host enforces a native agent's declared tools; the model follows the
// skill's resolved choice, so the static model name becomes inherit.
export function claudeAgent(text: string): { name: string; markdown: string } {
	const { name } = parseAgent(text);
	const end = text.indexOf("\n---\n", 4);
	const frontmatter = text
		.slice(4, end)
		.split("\n")
		.map((line) => (line.startsWith("model:") ? "model: inherit" : line))
		.join("\n");
	return { name, markdown: `---\n${frontmatter}${text.slice(end)}` };
}

function readManaged(agentsDir: string): string[] {
	const path = join(agentsDir, MANAGED_AGENTS_FILE);
	if (!existsSync(path)) return [];
	return Managed.parse(JSON.parse(readFileSync(path, "utf8"))).managed;
}

export function installAgents(
	agentsDir: string,
	factoryRoot: string,
): { written: string[]; removed: string[] } {
	const previous = new Set(readManaged(agentsDir));
	const agents = readdirSync(join(factoryRoot, "agents"))
		.filter((file) => file.endsWith(".md"))
		.sort()
		.map((file) =>
			claudeAgent(readFileSync(join(factoryRoot, "agents", file), "utf8")),
		);
	const conflicts = agents
		.map((agent) => agent.name)
		.filter(
			(name) =>
				existsSync(join(agentsDir, `${name}.md`)) && !previous.has(name),
		);
	if (conflicts.length > 0) {
		throw new Error(
			`refusing to replace agents this pack did not install: ${conflicts.map((name) => join(agentsDir, `${name}.md`)).join(", ")}`,
		);
	}
	mkdirSync(agentsDir, { recursive: true });
	const names = new Set(agents.map((agent) => agent.name));
	const removed = [...previous].filter((name) => !names.has(name)).sort();
	for (const name of removed)
		rmSync(join(agentsDir, `${name}.md`), { force: true });
	for (const agent of agents)
		writeFileSync(join(agentsDir, `${agent.name}.md`), agent.markdown);
	writeFileSync(
		join(agentsDir, MANAGED_AGENTS_FILE),
		`${JSON.stringify({ managed: [...names].sort() }, null, 2)}\n`,
	);
	return { written: [...names].sort(), removed };
}

if (import.meta.main) {
	const [command, agentsDir, factoryRoot] = process.argv.slice(2);
	if (command !== "install" || !agentsDir || !factoryRoot) {
		console.error(`usage: ${CLAUDE_AGENTS_INVOCATION}`);
		process.exit(2);
	}
	try {
		const result = installAgents(agentsDir, factoryRoot);
		console.log(
			`Claude Code agents -> ${agentsDir} (${result.written.length} installed)`,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
