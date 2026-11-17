import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	MANAGED_AGENTS_FILE,
	claudeAgent,
	installAgents,
} from "./claude-agents";

const factoryRoot = join(import.meta.dir, "..");
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function dir() {
	const root = mkdtempSync(join(tmpdir(), "claude-agents-"));
	roots.push(root);
	return root;
}
const agentFiles = readdirSync(join(factoryRoot, "agents"))
	.filter((file) => file.endsWith(".md"))
	.sort();

test("every factory agent installs as a native agent keeping its tools", () => {
	const agents = join(dir(), "agents");
	expect(installAgents(agents, factoryRoot)).toEqual({
		written: agentFiles.map((file) => file.replace(/\.md$/, "")).sort(),
		removed: [],
	});
	const reviewer = readFileSync(join(agents, "holdout-reviewer.md"), "utf8");
	expect(reviewer).toContain("tools: Read, Grep, Glob");
	expect(reviewer).toContain("model: inherit");
	expect(reviewer).not.toContain("model: opus");
	expect(
		JSON.parse(readFileSync(join(agents, MANAGED_AGENTS_FILE), "utf8")).managed,
	).toHaveLength(agentFiles.length);
});

test("a reinstall replaces only managed agents and removes ones the factory dropped", () => {
	const agents = join(dir(), "agents");
	mkdirSync(agents, { recursive: true });
	writeFileSync(
		join(agents, "mine.md"),
		"---\nname: mine\ndescription: x\n---\n",
	);
	writeFileSync(join(agents, "retired.md"), "old");
	writeFileSync(
		join(agents, MANAGED_AGENTS_FILE),
		JSON.stringify({ managed: ["retired"] }),
	);
	expect(installAgents(agents, factoryRoot).removed).toEqual(["retired"]);
	expect(existsSync(join(agents, "retired.md"))).toBe(false);
	expect(readFileSync(join(agents, "mine.md"), "utf8")).toContain("name: mine");
	expect(installAgents(agents, factoryRoot).removed).toEqual([]);
});

test("an agent of the same name the pack did not install is never replaced", () => {
	const agents = join(dir(), "agents");
	mkdirSync(agents, { recursive: true });
	writeFileSync(join(agents, "holdout-reviewer.md"), "the operator's own");
	expect(() => installAgents(agents, factoryRoot)).toThrow(
		"refusing to replace agents this pack did not install",
	);
	expect(readFileSync(join(agents, "holdout-reviewer.md"), "utf8")).toBe(
		"the operator's own",
	);
	expect(existsSync(join(agents, "implementer.md"))).toBe(false);
});

test("only the model line changes", () => {
	const source = readFileSync(
		join(factoryRoot, "agents", "implementer.md"),
		"utf8",
	);
	const { name, markdown } = claudeAgent(source);
	expect(name).toBe("implementer");
	expect(markdown).toBe(source.replace(/^model: .*$/m, "model: inherit"));
});
