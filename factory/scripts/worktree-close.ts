import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const WORKTREE_CLOSE_INVOCATION =
	"scripts/worktree-close.ts <worktree-path> [--dry-run]";

export type WorktreeCloseDecision = "removed" | "would-remove" | "kept";

export interface WorktreeCloseResult {
	decision: WorktreeCloseDecision;
	path: string;
	branch?: string;
	reasons: string[];
}

interface GitRun {
	code: number;
	stdout: string;
	stderr: string;
}

function git(cwd: string, args: string[]): GitRun {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: proc.exitCode ?? 1,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

function required(cwd: string, args: string[], failure: string): string {
	const run = git(cwd, args);
	if (run.code !== 0) throw new Error(failure);
	return run.stdout.trim();
}

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

export function closeWorktree(
	path: string,
	options: { dryRun?: boolean } = {},
): WorktreeCloseResult {
	const root = canonical(path);
	const top = required(
		root,
		["rev-parse", "--show-toplevel"],
		`${path} is not inside a git worktree.`,
	);
	if (canonical(top) !== root) {
		throw new Error(`${path} is not the top of a git worktree.`);
	}
	const gitDir = canonical(
		resolve(
			root,
			required(root, ["rev-parse", "--git-dir"], "git dir unreadable"),
		),
	);
	const commonDir = canonical(
		resolve(
			root,
			required(
				root,
				["rev-parse", "--git-common-dir"],
				"git common dir unreadable",
			),
		),
	);
	if (gitDir === commonDir) {
		throw new Error(
			`${path} is the primary checkout, not a worker worktree; it is never removed.`,
		);
	}

	const reasons: string[] = [];
	const status = required(
		root,
		[
			"status",
			"--porcelain=v1",
			"--untracked-files=all",
			"--ignore-submodules=none",
		],
		"git status failed",
	);
	const entries = status.split("\n").filter(Boolean);
	const untracked = entries.filter((line) => line.startsWith("??")).length;
	const changed = entries.length - untracked;
	if (changed > 0) {
		reasons.push(
			`${changed} file${changed === 1 ? " has" : "s have"} uncommitted changes.`,
		);
	}
	if (untracked > 0) {
		reasons.push(
			`${untracked} untracked file${untracked === 1 ? " is" : "s are"} not committed.`,
		);
	}

	const branchRun = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
	const branch = branchRun.code === 0 ? branchRun.stdout.trim() : undefined;
	const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
	if (head.code !== 0) {
		reasons.push("The worktree has no commit yet.");
	} else {
		const onRemote = required(
			root,
			[
				"for-each-ref",
				"--contains",
				"HEAD",
				"--format=%(refname)",
				"refs/remotes",
			],
			"git for-each-ref failed",
		);
		if (onRemote.length === 0) {
			reasons.push(
				branch
					? `Branch ${branch} has commits that are not pushed.`
					: "The last commit is not on any remote branch.",
			);
		}
	}

	const base = { path: root, ...(branch ? { branch } : {}) };
	if (reasons.length > 0) return { decision: "kept", ...base, reasons };
	if (options.dryRun) return { decision: "would-remove", ...base, reasons };
	const removed = git(commonDir, ["worktree", "remove", root]);
	if (removed.code !== 0) {
		return {
			decision: "kept",
			...base,
			reasons: [
				`git refused to remove the worktree: ${removed.stderr.trim() || "unknown reason"}.`,
			],
		};
	}
	return { decision: "removed", ...base, reasons };
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const paths = args.filter((arg) => arg !== "--dry-run");
	if (paths.length !== 1 || !paths[0]) {
		console.error(`usage: ${WORKTREE_CLOSE_INVOCATION}`);
		process.exit(2);
	}
	try {
		const result = closeWorktree(paths[0], { dryRun });
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
