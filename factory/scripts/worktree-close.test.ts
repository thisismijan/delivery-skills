import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeWorktree } from "./worktree-close";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function git(cwd: string, ...args: string[]): string {
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
	return proc.stdout.toString().trim();
}

function fixture(): { primary: string; worktree: string } {
	const root = mkdtempSync(join(tmpdir(), "worktree-close-"));
	roots.push(root);
	const remote = join(root, "remote.git");
	const primary = join(root, "primary");
	git(root, "init", "--quiet", "--bare", "-b", "main", remote);
	git(root, "clone", "--quiet", remote, primary);
	git(primary, "config", "commit.gpgsign", "false");
	writeFileSync(join(primary, "a.txt"), "a\n");
	git(primary, "add", "a.txt");
	git(primary, "commit", "--quiet", "-m", "base");
	git(primary, "push", "--quiet", "origin", "HEAD:main");
	const worktree = join(root, "worker-1");
	git(primary, "worktree", "add", "--quiet", "--detach", worktree, "HEAD");
	git(worktree, "switch", "--quiet", "-c", "work-1");
	return { primary, worktree };
}

function commit(worktree: string, file: string): void {
	writeFileSync(join(worktree, file), `${file}\n`);
	git(worktree, "add", file);
	git(worktree, "commit", "--quiet", "-m", file);
}

test("a clean, pushed worktree is removed", () => {
	const { worktree } = fixture();
	commit(worktree, "b.txt");
	git(worktree, "push", "--quiet", "-u", "origin", "work-1");
	const result = closeWorktree(worktree);
	expect(result).toMatchObject({
		decision: "removed",
		branch: "work-1",
		reasons: [],
	});
	expect(existsSync(worktree)).toBe(false);
});

test("a dry run reports the removal and keeps the folder", () => {
	const { worktree } = fixture();
	expect(closeWorktree(worktree, { dryRun: true }).decision).toBe(
		"would-remove",
	);
	expect(existsSync(worktree)).toBe(true);
});

test("uncommitted, untracked, and unpushed work keeps the worktree", () => {
	const { worktree } = fixture();
	commit(worktree, "b.txt");
	writeFileSync(join(worktree, "a.txt"), "changed\n");
	writeFileSync(join(worktree, "new.txt"), "new\n");
	const result = closeWorktree(worktree);
	expect(result.decision).toBe("kept");
	expect(result.reasons).toEqual([
		"1 file has uncommitted changes.",
		"1 untracked file is not committed.",
		"Branch work-1 has commits that are not pushed.",
	]);
	expect(existsSync(worktree)).toBe(true);
});

test("a detached commit on no remote branch keeps the worktree", () => {
	const { worktree } = fixture();
	git(worktree, "switch", "--quiet", "--detach");
	commit(worktree, "c.txt");
	const result = closeWorktree(worktree);
	expect(result.decision).toBe("kept");
	expect(result.reasons).toEqual([
		"The last commit is not on any remote branch.",
	]);
});

test("the primary checkout and a plain folder are refused", () => {
	const { primary } = fixture();
	expect(() => closeWorktree(primary)).toThrow(/primary checkout/);
	expect(existsSync(primary)).toBe(true);
	const plain = mkdtempSync(join(tmpdir(), "worktree-close-plain-"));
	roots.push(plain);
	expect(() => closeWorktree(plain)).toThrow(/not inside a git worktree/);
	const { worktree } = fixture();
	expect(() => closeWorktree(join(worktree, ".."))).toThrow();
});
