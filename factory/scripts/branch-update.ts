import { safeGit } from "./safe-git";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const BRANCH_UPDATE_INVOCATION = "scripts/branch-update.ts update <worktree> <branch> <target> <expected-head>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const BRANCH_PUSH_INVOCATION = "scripts/branch-update.ts push <worktree> <branch> <expected-head>";

export type BranchUpdateOutcome =
	| { outcome: "updated"; head: string }
	| { outcome: "conflicts"; files: string[] }
	| { outcome: "moved"; reason: string }
	| { outcome: "failed"; reason: string };

export const BRANCH_UPDATE_EXIT: Record<
	BranchUpdateOutcome["outcome"],
	number
> = { updated: 0, failed: 1, conflicts: 3, moved: 4 };

const FULL_SHA = /^[0-9a-f]{40}$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;

function git(worktree: string, args: string[]) {
	const run = safeGit(worktree, args);
	return { ...run, out: run.stdout.trim(), err: run.stderr.trim() };
}

function failed(reason: string): BranchUpdateOutcome {
	return { outcome: "failed", reason };
}

function checkArgs(branch: string, expectedHead: string, target?: string) {
	for (const name of [branch, ...(target === undefined ? [] : [target])]) {
		if (!BRANCH.test(name) || name.startsWith("-") || name.includes("..")) {
			throw new Error(`not a branch name: ${name}`);
		}
	}
	if (!FULL_SHA.test(expectedHead)) {
		throw new Error("the expected head must be a full commit SHA");
	}
}

// Push the rebased branch only if the remote is still at the head the factory
// read; a branch someone else moved is never overwritten.
export function pushWithLease(
	worktree: string,
	branch: string,
	expectedHead: string,
): BranchUpdateOutcome {
	checkArgs(branch, expectedHead);
	const status = git(worktree, ["status", "--porcelain"]);
	if (status.code !== 0) return failed(status.err);
	if (status.out !== "") {
		return failed("the worktree has uncommitted or unresolved changes");
	}
	const push = git(worktree, [
		"push",
		`--force-with-lease=refs/heads/${branch}:${expectedHead}`,
		"origin",
		`HEAD:refs/heads/${branch}`,
	]);
	if (push.code !== 0) {
		return /stale info|rejected|fetch first/i.test(push.err)
			? {
					outcome: "moved",
					reason: `the remote branch moved since ${expectedHead.slice(0, 12)} was read, so the push was refused`,
				}
			: failed(push.err || "the push failed");
	}
	return { outcome: "updated", head: git(worktree, ["rev-parse", "HEAD"]).out };
}

export function updateBranch(
	worktree: string,
	branch: string,
	target: string,
	expectedHead: string,
): BranchUpdateOutcome {
	checkArgs(branch, expectedHead, target);
	const status = git(worktree, ["status", "--porcelain"]);
	if (status.code !== 0) return failed(status.err);
	if (status.out !== "") return failed("the worktree has uncommitted changes");
	const fetch = git(worktree, [
		"fetch",
		"--quiet",
		"origin",
		`+refs/heads/${target}:refs/remotes/origin/${target}`,
		`+refs/heads/${branch}:refs/remotes/origin/${branch}`,
	]);
	if (fetch.code !== 0) return failed(fetch.err || "the fetch failed");
	const remote = git(worktree, ["rev-parse", `refs/remotes/origin/${branch}`]);
	if (remote.out !== expectedHead) {
		return {
			outcome: "moved",
			reason: `the remote branch is at ${remote.out.slice(0, 12)}, not ${expectedHead.slice(0, 12)} as read`,
		};
	}
	const local = git(worktree, ["rev-parse", "HEAD"]).out;
	const current = git(worktree, ["symbolic-ref", "--short", "HEAD"]).out;
	if (local !== expectedHead || current !== branch) {
		return failed(
			`the worktree must have ${branch} checked out at ${expectedHead.slice(0, 12)}`,
		);
	}
	const base = git(worktree, [
		"merge-base",
		`refs/remotes/origin/${target}`,
		"HEAD",
	]);
	if (base.code !== 0)
		return failed("the branch shares no history with its target");
	const first = git(worktree, ["rev-list", "--reverse", `${base.out}..HEAD`]);
	const oldest = first.out.split("\n")[0];
	if (!oldest) return failed("the branch has no commits of its own");
	const message = git(worktree, ["log", "-1", "--format=%B", oldest]).stdout;
	const reset = git(worktree, ["reset", "--soft", base.out]);
	if (reset.code !== 0) return failed(reset.err);
	const commit = git(worktree, ["commit", "--quiet", "-m", message.trimEnd()]);
	if (commit.code !== 0) {
		git(worktree, ["reset", "--hard", expectedHead]);
		return failed(commit.out || commit.err || "the squash commit failed");
	}
	const rebase = git(worktree, [
		"rebase",
		"--quiet",
		`refs/remotes/origin/${target}`,
	]);
	if (rebase.code !== 0) {
		const files = git(worktree, ["diff", "--name-only", "--diff-filter=U"]).out;
		if (files === "") {
			git(worktree, ["rebase", "--abort"]);
			return failed(rebase.err || "the rebase failed");
		}
		return { outcome: "conflicts", files: files.split("\n") };
	}
	return pushWithLease(worktree, branch, expectedHead);
}

if (import.meta.main) {
	const [command, worktree, branch, third, fourth] = process.argv.slice(2);
	try {
		let result: BranchUpdateOutcome;
		if (command === "update" && worktree && branch && third && fourth) {
			result = updateBranch(worktree, branch, third, fourth);
		} else if (command === "push" && worktree && branch && third) {
			result = pushWithLease(worktree, branch, third);
		} else {
			console.error(
				`usage: ${BRANCH_UPDATE_INVOCATION} | ${BRANCH_PUSH_INVOCATION}`,
			);
			process.exit(2);
		}
		console.log(JSON.stringify(result, null, 2));
		process.exit(BRANCH_UPDATE_EXIT[result.outcome]);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
