import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	formatInitHandoff,
	initializeTargetRepository,
	withDeliveryIgnores,
} from "./delivery-init";
import { doctorReadiness } from "./doctor";
import { defaultRuntimeManifest } from "./runtime-manifest";

test("delivery ignore entries are idempotent", () => {
	const once = withDeliveryIgnores("node_modules/\n");
	const twice = withDeliveryIgnores(once);
	expect(once).toBe("node_modules/\n.delivery/\n.review/\n");
	expect(twice).toBe(once);
});

test("initializes a target repository without replacing existing ignores", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-init-"));
	try {
		expect(await Bun.spawn(["git", "init", "-q", root]).exited).toBe(0);
		await writeFile(join(root, ".gitignore"), "node_modules/\n");
		expect(await initializeTargetRepository(root)).toBe(root);
		expect(await initializeTargetRepository(root)).toBe(root);
		expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(
			"node_modules/\n.delivery/\n.review/\n",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persists only the explicitly confirmed work-item provider", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-init-provider-"));
	try {
		expect(await Bun.spawn(["git", "init", "-q", root]).exited).toBe(0);
		await initializeTargetRepository(root, {
			providerId: "local-files",
			runtime: defaultRuntimeManifest(true),
		});
		expect(
			JSON.parse(
				await readFile(join(root, ".delivery", "work-items.json"), "utf8"),
			),
		).toMatchObject({
			provider: { id: "local-files", kind: "local-files" },
			confirmed: true,
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refuses to initialize outside a git repository", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-init-no-git-"));
	try {
		await expect(initializeTargetRepository(root)).rejects.toThrow(
			/inside the target git repository/,
		);
		expect(await Bun.file(join(root, ".gitignore")).exists()).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("init handoff reprints only unresolved doctor checks", () => {
	const checks = [
		{
			category: "Ready now" as const,
			name: "Runtime manifest",
			detail: "valid",
			required: true,
			ok: true,
		},
		{
			category: "Needs setup" as const,
			name: "Bun runtime",
			detail: "install Bun 1.4.2",
			required: false,
			ok: false,
		},
		{
			category: "Human-owned" as const,
			name: "Merge",
			detail: "requires explicit operator action",
			required: false,
			ok: true,
		},
	];
	const output = formatInitHandoff({
		root: "/repo",
		runtime: defaultRuntimeManifest(true),
		selection: {
			state: "ready",
			selection: {
				version: 1,
				provider: { id: "gitlab", kind: "remote" },
				confirmed: true,
			},
		},
		doctor: { checks, ...doctorReadiness(checks) },
	});
	expect(output).toContain("NEEDS SETUP");
	expect(output).toContain("Bun runtime");
	expect(output).toContain("Work-item provider: gitlab");
	expect(output).toContain("/delivery help");
	expect(output).not.toContain("READY NOW");
	expect(output).not.toContain("HUMAN-OWNED");
});
