import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quietRun } from "./quiet-run";

const noisyScript = (code: number) => [
	"bun",
	"-e",
	`for (let i = 0; i < 400; i++) console.log("checked file " + i);
console.error("src/fees.ts:12:3 error: Type 'string' is not assignable to type 'number'.");
console.log("Found 1 error.");
process.exit(${code});`,
];

async function withDir(fn: (dir: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), "quiet-run-"));
	try {
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test("a failing command returns its exit code and the failure lines, with the whole output in the log", async () => {
	await withDir(async (dir) => {
		const log = join(dir, "logs", "typecheck.log");
		const result = await quietRun(log, noisyScript(2), dir);
		expect(result.exitCode).toBe(2);
		expect(result.logPath).toBe(log);
		expect(result.outputExcerpt).toContain(
			"src/fees.ts:12:3 error: Type 'string' is not assignable to type 'number'.",
		);
		expect(result.outputExcerpt).toContain("Found 1 error.");
		expect(result.outputExcerpt.length).toBeLessThan(25);
		const saved = await Bun.file(log).text();
		expect(saved).toContain("checked file 0");
		expect(saved.length).toBe(result.outputChars);
	});
});

test("a passing command returns only its last lines", async () => {
	await withDir(async (dir) => {
		const result = await quietRun(join(dir, "lint.log"), noisyScript(0), dir);
		expect(result.exitCode).toBe(0);
		expect(result.outputExcerpt).toHaveLength(5);
	});
});

test("the command line passes the command's exit code through and refuses a missing separator", async () => {
	await withDir(async (dir) => {
		const run = (args: string[]) =>
			Bun.spawnSync(["bun", join(import.meta.dir, "quiet-run.ts"), ...args], {
				cwd: dir,
				env: { ...process.env },
			});
		const failed = run([join(dir, "x.log"), "--", ...noisyScript(3)]);
		expect(failed.exitCode).toBe(3);
		expect(JSON.parse(failed.stdout.toString())).toMatchObject({ exitCode: 3 });
		expect(run([join(dir, "x.log"), "bun", "--version"]).exitCode).toBe(2);
	});
});
