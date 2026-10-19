import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateProvider } from "./provider-contract";

const gitlab = {
	name: "gitlab",
	version: 1,
	kind: "forge" as const,
	tools: ["gitlab-forge", "gl-mr", "gl-note"],
};

const setup = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"gitlab",
	"setup.sh",
);

test("GitLab capabilities advertise exec:absolute path and provider gitlab", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-"));
	try {
		await writeFile(join(root, "gitlab-forge"), "#!/usr/bin/env bun\n");
		const ready = evaluateProvider(gitlab, {
			binDir: root,
			env: { GITLAB_TOKEN: "present-but-never-reported" },
			which: (name) => `/usr/bin/${name}`,
		});
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["forge.change"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(root, "gitlab-forge")}`,
			provider: "gitlab",
		});
		expect(ready.runtime.capabilities["review.publish"]).toEqual(
			ready.runtime.capabilities["forge.change"],
		);
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
		expect(missing.runtime.capabilities["review.publish"]?.available).toBe(
			false,
		);
		expect(missing.reasons.join("\n")).toMatch(/GITLAB_TOKEN/);
		expect(missing.reasons.join("\n")).toMatch(/gitlab-forge/);
		expect(missing.reasons.join("\n")).toMatch(/bun/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("GitLab setup installs gitlab-forge and keeps compatibility tools", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-setup-"));
	try {
		const bin = join(root, "bin");
		await mkdir(bin, { recursive: true });
		const proc = Bun.spawn(["bash", setup], {
			env: {
				...process.env,
				DELIVERY_BIN_DIR: bin,
				HOME: root,
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(code).toBe(0);
		expect(`${stdout}\n${stderr}`).not.toMatch(/GITLAB_TOKEN=|glpat-/);
		for (const tool of ["gitlab-forge", "gl-mr", "gl-note"]) {
			const installed = Bun.file(join(bin, tool));
			expect(await installed.exists()).toBe(true);
		}
		const source = await Bun.file(join(bin, "gitlab-forge")).text();
		expect(source.startsWith("#!/usr/bin/env bun")).toBe(true);
		expect(source).not.toContain("DELIVERY_PACK_ROOT");
		const ready = evaluateProvider(gitlab, {
			binDir: bin,
			env: { GITLAB_TOKEN: "present-but-never-reported", HOME: root },
			which: (name) => (name === "bun" ? "/usr/bin/bun" : null),
		});
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["forge.change"]?.invocation).toBe(
			`exec:${join(bin, "gitlab-forge")}`,
		);
		expect(ready.runtime.capabilities["forge.change"]?.provider).toBe("gitlab");
		expect(ready.runtime.capabilities["review.publish"]?.invocation).toBe(
			ready.runtime.capabilities["forge.change"]?.invocation,
		);
		expect(JSON.stringify(ready)).not.toContain("present-but-never-reported");
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
