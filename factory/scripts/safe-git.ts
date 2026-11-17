// Git run by the coordinator on a worker's repository or worktree. A worker can
// write into its worktree and, without a sandbox, into the shared git
// directory, so a plain `git status` there would run a planted fsmonitor
// program or hook on the host. Command-line config outranks every config file.
export const SAFE_GIT_CONFIG = [
	"-c",
	"core.fsmonitor=false",
	"-c",
	"core.hooksPath=/dev/null",
] as const;

export interface GitRun {
	code: number;
	stdout: string;
	stderr: string;
}

export function safeGitArgv(args: readonly string[]): string[] {
	return ["git", ...SAFE_GIT_CONFIG, ...args];
}

export function safeGit(cwd: string, args: readonly string[]): GitRun {
	const proc = Bun.spawnSync(safeGitArgv(args), {
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
