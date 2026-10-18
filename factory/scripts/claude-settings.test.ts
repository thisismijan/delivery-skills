import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	installClaudeMutationHook,
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
