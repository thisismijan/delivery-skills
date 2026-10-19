import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateProvider } from "./provider-contract";

const gitlab = {
	name: "gitlab",
	version: 1,
	kind: "forge" as const,
	tools: ["gitlab-forge", "gitlab-work-item"],
	capabilities: ["forge.change", "review.publish", "tracker.item"],
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
		await writeFile(join(root, "gitlab-work-item"), "#!/usr/bin/env bun\n");
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
		expect(ready.runtime.capabilities["tracker.item"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(root, "gitlab-work-item")}`,
			provider: "gitlab",
		});
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
		expect(missing.runtime.capabilities["tracker.item"]?.available).toBe(false);
		expect(missing.reasons.join("\n")).toMatch(/GITLAB_TOKEN/);
		expect(missing.reasons.join("\n")).toMatch(/gitlab-forge/);
		expect(missing.reasons.join("\n")).toMatch(/gitlab-work-item/);
		expect(missing.reasons.join("\n")).toMatch(/bun/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("GitLab setup installs forge and work-item executables without compatibility wrappers", async () => {
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
		for (const tool of ["gitlab-forge", "gitlab-work-item", "gitlab-host.ts"]) {
			const installed = Bun.file(join(bin, tool));
			expect(await installed.exists()).toBe(true);
		}
		expect(await Bun.file(join(bin, "gl-mr")).exists()).toBe(false);
		expect(await Bun.file(join(bin, "gl-note")).exists()).toBe(false);
		const source = await Bun.file(join(bin, "gitlab-forge")).text();
		expect(source.startsWith("#!/usr/bin/env bun")).toBe(true);
		expect(source).not.toContain("DELIVERY_PACK_ROOT");
		expect(source).toContain("./gitlab-host");
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
		expect(ready.runtime.capabilities["tracker.item"]?.invocation).toBe(
			`exec:${join(bin, "gitlab-work-item")}`,
		);
		expect(JSON.stringify(ready)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("GitLab probes advertised capabilities independently", async () => {
	const root = await mkdtemp(
		join(tmpdir(), "provider-contract-gitlab-partial-"),
	);
	try {
		await writeFile(join(root, "gitlab-forge"), "#!/usr/bin/env bun\n");
		const partial = evaluateProvider(gitlab, {
			binDir: root,
			env: { GITLAB_TOKEN: "present-but-never-reported" },
			which: (name) => `/usr/bin/${name}`,
		});
		expect(partial.ready).toBe(false);
		expect(partial.runtime.capabilities["forge.change"]?.available).toBe(true);
		expect(partial.runtime.capabilities["review.publish"]?.available).toBe(
			true,
		);
		expect(partial.runtime.capabilities["tracker.item"]?.available).toBe(false);
		expect(partial.reasons.join("\n")).toMatch(/gitlab-work-item/);
		expect(JSON.stringify(partial)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

const jiraSetup = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"jira",
	"setup.sh",
);

test("Jira stays unavailable until the tracker executable and project settings are present", () => {
	const jira = evaluateProvider(
		{ name: "jira", version: 1, kind: "tracker", tools: [] },
		{ binDir: "/unused", env: {}, which: () => null },
	);
	expect(jira.ready).toBe(false);
	expect(jira.runtime.capabilities["tracker.item"]?.available).toBe(false);
	expect(jira.reasons.join("\n")).toMatch(/jira-tracker/);
	expect(jira.reasons.join("\n")).toMatch(/bun/);
	expect(jira.reasons.join("\n")).toMatch(/JIRA_SITE/);
	expect(jira.reasons.join("\n")).toMatch(/JIRA_PROJECT/);
	expect(jira.reasons.join("\n")).toMatch(/JIRA_EMAIL/);
});

test("Jira capabilities advertise exec:absolute path and provider jira", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-jira-"));
	try {
		await writeFile(join(root, "jira-tracker"), "#!/usr/bin/env bun\n");
		const ready = evaluateProvider(
			{ name: "jira", version: 1, kind: "tracker", tools: ["jira-tracker"] },
			{
				binDir: root,
				env: {
					JIRA_SITE: "https://acme.atlassian.net",
					JIRA_PROJECT: "DELIV",
					JIRA_EMAIL: "ada@example.test",
					JIRA_API_TOKEN: "present-but-never-reported",
				},
				which: (name) => `/usr/bin/${name}`,
			},
		);
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["tracker.item"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(root, "jira-tracker")}`,
			provider: "jira",
		});
		expect(JSON.stringify(ready)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Jira setup installs jira-tracker and advertises tracker.item", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-jira-setup-"));
	try {
		const bin = join(root, "bin");
		await mkdir(bin, { recursive: true });
		const proc = Bun.spawn(["bash", jiraSetup], {
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
		expect(`${stdout}\n${stderr}`).not.toMatch(/JIRA_API_TOKEN=|ATATT/);
		const installed = Bun.file(join(bin, "jira-tracker"));
		expect(await installed.exists()).toBe(true);
		const source = await installed.text();
		expect(source.startsWith("#!/usr/bin/env bun")).toBe(true);
		expect(source).not.toContain("DELIVERY_PACK_ROOT");
		const ready = evaluateProvider(
			{ name: "jira", version: 1, kind: "tracker", tools: ["jira-tracker"] },
			{
				binDir: bin,
				env: {
					JIRA_SITE: "https://acme.atlassian.net",
					JIRA_PROJECT: "DELIV",
					JIRA_EMAIL: "ada@example.test",
					JIRA_API_TOKEN: "present-but-never-reported",
					HOME: root,
				},
				which: (name) => (name === "bun" ? "/usr/bin/bun" : null),
			},
		);
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["tracker.item"]?.invocation).toBe(
			`exec:${join(bin, "jira-tracker")}`,
		);
		expect(ready.runtime.capabilities["tracker.item"]?.provider).toBe("jira");
		expect(JSON.stringify(ready)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

const github = {
	name: "github",
	version: 1,
	kind: "forge" as const,
	capabilities: ["forge.change", "review.publish", "tracker.item"] as const,
	tools: ["github-forge", "github-tracker"],
};
const githubSetup = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"github",
	"setup.sh",
);

test("GitHub capabilities advertise forge, review, and tracker from one provider", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-github-"));
	try {
		await writeFile(join(root, "github-forge"), "#!/usr/bin/env bun\n");
		await writeFile(join(root, "github-tracker"), "#!/usr/bin/env bun\n");
		const ready = evaluateProvider(github, {
			binDir: root,
			env: { GITHUB_TOKEN: "present-but-never-reported" },
			which: (name) => `/usr/bin/${name}`,
		});
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["forge.change"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(root, "github-forge")}`,
			provider: "github",
		});
		expect(ready.runtime.capabilities["review.publish"]).toEqual(
			ready.runtime.capabilities["forge.change"],
		);
		expect(ready.runtime.capabilities["tracker.item"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(root, "github-tracker")}`,
			provider: "github",
		});
		expect(JSON.stringify(ready)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("GitHub probes advertised capabilities independently", async () => {
	const root = await mkdtemp(
		join(tmpdir(), "provider-contract-github-partial-"),
	);
	try {
		await writeFile(join(root, "github-forge"), "#!/usr/bin/env bun\n");
		const partial = evaluateProvider(github, {
			binDir: root,
			env: { GH_TOKEN: "present-but-never-reported" },
			which: (name) => `/usr/bin/${name}`,
		});
		expect(partial.ready).toBe(false);
		expect(partial.runtime.capabilities["forge.change"]?.available).toBe(true);
		expect(partial.runtime.capabilities["tracker.item"]?.available).toBe(false);
		expect(partial.reasons.join("\n")).toMatch(/github-tracker/);
		expect(JSON.stringify(partial)).not.toContain("present-but-never-reported");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("GitHub setup installs both adapters", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-github-setup-"));
	try {
		const bin = join(root, "bin");
		await mkdir(bin, { recursive: true });
		const proc = Bun.spawn(["bash", githubSetup], {
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
		expect(`${stdout}\n${stderr}`).not.toMatch(/GITHUB_TOKEN=|github_pat_/);
		for (const tool of ["github-forge", "github-tracker", "github-client.ts"]) {
			expect(await Bun.file(join(bin, tool)).exists()).toBe(true);
		}
		const source = await Bun.file(join(bin, "github-forge")).text();
		expect(source.startsWith("#!/usr/bin/env bun")).toBe(true);
		expect(source).toContain("./github-client");
		expect(source).not.toContain("DELIVERY_PACK_ROOT");
		const ready = evaluateProvider(github, {
			binDir: bin,
			env: { GITHUB_TOKEN: "present-but-never-reported", HOME: root },
			which: (name) => (name === "bun" ? "/usr/bin/bun" : null),
		});
		expect(ready.ready).toBe(true);
		expect(ready.runtime.capabilities["tracker.item"]?.invocation).toBe(
			`exec:${join(bin, "github-tracker")}`,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("unknown provider capabilities fail closed", async () => {
	const root = await mkdtemp(join(tmpdir(), "provider-contract-unknown-"));
	try {
		await writeFile(join(root, "gitlab-forge"), "#!/usr/bin/env bun\n");
		await writeFile(join(root, "gitlab-work-item"), "#!/usr/bin/env bun\n");
		const rejected = evaluateProvider(
			{
				...gitlab,
				capabilities: ["forge.change", "not-a-capability"],
			},
			{
				binDir: root,
				env: { GITLAB_TOKEN: "present-but-never-reported" },
				which: (name) => `/usr/bin/${name}`,
			},
		);
		expect(rejected.ready).toBe(false);
		expect(rejected.runtime.capabilities["forge.change"]?.available).toBe(
			false,
		);
		expect(rejected.reasons.join("\n")).toMatch(
			/forge\.change, review\.publish, or tracker\.item/,
		);
		expect(JSON.stringify(rejected)).not.toContain(
			"present-but-never-reported",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
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
