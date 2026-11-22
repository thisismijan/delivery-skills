import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { outputExcerpt } from "./test-gate";

export const QUIET_RUN_USAGE = "quiet-run.ts <log-file> -- <command> [args...]";

export interface QuietRunResult {
	exitCode: number;
	logPath: string;
	outputChars: number;
	outputExcerpt: string[];
}

// Runs a command without a shell, keeps its whole output in a log file, and returns only what a
// reader needs: the exit code and, on failure, the lines that name the failure plus the end.
export async function quietRun(
	logPath: string,
	argv: readonly string[],
	cwd: string = process.cwd(),
): Promise<QuietRunResult> {
	if (argv.length === 0) throw new Error(`usage: ${QUIET_RUN_USAGE}`);
	const child = Bun.spawn([...argv], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env },
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	const output = `${stdout}${stderr}`;
	await mkdir(dirname(logPath), { recursive: true });
	const temporary = `${logPath}.${process.pid}.tmp`;
	await writeFile(temporary, output);
	await rename(temporary, logPath);
	return {
		exitCode,
		logPath,
		outputChars: output.length,
		outputExcerpt: outputExcerpt(output, exitCode === 0),
	};
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const separator = args.indexOf("--");
	const logPath = args[0];
	if (!logPath || separator !== 1 || args.length < 3) {
		console.error(`usage: ${QUIET_RUN_USAGE}`);
		process.exit(2);
	}
	try {
		const result = await quietRun(logPath, args.slice(2));
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.exitCode);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
