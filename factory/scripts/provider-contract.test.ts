import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateProvider } from "./provider-contract";

const gitlab = {
	name: "gitlab",
	version: 1,
	kind: "forge" as const,
	tools: ["gl-mr", "gl-note"],
};

test("GitLab capabilities are available only after tools, dependencies, and credentials exist", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-"));
	try {
		for (const tool of gitlab.tools) await writeFile(join(root, tool), tool);
		const ready = evaluateProvider(gitlab, {
			binDir: root,
			env: { GITLAB_TOKEN: "present-but-never-reported" },
			which: (name) => `/usr/bin/${name}`,
		});
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["forge.change"]?.available).toBe(true);
		expect(JSON.stringify(ready)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("missing GitLab setup stays unavailable and names remedies", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-missing-"));
	try {
		const missing = evaluateProvider(gitlab, {
			binDir: root,
			env: {},
			which: () => null,
		});
		expect(missing.ready).toBe(false);
		expect(missing.runtime.capabilities["forge.change"]?.available).toBe(false);
		expect(missing.reasons.join("\n")).toMatch(/GITLAB_TOKEN/);
		expect(missing.reasons.join("\n")).toMatch(/curl/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Jira remains unavailable until the host tracker probe exists", () => {
	const jira = evaluateProvider(
		{ name: "jira", version: 1, kind: "tracker", tools: [] },
		{ binDir: "/unused", env: {}, which: () => null },
	);
	expect(jira.ready).toBe(false);
	expect(jira.runtime.capabilities["tracker.item"]?.available).toBe(false);
	expect(jira.reasons.join("\n")).toMatch(/host runtime/);
});

test("OpenSpec readiness follows the installed CLI without inventing a runtime capability", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-openspec-"));
	try {
		await mkdir(root, { recursive: true });
		const openspec = evaluateProvider(
			{ name: "openspec", version: 1, kind: "spec-tool", tools: [] },
			{
				binDir: root,
				env: {},
				which: (name) => (name === "openspec" ? "/bin/openspec" : null),
			},
		);
		expect(openspec.ready).toBe(true);
		expect(openspec.runtime.capabilities).toEqual({});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
