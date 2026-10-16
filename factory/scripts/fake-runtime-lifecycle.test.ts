import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capabilityResult, parseRuntimeManifest } from "./runtime-manifest";

setDefaultTimeout(20_000);

const stageGating = join(import.meta.dir, "stage-gating.ts");

async function runStage(
	stage: string,
	manifestPath: string,
): Promise<{
	exitCode: number;
	result: { allowed: boolean; reason?: string };
}> {
	const proc = Bun.spawn(["bun", stageGating, stage, manifestPath], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		proc.exited,
	]);
	return {
		exitCode,
		result: JSON.parse(stdout) as { allowed: boolean; reason?: string },
	};
}

describe("fake runtime end-to-end lifecycle", () => {
	test("a read-only stage is allowed and a mutating stage is denied when the guard is not enforced", async () => {
		const root = await mkdtemp(join(tmpdir(), "fake-runtime-"));
		try {
			const manifestPath = join(root, "runtime.json");
			const runtime = parseRuntimeManifest({
				version: 1,
				capabilities: {
					"process.run": {
						available: true,
						mode: "adapter",
						invocation: "fake.process.run",
					},
					"mutation.guard": {
						available: true,
						mode: "adapter",
						invocation: "fake.mutation.guard",
						enforcement: "unenforced",
					},
				},
			});
			await writeFile(manifestPath, `${JSON.stringify(runtime, null, 2)}\n`);

			const review = await runStage("review", manifestPath);
			expect(review.exitCode).toBe(0);
			expect(review.result).toEqual({ allowed: true });

			const execute = await runStage("execute", manifestPath);
			const guard = capabilityResult(runtime, "mutation.guard");
			expect(guard.ok).toBe(false);
			expect(execute.exitCode).toBe(1);
			expect(execute.result).toEqual({
				allowed: false,
				reason: guard.reason,
			});
			expect(execute.result.reason).toMatch(/mutation|enforce/i);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
