import { expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(20_000);

const installer = join(import.meta.dir, "..", "..", "install.sh");
const rootDir = join(import.meta.dir, "..", "..");
const readme = readFileSync(join(rootDir, "README.md"), "utf8");

async function pathExists(path: string): Promise<boolean> {
	return lstat(path).then(
		() => true,
		() => false,
	);
}

async function runInstaller(
	args: string[],
	env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bash", installer, ...args], {
		cwd: rootDir,
		env: {
			...process.env,
			DELIVERY_INSTALL_SKIP_BUN: "1",
			...env,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

async function withInstallRoot(
	fn: (root: string) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "delivery-packaging-"));
	try {
		await fn(root);
	} finally {
		await Bun.spawn(["chmod", "-R", "u+w", root], {
			stdout: "ignore",
			stderr: "ignore",
		}).exited;
		await rm(root, { recursive: true, force: true });
	}
}

test("refuses to install without --skills-dir and does not infer a host", async () => {
	await withInstallRoot(async (root) => {
		const cursor = join(root, "cursor-skills");
		const claude = join(root, "claude-skills");
		const { stdout, stderr, exitCode } = await runInstaller([], {
			CURSOR_SKILLS_DIR: cursor,
			CLAUDE_SKILLS_DIR: claude,
			DELIVERY_BIN_DIR: join(root, "bin"),
		});
		expect(exitCode).not.toBe(0);
		expect(`${stdout}\n${stderr}`).toMatch(/--skills-dir/);
		expect(await pathExists(cursor)).toBe(false);
		expect(await pathExists(claude)).toBe(false);
	});
});

test("--skills-dir installs generic skills and runtime beside them", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const { stdout, stderr, exitCode } = await runInstaller(
			["--skills-dir", dest],
			{ DELIVERY_BIN_DIR: join(root, "bin") },
		);
		expect(stderr).toBe("");
		expect(exitCode).toBe(0);
		expect(stdout).toContain(`Skills -> ${dest}`);
		expect(stdout).toContain(`Runtime -> ${dest}/_factory`);
		expect(stdout).toContain("Reload the host session");
		expect(stdout).toContain(
			`Then run: bun "${dest}/_factory/scripts/doctor.ts"`,
		);
		expect(stdout).not.toMatch(/Cursor|Claude|ig-spec/i);
		expect(await readFile(join(dest, "groom", "SKILL.md"), "utf8")).toContain(
			"name: groom",
		);
		expect(
			await readFile(join(dest, "_factory", "RUNTIME.md"), "utf8"),
		).toMatch(/runtime/i);
		expect(
			await readFile(
				join(dest, "_factory", "scripts", "find-change.ts"),
				"utf8",
			),
		).toContain("findChange");
		expect(await pathExists(join(dest, "_factory", "node_modules"))).toBe(
			false,
		);
		expect(await pathExists(join(root, "bin", "gl-mr"))).toBe(false);
		expect(await pathExists(join(dest, "mr-review", "gl-mr"))).toBe(false);
		expect(await pathExists(join(dest, "mr-review", "gl-note"))).toBe(false);
		expect(await pathExists(join(dest, "mr-review", "cloud-setup.sh"))).toBe(
			false,
		);
		expect(await pathExists(join(dest, "providers"))).toBe(false);
		const runtime = JSON.parse(
			await readFile(join(dest, "_factory", "runtime-manifest.json"), "utf8"),
		) as {
			capabilities: Record<
				string,
				{ available: boolean; enforcement?: string }
			>;
		};
		expect(Object.keys(runtime.capabilities)).toHaveLength(7);
		expect(runtime.capabilities["process.run"]?.available).toBe(false);
		expect(runtime.capabilities["mutation.guard"]).toMatchObject({
			available: false,
			enforcement: "unenforced",
		});
		const managed = (await readFile(join(dest, ".delivery-managed"), "utf8"))
			.trim()
			.split("\n");
		expect(managed).toContain("groom");
		expect(managed).toContain("delivery");
		expect(managed).toContain("_factory");
	});
});

test("a production install ships dependencies and its primary CLIs run", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const installed = await runInstaller(["--skills-dir", dest], {
			DELIVERY_BIN_DIR: join(root, "bin"),
			DELIVERY_INSTALL_SKIP_BUN: "",
		});
		expect(installed.exitCode).toBe(0);
		expect(
			await pathExists(join(dest, "_factory", "node_modules", "zod")),
		).toBe(true);
		expect(
			JSON.parse(
				await readFile(join(dest, "_factory", "runtime-manifest.json"), "utf8"),
			),
		).toMatchObject({
			capabilities: {
				"process.run": { available: true, invocation: "bun" },
				"mutation.guard": {
					available: false,
					enforcement: "unenforced",
				},
			},
		});

		const next = Bun.spawn(
			[
				"bun",
				join(dest, "_factory", "scripts", "next-action.ts"),
				"WORK-1",
				"[drafted]",
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await next.exited).toBe(0);
		expect(JSON.parse(await new Response(next.stdout).text())).toMatchObject({
			kind: "run",
			verb: "execute",
		});

		const doctor = Bun.spawn(
			["bun", join(dest, "_factory", "scripts", "doctor.ts")],
			{
				cwd: rootDir,
				env: {
					...process.env,
					DELIVERY_FACTORY_ROOT: join(dest, "_factory"),
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		expect(await doctor.exited).toBe(0);
		const doctorOutput = await new Response(doctor.stdout).text();
		expect(doctorOutput).toContain("READY NOW");
		expect(doctorOutput).toContain("NEEDS SETUP");
		expect(doctorOutput).toContain("HOST LIMITATION");
		expect(doctorOutput).toContain("HUMAN-OWNED");
	});
});

test("reinstall replaces managed files and preserves unmanaged files and state", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const first = await runInstaller(["--skills-dir", dest], {
			DELIVERY_BIN_DIR: join(root, "bin"),
		});
		expect(first.exitCode).toBe(0);

		await writeFile(join(dest, "groom", "SKILL.md"), "stale-managed");
		await writeFile(join(dest, "operator-notes.md"), "keep-unmanaged");
		await mkdir(join(dest, "delivery", "runs"), { recursive: true });
		await mkdir(join(dest, "delivery", "candidates"), { recursive: true });
		await mkdir(join(dest, "delivery", "versions"), { recursive: true });
		await writeFile(join(dest, "delivery", "runs", "run.md"), "keep-run");
		await writeFile(
			join(dest, "delivery", "candidates", "candidate.md"),
			"keep-candidate",
		);
		await writeFile(
			join(dest, "delivery", "versions", "version.md"),
			"keep-version",
		);

		const second = await runInstaller(["--skills-dir", dest], {
			DELIVERY_BIN_DIR: join(root, "bin"),
		});
		expect(second.exitCode).toBe(0);
		expect(await readFile(join(dest, "groom", "SKILL.md"), "utf8")).toContain(
			"name: groom",
		);
		expect(await readFile(join(dest, "operator-notes.md"), "utf8")).toBe(
			"keep-unmanaged",
		);
		expect(
			await readFile(join(dest, "delivery", "runs", "run.md"), "utf8"),
		).toBe("keep-run");
		expect(
			await readFile(
				join(dest, "delivery", "candidates", "candidate.md"),
				"utf8",
			),
		).toBe("keep-candidate");
		expect(
			await readFile(join(dest, "delivery", "versions", "version.md"), "utf8"),
		).toBe("keep-version");
	});
});

test("unwritable destination fails without replacing an existing install", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		await mkdir(dest, { recursive: true });
		await writeFile(join(dest, "operator-notes.md"), "keep-existing");
		await chmod(dest, 0o555);

		const { stdout, stderr, exitCode } = await runInstaller(
			["--skills-dir", dest],
			{ DELIVERY_BIN_DIR: join(root, "bin") },
		);
		expect(exitCode).not.toBe(0);
		expect(`${stdout}\n${stderr}`).toMatch(/not writable|cannot be written/i);
		expect(`${stdout}\n${stderr}`).not.toMatch(
			/--cursor|--claude|--store|--all/,
		);
		expect(await readFile(join(dest, "operator-notes.md"), "utf8")).toBe(
			"keep-existing",
		);
		expect(await pathExists(join(dest, "groom"))).toBe(false);
		expect(await pathExists(join(dest, "_factory"))).toBe(false);
	});
});

test("explicit --adapter applies that adapter and unknown adapters fail closed", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const adapters = join(root, "adapters");
		await mkdir(join(adapters, "sample"), { recursive: true });
		await writeFile(
			join(adapters, "sample", "setup.sh"),
			`#!/usr/bin/env bash
set -euo pipefail
printf 'sample-adapter\\n' >"$DELIVERY_SKILLS_DIR/.adapter-marker"
`,
		);
		await chmod(join(adapters, "sample", "setup.sh"), 0o755);
		await writeFile(
			join(adapters, "sample", "adapter.json"),
			JSON.stringify({
				name: "sample",
				version: 1,
				capabilities: [
					{
						id: "process.run",
						available: true,
						mode: "native",
					},
					{
						id: "agent.dispatch",
						available: false,
						mode: "unavailable",
					},
					{
						id: "model.inventory",
						available: false,
						mode: "unavailable",
					},
					{
						id: "forge.change",
						available: false,
						mode: "unavailable",
					},
					{
						id: "tracker.item",
						available: false,
						mode: "unavailable",
					},
					{
						id: "review.publish",
						available: false,
						mode: "unavailable",
					},
					{
						id: "mutation.guard",
						available: false,
						mode: "unenforced",
					},
				],
			}),
		);

		const missing = await runInstaller(
			["--skills-dir", dest, "--adapter", "missing-adapter"],
			{
				DELIVERY_BIN_DIR: join(root, "bin"),
				DELIVERY_ADAPTERS_DIR: adapters,
			},
		);
		expect(missing.exitCode).not.toBe(0);
		expect(`${missing.stdout}\n${missing.stderr}`).toMatch(
			/unknown adapter|adapter not found/i,
		);
		expect(await pathExists(dest)).toBe(false);

		const applied = await runInstaller(
			["--skills-dir", dest, "--adapter", "sample"],
			{
				DELIVERY_BIN_DIR: join(root, "bin"),
				DELIVERY_ADAPTERS_DIR: adapters,
			},
		);
		expect(applied.exitCode).toBe(0);
		expect(applied.stdout).toContain("Adapter sample");
		expect(await readFile(join(dest, ".adapter-marker"), "utf8")).toBe(
			"sample-adapter\n",
		);
		expect(
			JSON.parse(
				await readFile(join(dest, "_factory", "runtime-manifest.json"), "utf8"),
			),
		).toMatchObject({
			version: 1,
			capabilities: {
				"mutation.guard": {
					available: false,
					enforcement: "unenforced",
				},
			},
		});
		expect(await readFile(join(dest, "groom", "SKILL.md"), "utf8")).toContain(
			"name: groom",
		);
	});
});

test("adapter setup failure restores the previous installation", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const adapters = join(root, "adapters");
		expect(
			(
				await runInstaller(["--skills-dir", dest], {
					DELIVERY_BIN_DIR: join(root, "bin"),
				})
			).exitCode,
		).toBe(0);
		await writeFile(join(dest, "operator-notes.md"), "preserve me");
		await mkdir(join(adapters, "broken"), { recursive: true });
		await writeFile(
			join(adapters, "broken", "setup.sh"),
			`#!/usr/bin/env bash
set -euo pipefail
printf 'partial\\n' >"$DELIVERY_SKILLS_DIR/.partial-adapter"
exit 1
`,
		);
		await chmod(join(adapters, "broken", "setup.sh"), 0o755);

		const failed = await runInstaller(
			["--skills-dir", dest, "--adapter", "broken"],
			{
				DELIVERY_BIN_DIR: join(root, "bin"),
				DELIVERY_ADAPTERS_DIR: adapters,
			},
		);
		expect(failed.exitCode).not.toBe(0);
		expect(await readFile(join(dest, "operator-notes.md"), "utf8")).toBe(
			"preserve me",
		);
		expect(await pathExists(join(dest, ".partial-adapter"))).toBe(false);
		expect(await readFile(join(dest, "groom", "SKILL.md"), "utf8")).toContain(
			"name: groom",
		);
	});
});

test("a direct cursor adapter install does not infer a forge provider", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const bin = join(root, "bin");
		const { stdout, exitCode } = await runInstaller(
			["--skills-dir", dest, "--adapter", "cursor"],
			{ DELIVERY_BIN_DIR: bin },
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Adapter cursor");
		expect(await pathExists(join(bin, "gl-mr"))).toBe(false);
		expect(await pathExists(join(bin, "gl-note"))).toBe(false);
		expect(
			JSON.parse(
				await readFile(join(dest, "_factory", "runtime-manifest.json"), "utf8"),
			),
		).toMatchObject({
			capabilities: {
				"forge.change": { available: false },
				"review.publish": { available: false },
				"mutation.guard": { enforcement: "unenforced" },
			},
		});
	});
});

test("explicit --provider installs that provider and generic install includes none", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const bin = join(root, "bin");
		const generic = await runInstaller(["--skills-dir", dest], {
			DELIVERY_BIN_DIR: bin,
		});
		expect(generic.exitCode).toBe(0);
		expect(await pathExists(join(bin, "gl-mr"))).toBe(false);
		expect(await pathExists(join(dest, "mr-review", "gl-mr"))).toBe(false);

		const missing = await runInstaller(
			["--skills-dir", dest, "--provider", "missing-provider"],
			{ DELIVERY_BIN_DIR: bin },
		);
		expect(missing.exitCode).not.toBe(0);
		expect(`${missing.stdout}\n${missing.stderr}`).toMatch(
			/unknown provider|provider not found/i,
		);

		const selected = await runInstaller(
			["--skills-dir", dest, "--provider", "gitlab"],
			{
				DELIVERY_BIN_DIR: bin,
				GITLAB_TOKEN: "test-token",
				PATH: `${bin}:${process.env.PATH ?? ""}`,
			},
		);
		expect(selected.exitCode).toBe(0);
		expect(selected.stdout).toContain("Provider gitlab: ready");
		expect(selected.stdout).not.toContain("test-token");
		expect(await pathExists(join(bin, "gitlab-forge"))).toBe(true);
		expect(await pathExists(join(bin, "gitlab-work-item"))).toBe(true);
		expect(await pathExists(join(bin, "gitlab-host.ts"))).toBe(true);
		expect(await pathExists(join(bin, "gl-mr"))).toBe(false);
		expect(await pathExists(join(bin, "gl-note"))).toBe(false);
		for (const tool of ["gitlab-forge", "gitlab-work-item", "gitlab-host.ts"]) {
			const installed = await readFile(join(bin, tool), "utf8");
			expect(installed).not.toContain(rootDir);
			expect(installed).not.toContain("DELIVERY_PACK_ROOT");
		}
		const runtime = JSON.parse(
			await readFile(join(dest, "_factory", "runtime-manifest.json"), "utf8"),
		) as {
			capabilities: Record<
				string,
				{
					available: boolean;
					mode?: string;
					invocation?: string;
					provider?: string;
				}
			>;
		};
		expect(runtime.capabilities["forge.change"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(bin, "gitlab-forge")}`,
			provider: "gitlab",
		});
		expect(runtime.capabilities["review.publish"]).toEqual(
			runtime.capabilities["forge.change"],
		);
		expect(runtime.capabilities["tracker.item"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(bin, "gitlab-work-item")}`,
			provider: "gitlab",
		});
	});
});

test("explicit --provider jira installs jira-tracker and advertises tracker.item", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const bin = join(root, "bin");
		const selected = await runInstaller(
			["--skills-dir", dest, "--provider", "jira"],
			{
				DELIVERY_BIN_DIR: bin,
				JIRA_SITE: "https://acme.atlassian.net",
				JIRA_PROJECT: "DELIV",
				JIRA_EMAIL: "ada@example.test",
				JIRA_API_TOKEN: "test-token",
				PATH: `${bin}:${process.env.PATH ?? ""}`,
			},
		);
		expect(selected.exitCode).toBe(0);
		expect(selected.stdout).toContain("Provider jira: ready");
		expect(selected.stdout).not.toContain("test-token");
		expect(await pathExists(join(bin, "jira-tracker"))).toBe(true);
		const installed = await readFile(join(bin, "jira-tracker"), "utf8");
		expect(installed).not.toContain(rootDir);
		expect(installed).not.toContain("DELIVERY_PACK_ROOT");
		expect(installed.startsWith("#!/usr/bin/env bun")).toBe(true);
		const runtime = JSON.parse(
			await readFile(join(dest, "_factory", "runtime-manifest.json"), "utf8"),
		) as {
			capabilities: Record<
				string,
				{
					available: boolean;
					mode?: string;
					invocation?: string;
					provider?: string;
				}
			>;
		};
		expect(runtime.capabilities["tracker.item"]).toEqual({
			available: true,
			mode: "adapter",
			invocation: `exec:${join(bin, "jira-tracker")}`,
			provider: "jira",
		});
	});
});

test("README documents --skills-dir and optional --adapter without named hosts", () => {
	expect(readme).toContain("./install.sh --skills-dir");
	expect(readme).toContain("--adapter");
	expect(readme).toContain("--provider");
	expect(readme).not.toMatch(/\bCursor\b/);
	expect(readme).not.toMatch(/\bClaude\b/);
	expect(readme).not.toMatch(/ig-spec/);
});
