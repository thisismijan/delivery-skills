import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BRANCH_PUSH_INVOCATION,
	BRANCH_UPDATE_EXIT,
	BRANCH_UPDATE_INVOCATION,
	pushWithLease,
	updateBranch,
} from "./branch-update";
import { CHANGE_CONFLICTS } from "./land-gate";

const IDENTITY = {
	GIT_AUTHOR_NAME: "Test",
	GIT_AUTHOR_EMAIL: "test@example.test",
	GIT_COMMITTER_NAME: "Test",
	GIT_COMMITTER_EMAIL: "test@example.test",
};
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
	for (const [key, value] of Object.entries(IDENTITY)) {
		saved[key] = process.env[key];
		process.env[key] = value;
	}
});
afterAll(() => {
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...IDENTITY, GIT_EDITOR: "true" },
	});
	if (run.exitCode !== 0)
		throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
	return run.stdout.toString().trim();
}

function commit(cwd: string, file: string, text: string, message: string) {
	writeFileSync(join(cwd, file), text);
	git(cwd, "add", file);
	git(cwd, "commit", "-q", "-m", message);
}

// A remote with main and a two-commit change branch, a worktree on the change,
// and a second clone that moves main the way another merge would.
function setup(mainEdit: { file: string; text: string }) {
	const root = mkdtempSync(join(tmpdir(), "branch-update-"));
	roots.push(root);
	const remote = join(root, "remote.git");
	git(root, "init", "-q", "--bare", "-b", "main", remote);
	const work = join(root, "work");
	git(root, "clone", "-q", remote, work);
	git(work, "config", "commit.gpgsign", "false");
	commit(work, "shared.txt", "one\ntwo\nthree\n", "chore: start");
	git(work, "push", "-q", "origin", "HEAD:main");
	git(work, "checkout", "-q", "-b", "feature");
	commit(work, "shared.txt", "one\nTWO\nthree\n", "feat: change two");
	commit(work, "extra.txt", "extra\n", "feat: add extra");
	git(work, "push", "-q", "origin", "feature");
	const other = join(root, "other");
	git(root, "clone", "-q", remote, other);
	git(other, "config", "commit.gpgsign", "false");
	commit(other, mainEdit.file, mainEdit.text, "feat: main moves");
	git(other, "push", "-q", "origin", "HEAD:main");
	return { remote, work, other, head: git(work, "rev-parse", "HEAD") };
}

test("a clean branch is squashed onto its target and pushed with no agent", () => {
	const { work, head } = setup({ file: "other.txt", text: "other\n" });
	const result = updateBranch(work, "feature", "main", head);
	expect(result.outcome).toBe("updated");
	const remoteHead = git(
		work,
		"ls-remote",
		"origin",
		"refs/heads/feature",
	).split("\t")[0];
	expect(result).toEqual({ outcome: "updated", head: remoteHead ?? "" });
	expect(git(work, "rev-list", "--count", "origin/main..HEAD")).toBe("1");
	expect(git(work, "log", "-1", "--format=%s")).toBe("feat: change two");
	expect(readFileSync(join(work, "other.txt"), "utf8")).toBe("other\n");
	expect(readFileSync(join(work, "shared.txt"), "utf8")).toBe(
		"one\nTWO\nthree\n",
	);
});

test("real conflicts stop for one agent, and the push then finishes", () => {
	const { work, head } = setup({ file: "shared.txt", text: "one\n2\nthree\n" });
	const result = updateBranch(work, "feature", "main", head);
	expect(result).toEqual({ outcome: "conflicts", files: ["shared.txt"] });
	writeFileSync(join(work, "shared.txt"), "one\nTWO and 2\nthree\n");
	git(work, "add", "shared.txt");
	git(work, "rebase", "--continue");
	const pushed = pushWithLease(work, "feature", head);
	expect(pushed.outcome).toBe("updated");
	expect(git(work, "rev-list", "--count", "origin/main..HEAD")).toBe("1");
});

test("a remote branch that moved is never overwritten", () => {
	const { work, other, head } = setup({
		file: "shared.txt",
		text: "one\n2\nthree\n",
	});
	git(other, "fetch", "-q", "origin", "feature");
	git(other, "checkout", "-q", "-b", "feature", "origin/feature");
	commit(other, "late.txt", "late\n", "fix: someone else");
	git(other, "push", "-q", "origin", "feature");
	const moved = git(other, "rev-parse", "HEAD");
	expect(updateBranch(work, "feature", "main", head)).toMatchObject({
		outcome: "moved",
	});
	expect(git(work, "rev-parse", "HEAD")).toBe(head);

	const fresh = setup({ file: "shared.txt", text: "one\n2\nthree\n" });
	expect(updateBranch(fresh.work, "feature", "main", fresh.head).outcome).toBe(
		"conflicts",
	);
	writeFileSync(join(fresh.work, "shared.txt"), "one\nTWO and 2\nthree\n");
	git(fresh.work, "add", "shared.txt");
	git(fresh.work, "rebase", "--continue");
	git(fresh.other, "fetch", "-q", "origin", "feature");
	git(fresh.other, "checkout", "-q", "-b", "feature", "origin/feature");
	commit(fresh.other, "late.txt", "late\n", "fix: someone else");
	git(fresh.other, "push", "-q", "origin", "feature");
	expect(pushWithLease(fresh.work, "feature", fresh.head)).toMatchObject({
		outcome: "moved",
	});
	expect(
		git(fresh.other, "ls-remote", "origin", "refs/heads/feature").split(
			"\t",
		)[0],
	).toBe(git(fresh.other, "rev-parse", "HEAD"));
	expect(moved).not.toBe(head);
});

test("a dirty worktree, a different local head, or a bad argument is refused", () => {
	const { work, head } = setup({ file: "other.txt", text: "other\n" });
	writeFileSync(join(work, "dirty.txt"), "x");
	expect(updateBranch(work, "feature", "main", head)).toMatchObject({
		outcome: "failed",
	});
	rmSync(join(work, "dirty.txt"));
	commit(work, "local.txt", "local\n", "feat: local only");
	expect(updateBranch(work, "feature", "main", head)).toMatchObject({
		outcome: "failed",
		reason: expect.stringContaining("checked out at"),
	});
	expect(() => updateBranch(work, "--force", "main", head)).toThrow(
		"not a branch name",
	);
	expect(() => updateBranch(work, "feature", "main", "abc")).toThrow(
		"full commit SHA",
	);
});

test("the CLI exit codes and auto's instructions match the script", () => {
	expect(BRANCH_UPDATE_EXIT).toEqual({
		updated: 0,
		failed: 1,
		conflicts: 3,
		moved: 4,
	});
	const auto = readFileSync(
		join(import.meta.dir, "../../skills/delivery/workflows/auto.md"),
		"utf8",
	)
		.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
		.replaceAll('.ts"', ".ts");
	const flat = auto.replace(/\s+/g, " ");
	expect(auto).toContain(BRANCH_UPDATE_INVOCATION);
	expect(auto).toContain(BRANCH_PUSH_INVOCATION);
	expect(flat).toContain(`When the only stop reason is "${CHANGE_CONFLICTS}"`);
	expect(flat).toContain(
		"Exit 3 leaves the rebase stopped on real conflicts: dispatch one agent",
	);
	expect(flat).toContain(
		"Exit 4 means the remote branch moved since it was read: stop",
	);
	expect(flat).toContain(
		"rerun the green gate on the new head and review again",
	);
});
