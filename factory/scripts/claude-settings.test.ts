import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bunOptionsWithPreload,
	claudeSettingsCarryPreload,
	installClaudeMutationHook,
	mergeClaudeAgentSummaryPreload,
	mergeClaudeMutationHook,
} from "./claude-settings";

test("merges the mutation hook without replacing unrelated settings", () => {
	const command = 'bun "/skills/_factory/scripts/commit-guard.ts"';
	const merged = mergeClaudeMutationHook(
		{
			theme: "dark",
			hooks: {
				PreToolUse: [
					{
						matcher: "Bash",
						hooks: [{ type: "command", command: "existing-guard" }],
					},
				],
			},
		},
		command,
	);
	expect(merged.theme).toBe("dark");
	expect(JSON.stringify(merged)).toContain("existing-guard");
	const hooks =
		(
			merged.hooks as {
				PreToolUse: Array<{
					matcher: string;
					hooks: Array<{ type: string; command: string }>;
				}>;
			}
		).PreToolUse[0]?.hooks ?? [];
	expect(hooks).toContainEqual({ type: "command", command });
	expect(
		JSON.stringify(mergeClaudeMutationHook(merged, command)).match(
			/commit-guard\.ts/g,
		),
	).toHaveLength(1);
});

test("installs atomically, backs up, and records verified evidence", async () => {
	const root = await mkdtemp(join(tmpdir(), "claude-settings-"));
	try {
		const settings = join(root, ".claude", "settings.json");
		const factory = join(root, "skills", "_factory");
		const evidence = join(factory, ".mutation-guard-enforced");
		await mkdir(join(root, ".claude"), { recursive: true });
		await mkdir(factory, { recursive: true });
		await writeFile(settings, '{"theme":"dark"}\n');
		await installClaudeMutationHook(settings, factory, evidence);
		expect(await readFile(`${settings}.delivery-backup`, "utf8")).toBe(
			'{"theme":"dark"}\n',
		);
		expect(await readFile(settings, "utf8")).toContain("commit-guard.ts");
		expect(await readFile(evidence, "utf8")).toBe("verified\n");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("malformed settings fail without changing the original", async () => {
	const root = await mkdtemp(join(tmpdir(), "claude-settings-bad-"));
	try {
		const settings = join(root, "settings.json");
		const original = '{"hooks":{"PreToolUse":{}}}';
		await writeFile(settings, original);
		await expect(
			installClaudeMutationHook(
				settings,
				join(root, "factory"),
				join(root, "evidence"),
			),
		).rejects.toThrow(/PreToolUse must be an array/);
		expect(await readFile(settings, "utf8")).toBe(original);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("preload merge keeps other env and existing BUN_OPTIONS flags", () => {
	const path = "/skills/_factory/host/no-agent-summary.js";
	const merged = mergeClaudeAgentSummaryPreload(
		{
			theme: "dark",
			env: { ANTHROPIC_API_KEY: "kept", BUN_OPTIONS: "--smol" },
		},
		path,
	);
	expect(merged.theme).toBe("dark");
	expect(merged.env).toEqual({
		ANTHROPIC_API_KEY: "kept",
		BUN_OPTIONS: `--smol --preload ${path}`,
	});
	expect(
		mergeClaudeAgentSummaryPreload(merged, path).env as { BUN_OPTIONS: string },
	).toMatchObject({ BUN_OPTIONS: `--smol --preload ${path}` });
	expect(() => bunOptionsWithPreload("", "relative.js")).toThrow(
		/absolute file path/,
	);
	expect(claudeSettingsCarryPreload(merged, path)).toBe(true);
	expect(claudeSettingsCarryPreload(merged, "/other.js")).toBe(false);
});

test("install writes the preload into settings env", async () => {
	const root = await mkdtemp(join(tmpdir(), "claude-settings-preload-"));
	try {
		const settings = join(root, "settings.json");
		const factory = join(root, "factory");
		const evidence = join(factory, ".mutation-guard-enforced");
		const preload = join(factory, "host", "no-agent-summary.js");
		await mkdir(join(factory, "host"), { recursive: true });
		await writeFile(preload, "// hook\n");
		await writeFile(settings, '{"env":{"KEEP":"yes"}}\n');
		await installClaudeMutationHook(settings, factory, evidence, preload);
		const persisted = JSON.parse(await readFile(settings, "utf8")) as {
			env: { KEEP: string; BUN_OPTIONS: string };
		};
		expect(persisted.env.KEEP).toBe("yes");
		expect(persisted.env.BUN_OPTIONS).toBe(`--preload ${preload}`);
		expect(await readFile(settings, "utf8")).toContain("commit-guard.ts");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the vendored preload only installs inside Claude Code's compiled image", () => {
	const source = readFileSync(
		join(
			import.meta.dir,
			"..",
			"..",
			"adapters",
			"claude-code",
			"no-agent-summary.js",
		),
		"utf8",
	);
	expect(source).toContain('Bun.main.startsWith("/$bunfs/")');
	expect(source).toContain("if (IN_COMPILED_BUN) install();");
	expect(source).toContain("[AgentSummary] Timer fired");
	expect(source).toContain("agent_summary");
	expect(source).toMatch(/SPDX-License-Identifier: MIT/);
});
