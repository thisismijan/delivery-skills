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
			...env,
			DELIVERY_INSTALL_SKIP_BUN: "1",
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
		const managed = (await readFile(join(dest, ".delivery-managed"), "utf8"))
			.trim()
			.split("\n");
		expect(managed).toContain("groom");
		expect(managed).toContain("delivery");
		expect(managed).toContain("_factory");
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
		expect(await readFile(join(dest, "groom", "SKILL.md"), "utf8")).toContain(
			"name: groom",
		);
	});
});

test("shipped cursor adapter installs review wrappers for an explicit destination", async () => {
	await withInstallRoot(async (root) => {
		const dest = join(root, "skills");
		const bin = join(root, "bin");
		const { stdout, exitCode } = await runInstaller(
			["--skills-dir", dest, "--adapter", "cursor"],
			{ DELIVERY_BIN_DIR: bin },
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Adapter cursor");
		expect(await pathExists(join(bin, "gl-mr"))).toBe(true);
		expect(await pathExists(join(bin, "gl-note"))).toBe(true);
	});
});

test("README documents --skills-dir and optional --adapter without named hosts", () => {
	expect(readme).toContain("./install.sh --skills-dir");
	expect(readme).toContain("--adapter");
	expect(readme).not.toMatch(/\bCursor\b/);
	expect(readme).not.toMatch(/\bClaude\b/);
	expect(readme).not.toMatch(/ig-spec/);
});
