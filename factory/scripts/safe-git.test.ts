import { expect, test } from "bun:test";
import { SAFE_GIT_CONFIG, safeGitArgv } from "./safe-git";

test("every coordinator git command on a worker worktree disables fsmonitor and hooks first", () => {
	expect(safeGitArgv(["status", "--porcelain"])).toEqual([
		"git",
		"-c",
		"core.fsmonitor=false",
		"-c",
		"core.hooksPath=/dev/null",
		"status",
		"--porcelain",
	]);
	expect([...SAFE_GIT_CONFIG]).toHaveLength(4);
});
