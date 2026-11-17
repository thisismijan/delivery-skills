import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	cursorHookCommand,
	cursorHooksContainGuard,
	installCursorMutationHook,
	mergeCursorMutationHook,
} from "./cursor-settings";

test("merges the denial hook without replacing unrelated hooks", () => {
	const command = cursorHookCommand("/skills/_factory");
	const merged = mergeCursorMutationHook(
		{
			version: 1,
			theme: "dark",
			hooks: {
				afterFileEdit: [{ command: "audit.sh" }],
				beforeShellExecution: [{ command: "existing-guard" }],
			},
		},
		command,
	);
	expect(merged.theme).toBe("dark");
	expect(JSON.stringify(merged)).toContain("existing-guard");
	expect(JSON.stringify(merged)).toContain("audit.sh");
	expect(cursorHooksContainGuard(merged, "/skills/_factory")).toBe(true);
	expect(
		JSON.stringify(mergeCursorMutationHook(merged, command)).match(
			/--protocol cursor/g,
		),
	).toHaveLength(3);
});

test("installs atomically, backs up, and records verified evidence", async () => {
	const root = await mkdtemp(join(tmpdir(), "cursor-settings-"));
	try {
		const hooks = join(root, ".cursor", "hooks.json");
		const factory = join(root, "skills", "_factory");
		const evidence = join(factory, ".mutation-guard-enforced");
		await mkdir(join(root, ".cursor"), { recursive: true });
		await mkdir(factory, { recursive: true });
		await writeFile(hooks, '{"version":1,"other":true}\n');
		await installCursorMutationHook(hooks, factory, evidence);
		expect(await readFile(`${hooks}.delivery-backup`, "utf8")).toBe(
			'{"version":1,"other":true}\n',
		);
		const persisted = JSON.parse(await readFile(hooks, "utf8")) as unknown;
		expect(cursorHooksContainGuard(persisted, factory)).toBe(true);
		expect(JSON.stringify(persisted)).toContain("failClosed");
		expect(await readFile(evidence, "utf8")).toBe("verified\n");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("malformed hooks fail without changing the original", async () => {
	const root = await mkdtemp(join(tmpdir(), "cursor-settings-bad-"));
	try {
		const hooks = join(root, "hooks.json");
		const original = '{"version":1,"hooks":{"beforeShellExecution":{}}}';
		await writeFile(hooks, original);
		await expect(
			installCursorMutationHook(
				hooks,
				join(root, "factory"),
				join(root, "evidence"),
			),
		).rejects.toThrow(/beforeShellExecution must be an array/);
		expect(await readFile(hooks, "utf8")).toBe(original);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
