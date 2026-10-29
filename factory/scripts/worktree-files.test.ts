import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	MAX_WORKTREE_FILE_BYTES,
	WORKTREE_FILES_PATH,
	confirmWorktreeFiles,
	copyWorktreeFiles,
	proposeWorktreeFiles,
} from "./worktree-files";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function git(cwd: string, ...args: string[]): void {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.invalid",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.invalid",
		},
	});
	if (proc.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
	}
}

const approval = {
	who: "operator",
	words: "copy those",
	at: "2026-10-29T00:00:00.000Z",
};

function repo(): { root: string; worktree: string } {
	const base = mkdtempSync(join(tmpdir(), "worktree-files-"));
	roots.push(base);
	const root = join(base, "repo");
	mkdirSync(root);
	git(root, "init", "--quiet", "-b", "main");
	git(root, "config", "commit.gpgsign", "false");
	writeFileSync(
		join(root, ".gitignore"),
		".env\n.env.local\nconfig/local.json\nnode_modules/\n.delivery/\nbig.bin\nlink.env\n",
	);
	writeFileSync(join(root, "app.ts"), "export {};\n");
	git(root, "add", ".");
	git(root, "commit", "--quiet", "-m", "base");
	writeFileSync(join(root, ".env"), "TOKEN=local\n");
	writeFileSync(join(root, ".env.local"), "MORE=1\n");
	mkdirSync(join(root, "config"));
	writeFileSync(join(root, "config", "local.json"), "{}\n");
	mkdirSync(join(root, "node_modules"));
	writeFileSync(join(root, "node_modules", "x.js"), "");
	writeFileSync(join(root, "scratch.txt"), "not ignored\n");
	const worktree = join(base, "worker");
	git(root, "worktree", "add", "--quiet", "--detach", worktree, "HEAD");
	return { root, worktree };
}

test("propose lists ignored local files and skips folders and unignored files", () => {
	const { root } = repo();
	expect(proposeWorktreeFiles(root)).toEqual([
		".env",
		".env.local",
		"config/local.json",
	]);
});

test("confirm writes the list and copy places each file in the worktree", () => {
	const { root, worktree } = repo();
	confirmWorktreeFiles(root, {
		version: 1,
		files: [".env", "config/local.json"],
		approval,
	});
	expect(existsSync(join(root, WORKTREE_FILES_PATH))).toBe(true);
	expect(copyWorktreeFiles(root, worktree)).toEqual({
		copied: [".env", "config/local.json"],
		configured: true,
	});
	expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("TOKEN=local\n");
	expect(existsSync(join(worktree, "config", "local.json"))).toBe(true);
	expect(existsSync(join(worktree, ".env.local"))).toBe(false);
});

test("no confirmed list copies nothing", () => {
	const { root, worktree } = repo();
	expect(copyWorktreeFiles(root, worktree)).toEqual({
		copied: [],
		configured: false,
	});
});

test("confirm refuses patterns, climbing paths, tracked, unignored, linked, and large files", () => {
	const { root } = repo();
	writeFileSync(
		join(root, "big.bin"),
		Buffer.alloc(MAX_WORKTREE_FILE_BYTES + 1),
	);
	symlinkSync(join(root, ".env"), join(root, "link.env"));
	for (const [file, reason] of [
		["*.env", /exact path/],
		["../outside", /climb/],
		["/etc/passwd", /relative/],
		["app.ts", /tracked/],
		["scratch.txt", /not ignored/],
		["link.env", /symbolic link/],
		["big.bin", /larger than/],
		["missing.env", /does not exist/],
		["node_modules", /not a regular file/],
	] as const) {
		expect(() =>
			confirmWorktreeFiles(root, { version: 1, files: [file], approval }),
		).toThrow(reason);
	}
	expect(existsSync(join(root, WORKTREE_FILES_PATH))).toBe(false);
});

test("copy stops before writing anything when a file is missing or already present", () => {
	const { root, worktree } = repo();
	confirmWorktreeFiles(root, {
		version: 1,
		files: [".env", ".env.local"],
		approval,
	});
	rmSync(join(root, ".env.local"));
	expect(() => copyWorktreeFiles(root, worktree)).toThrow(
		/\.env\.local does not exist/,
	);
	expect(existsSync(join(worktree, ".env"))).toBe(false);

	writeFileSync(join(root, ".env.local"), "MORE=1\n");
	writeFileSync(join(worktree, ".env"), "already\n");
	expect(() => copyWorktreeFiles(root, worktree)).toThrow(/already exists/);
	expect(readFileSync(join(worktree, ".env"), "utf8")).toBe("already\n");
});

test("copy refuses the main checkout and a folder from another repository", () => {
	const { root } = repo();
	confirmWorktreeFiles(root, { version: 1, files: [".env"], approval });
	expect(() => copyWorktreeFiles(root, root)).toThrow(/main checkout/);
	const other = repo();
	expect(() => copyWorktreeFiles(root, other.worktree)).toThrow(
		/not a worktree of this repository/,
	);
});

test("a malformed list fails closed", () => {
	const { root, worktree } = repo();
	mkdirSync(join(root, ".delivery"), { recursive: true });
	writeFileSync(join(root, WORKTREE_FILES_PATH), "{ nope");
	expect(() => copyWorktreeFiles(root, worktree)).toThrow(/not valid JSON/);
	writeFileSync(
		join(root, WORKTREE_FILES_PATH),
		JSON.stringify({ version: 1, files: [".env", ".env"], approval }),
	);
	expect(() => copyWorktreeFiles(root, worktree)).toThrow(/malformed/);
});
