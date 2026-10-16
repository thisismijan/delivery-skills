import { expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(20_000);
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const installer = join(import.meta.dir, "..", "..", "install.sh");
const rootDir = join(import.meta.dir, "..", "..");

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

test("--all skips an unwritable Cloud Agent store and still installs desktop hosts", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-install-"));
	try {
		const cursor = join(root, "cursor-skills");
		const claude = join(root, "claude-skills");
		const store = join(root, "missing-store", "skills");
		const { stdout, stderr, exitCode } = await runInstaller(["--all"], {
			CURSOR_SKILLS_DIR: cursor,
			CLAUDE_SKILLS_DIR: claude,
			CURSOR_AGENT_STORE: store,
			CURSOR_AGENT_STORE_PROBE: join(root, "missing-store"),
			DELIVERY_BIN_DIR: join(root, "bin"),
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain(`Cursor skills -> ${cursor}`);
		expect(stdout).toContain(`Claude Code skills -> ${claude}`);
		expect(stdout).toContain(
			`Agent store skipped (not writable here): ${store}`,
		);
		expect(stderr).not.toMatch(/Read-only file system/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("--store keeps the factory inside the synced tree and preserves delivery state", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-store-"));
	try {
		const storeRoot = join(root, "store");
		const store = join(storeRoot, "skills");
		await mkdir(join(store, "delivery", "runs"), { recursive: true });
		await mkdir(join(store, "delivery", "candidates"), { recursive: true });
		await mkdir(join(store, "delivery", "versions"), { recursive: true });
		await writeFile(join(store, "delivery", "runs", "run.md"), "ledger");
		await writeFile(
			join(store, "delivery", "candidates", "candidate.md"),
			"candidate",
		);
		await writeFile(
			join(store, "delivery", "versions", "version.md"),
			"version",
		);

		const { stdout, stderr, exitCode } = await runInstaller(["--store"], {
			CURSOR_AGENT_STORE: store,
			CURSOR_AGENT_STORE_PROBE: storeRoot,
			DELIVERY_BIN_DIR: join(root, "bin"),
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(stdout).toContain(`Factory -> ${store}/_factory`);
		expect(
			await readFile(join(store, "_factory", "RUNTIME.md"), "utf8"),
		).toContain("Factory runtime");
		expect(
			await readFile(
				join(store, "_factory", "scripts", "find-change.ts"),
				"utf8",
			),
		).toContain("findChange");
		expect(
			await readFile(join(store, "delivery", "runs", "run.md"), "utf8"),
		).toBe("ledger");
		expect(
			await readFile(
				join(store, "delivery", "candidates", "candidate.md"),
				"utf8",
			),
		).toBe("candidate");
		expect(
			await readFile(join(store, "delivery", "versions", "version.md"), "utf8"),
		).toBe("version");
		expect(
			await lstat(join(storeRoot, "factory")).then(
				() => true,
				() => false,
			),
		).toBe(false);
		expect(
			await lstat(join(store, "_factory", "node_modules")).then(
				() => true,
				() => false,
			),
		).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("reinstall leaves skill-local leftover candidates and versions untouched", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-leftovers-"));
	try {
		const storeRoot = join(root, "store");
		const store = join(storeRoot, "skills");
		const leftoverCandidate = join(
			store,
			"delivery",
			"candidates",
			"improve-20261015-missing-rollback",
			"manifest.md",
		);
		const leftoverVersion = join(
			store,
			"delivery",
			"versions",
			"20261015T000000Z-deadbeef",
			"skill.md",
		);
		await mkdir(join(leftoverCandidate, ".."), { recursive: true });
		await mkdir(join(leftoverVersion, ".."), { recursive: true });
		await writeFile(leftoverCandidate, "keep-candidate");
		await writeFile(leftoverVersion, "keep-version");
		await mkdir(join(store, "delivery", "runs"), { recursive: true });
		await writeFile(join(store, "delivery", "runs", "run.md"), "keep-run");

		const first = await runInstaller(["--store"], {
			CURSOR_AGENT_STORE: store,
			CURSOR_AGENT_STORE_PROBE: storeRoot,
			DELIVERY_BIN_DIR: join(root, "bin"),
		});
		expect(first.exitCode).toBe(0);
		const second = await runInstaller(["--store"], {
			CURSOR_AGENT_STORE: store,
			CURSOR_AGENT_STORE_PROBE: storeRoot,
			DELIVERY_BIN_DIR: join(root, "bin"),
		});
		expect(second.exitCode).toBe(0);
		expect(await readFile(leftoverCandidate, "utf8")).toBe("keep-candidate");
		expect(await readFile(leftoverVersion, "utf8")).toBe("keep-version");
		expect(
			await readFile(join(store, "delivery", "runs", "run.md"), "utf8"),
		).toBe("keep-run");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("--cursor replaces a stale real skill directory with a symlink", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-cursor-"));
	try {
		const cursor = join(root, "cursor-skills");
		await mkdir(join(cursor, "groom"), { recursive: true });
		await writeFile(join(cursor, "groom", "SKILL.md"), "stale");

		const { exitCode } = await runInstaller(["--cursor"], {
			CURSOR_SKILLS_DIR: cursor,
			DELIVERY_BIN_DIR: join(root, "bin"),
		});

		expect(exitCode).toBe(0);
		expect((await lstat(join(cursor, "groom"))).isSymbolicLink()).toBe(true);
		expect(await readFile(join(cursor, "groom", "SKILL.md"), "utf8")).toContain(
			"name: groom",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the installer avoids syntax macOS bash 3.2 cannot parse", async () => {
	const script = await readFile(installer, "utf8");
	const substitutions = script.match(/\$\([\s\S]*?\)\}?"/g) ?? [];
	for (const body of substitutions) {
		expect(body).not.toMatch(/\bcase\b[\s\S]*\besac\b/);
	}
});
