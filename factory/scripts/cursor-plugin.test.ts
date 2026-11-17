import { expect, setDefaultTimeout, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	NOT_MODEL_INVOKED,
	PLUGIN_NAME,
	buildPlugin,
	isReadOnly,
	parseAgent,
	pluginAgent,
	pluginDrift,
	withoutModelInvocation,
} from "./cursor-plugin";
import { pluginDoctorCheck } from "./doctor";
import { parseSkillName } from "./skill-metadata";

setDefaultTimeout(30_000);

const rootDir = join(import.meta.dir, "..", "..");
const factoryRoot = join(rootDir, "factory");
const agentText = (name: string) =>
	readFileSync(join(factoryRoot, "agents", `${name}.md`), "utf8");

test("judging agents are declared read-only and writing agents are not", () => {
	expect(pluginAgent(agentText("holdout-reviewer"))).toMatchObject({
		name: "holdout-reviewer",
		readonly: true,
	});
	for (const writer of ["implementer", "test-writer", "groom-writer"]) {
		expect(pluginAgent(agentText(writer)).readonly).toBe(false);
	}
	for (const file of readdirSync(join(factoryRoot, "agents"))) {
		const source = parseAgent(
			readFileSync(join(factoryRoot, "agents", file), "utf8"),
		);
		const writes = source.tools.some((tool) =>
			["Write", "Edit", "Bash"].includes(tool),
		);
		expect(
			pluginAgent(readFileSync(join(factoryRoot, "agents", file), "utf8"))
				.readonly,
		).toBe(!writes);
	}
	expect(isReadOnly([])).toBe(false);
	expect(isReadOnly(["Read", "Bash"])).toBe(false);
});

test("a plugin agent keeps the prompt and uses only the host's agent fields", () => {
	const agent = pluginAgent(agentText("holdout-reviewer"));
	const frontmatter = agent.markdown.split("\n---\n")[0] ?? "";
	expect(
		frontmatter
			.split("\n")
			.slice(1)
			.map((line) => line.split(":")[0]),
	).toEqual(["name", "description", "model", "readonly"]);
	expect(frontmatter).toContain("readonly: true");
	expect(frontmatter).toContain("model: inherit");
	expect(
		agent.markdown.endsWith(parseAgent(agentText("holdout-reviewer")).body),
	).toBe(true);
});

test("the build writes a valid manifest and one agent per factory agent", async () => {
	const dir = await mkdtemp(join(tmpdir(), "cursor-plugin-"));
	try {
		const result = await buildPlugin(dir, factoryRoot);
		const manifest = JSON.parse(
			await readFile(join(dir, ".cursor-plugin", "plugin.json"), "utf8"),
		);
		expect(manifest).toEqual(result.manifest);
		expect(manifest.name).toBe(PLUGIN_NAME);
		expect(manifest.name).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
		for (const field of ["skills", "agents"]) {
			expect(manifest[field]).toMatch(/^\.\//);
			expect(manifest[field]).not.toContain("..");
		}
		expect(readdirSync(join(dir, "agents")).sort()).toEqual(
			readdirSync(join(factoryRoot, "agents"))
				.filter((file) => file.endsWith(".md"))
				.sort(),
		);
		expect(
			await readFile(join(dir, "agents", "holdout-reviewer.md"), "utf8"),
		).toContain("readonly: true");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("the plugin install keeps the existing install inside the plugin", async () => {
	const root = await mkdtemp(join(tmpdir(), "cursor-plugin-install-"));
	try {
		const dest = join(root, "plugin");
		const proc = Bun.spawn(
			["bash", join(rootDir, "adapters/cursor/install-plugin.sh")],
			{
				cwd: rootDir,
				env: {
					...process.env,
					DELIVERY_INSTALL_SKIP_BUN: "1",
					CURSOR_PLUGIN_DIR: dest,
					CURSOR_HOOKS_FILE: join(root, "hooks.json"),
					DELIVERY_BIN_DIR: join(root, "bin"),
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(`${stdout}${stderr}`).toContain("Cursor plugin ->");
		expect(code).toBe(0);
		const frontmatter = async (name: string) =>
			(await readFile(join(dest, "skills", name, "SKILL.md"), "utf8")).split(
				"\n---\n",
			)[0] ?? "";
		for (const name of NOT_MODEL_INVOKED) {
			expect(await frontmatter(name)).toContain(
				"\ndisable-model-invocation: true",
			);
		}
		for (const name of ["delivery", "code-review-max"]) {
			expect(await frontmatter(name)).not.toContain("disable-model-invocation");
		}
		expect(
			readFileSync(join(rootDir, "skills/execute/SKILL.md"), "utf8"),
		).not.toContain("disable-model-invocation");
		for (const path of [
			"skills/delivery/SKILL.md",
			"skills/execute/SKILL.md",
			"skills/_factory/RUNTIME.md",
			"agents/holdout-reviewer.md",
			".cursor-plugin/plugin.json",
		]) {
			expect(await Bun.file(join(dest, path)).exists()).toBe(true);
		}
	} finally {
		await Bun.spawn(["chmod", "-R", "u+w", root]).exited;
		await rm(root, { recursive: true, force: true });
	}
});

test("the runtime dispatches a host-provided subagent by name and the adapter documents the plugin", () => {
	const runtime = readFileSync(join(factoryRoot, "RUNTIME.md"), "utf8").replace(
		/\s+/g,
		" ",
	);
	expect(runtime).toContain(
		"dispatch that subagent rather than a generic one carrying the prompt, so the host enforces the permissions it declares",
	);
	const readme = readFileSync(
		join(rootDir, "adapters/cursor/README.md"),
		"utf8",
	);
	expect(readme).toContain("bash adapters/cursor/install-plugin.sh");
	expect(
		readFileSync(join(rootDir, "adapters/cursor/install-plugin.sh"), "utf8"),
	).toContain('factory/scripts/cursor-plugin.ts" build "$dest"');
	expect(readFileSync(join(rootDir, "docs/reference.md"), "utf8")).toContain(
		"bash adapters/cursor/install-plugin.sh",
	);
});

test("stage skills are kept from the model while the conductor can still start them", () => {
	expect(NOT_MODEL_INVOKED).not.toContain("delivery" as never);
	expect(NOT_MODEL_INVOKED).not.toContain("code-review-max" as never);
	for (const name of NOT_MODEL_INVOKED) {
		expect(
			parseSkillName(
				readFileSync(join(rootDir, "skills", name, "SKILL.md"), "utf8"),
			),
		).toBe(name);
	}
	const skill = "---\nname: draft\ndescription: x\n---\nbody\n";
	const marked = withoutModelInvocation(skill);
	expect(marked).toBe(
		"---\nname: draft\ndescription: x\ndisable-model-invocation: true\n---\nbody\n",
	);
	expect(withoutModelInvocation(marked)).toBe(marked);
	expect(() => withoutModelInvocation("no frontmatter")).toThrow();
	const conductor = readFileSync(
		join(rootDir, "skills/delivery/SKILL.md"),
		"utf8",
	).replace(/\s+/g, " ");
	expect(conductor).toContain(
		"When the host does not offer you a stage command, because it lets stage skills start only on request, read the sibling `../<command>/SKILL.md` beside this file and follow it with the same arguments",
	);
});

async function fakePlugin() {
	const dir = await mkdtemp(join(tmpdir(), "cursor-plugin-drift-"));
	const factory = join(dir, "skills", "_factory");
	cpSync(join(factoryRoot, "agents"), join(factory, "agents"), {
		recursive: true,
	});
	cpSync(join(factoryRoot, "package.json"), join(factory, "package.json"));
	for (const name of [...NOT_MODEL_INVOKED, "delivery"]) {
		mkdirSync(join(dir, "skills", name), { recursive: true });
		writeFileSync(
			join(dir, "skills", name, "SKILL.md"),
			`---\nname: ${name}\ndescription: x\n---\nbody\n`,
		);
	}
	await buildPlugin(dir, factory);
	return { dir, factory };
}

test("doctor finds a plugin that has fallen behind the installed factory", async () => {
	const { dir, factory } = await fakePlugin();
	try {
		expect(pluginDrift(factory)).toEqual({ plugin: dir, differences: [] });
		expect(pluginDoctorCheck(factory)).toMatchObject({
			name: "Cursor plugin",
			ok: true,
		});
		const reviewer = join(dir, "agents", "holdout-reviewer.md");
		writeFileSync(
			reviewer,
			readFileSync(reviewer, "utf8").replace(
				"readonly: true",
				"readonly: false",
			),
		);
		writeFileSync(
			join(dir, "skills", "draft", "SKILL.md"),
			"---\nname: draft\ndescription: x\n---\nbody\n",
		);
		rmSync(join(dir, "agents", "implementer.md"));
		writeFileSync(
			join(dir, "agents", "retired.md"),
			"---\nname: retired\ndescription: x\n---\n",
		);
		writeFileSync(join(dir, "agents", "test-writer.md"), "changed");
		expect(pluginDrift(factory)?.differences).toEqual([
			"agent holdout-reviewer is not read-only",
			"agent implementer is missing",
			"agent test-writer differs from the installed factory",
			"agent retired is not in the installed factory",
			"skill draft can be started by the model",
		]);
		expect(pluginDoctorCheck(factory)).toMatchObject({
			ok: false,
			detail: expect.stringContaining(
				"Reinstall with bash adapters/cursor/install-plugin.sh",
			),
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("a plain install gets no plugin check", () => {
	expect(pluginDrift(factoryRoot)).toBeNull();
	expect(pluginDoctorCheck(factoryRoot)).toBeNull();
});
