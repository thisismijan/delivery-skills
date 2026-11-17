import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	DEFAULT_MAX_FIX_ATTEMPTS,
	DEFAULT_MAX_PARALLEL_WORKTREES,
	DEFAULT_ROUTING_PROFILING,
	loadConfig,
	selectReadyWave,
} from "./config";

const script = join(import.meta.dir, "config.ts");

async function readyWave(args: string[], env: Record<string, string> = {}) {
	const child = Bun.spawn(["bun", script, "ready-wave", ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, code };
}

describe("loadConfig", () => {
	test("an empty environment yields the standard values", () => {
		const config = loadConfig({});
		expect(config.maxFixAttempts).toBe(DEFAULT_MAX_FIX_ATTEMPTS);
		expect(config.maxParallelWorktrees).toBe(DEFAULT_MAX_PARALLEL_WORKTREES);
		expect(config.maxParallelWorktrees).toBe(4);
		expect(config.modelDefault).toBe("sonnet");
		expect(config.routingProfiling).toBe(DEFAULT_ROUTING_PROFILING);
		expect(config.codeHost).toBeUndefined();
		expect(config.specTool).toBeUndefined();
	});

	test("provider ids pass through untouched", () => {
		const config = loadConfig({ CODE_HOST: "forge-b", SPEC_TOOL: "spec-c" });
		expect(config.codeHost).toBe("forge-b");
		expect(config.specTool).toBe("spec-c");
	});

	test("MAX_FIX_ATTEMPTS replaces the level's value", () => {
		const config = loadConfig({ MAX_FIX_ATTEMPTS: "3" });
		expect(config.maxFixAttempts).toBe(3);
	});

	test.each(["0", "abc"])("MAX_FIX_ATTEMPTS=%p is refused", (value) => {
		expect(() => loadConfig({ MAX_FIX_ATTEMPTS: value })).toThrow();
	});

	test("routing profiling turns on only when asked for", () => {
		const config = loadConfig({ ROUTING_PROFILING: "always" });
		expect(config.routingProfiling).toBe("always");
	});

	test("an unrecognised routing profiling mode is refused", () => {
		expect(() => loadConfig({ ROUTING_PROFILING: "sometimes" })).toThrow();
	});

	test("MAX_PARALLEL_WORKTREES replaces the level's value", () => {
		const config = loadConfig({ MAX_PARALLEL_WORKTREES: "2" });
		expect(config.maxParallelWorktrees).toBe(2);
	});

	test.each([
		"0",
		"abc",
		"0x10",
		"1e2",
		"+4",
		" 4 ",
		"4.0",
		"9007199254740992",
	])("MAX_PARALLEL_WORKTREES=%p is refused", (value) => {
		expect(() => loadConfig({ MAX_PARALLEL_WORKTREES: value })).toThrow();
	});
});

describe("selectReadyWave", () => {
	test("sends keys in order up to the limit and queues the rest", () => {
		expect(selectReadyWave(["A", "B", "C", "D", "E"], 4)).toEqual({
			dispatch: ["A", "B", "C", "D"],
			queued: ["E"],
		});
		expect(selectReadyWave(["A", "B"], 4)).toEqual({
			dispatch: ["A", "B"],
			queued: [],
		});
		expect(selectReadyWave([], 4)).toEqual({ dispatch: [], queued: [] });
	});

	test("a limit below one is an error", () => {
		expect(() => selectReadyWave(["A"], 0)).toThrow(/positive safe integer/);
	});

	test("a repeated key is an error", () => {
		expect(() => selectReadyWave(["A", "A"], 4)).toThrow(/unique/);
	});
});

describe("the ready-wave command", () => {
	test("batches by the limit taken from the environment", async () => {
		const keys = JSON.stringify(["K1", "K2", "K3", "K4", "K5"]);
		const run = await readyWave([keys], { MAX_PARALLEL_WORKTREES: "2" });
		expect(run.code).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({
			dispatch: ["K1", "K2"],
			queued: ["K3", "K4", "K5"],
			maxParallelWorktrees: 2,
		});
	});

	test("exits 1 when no key list is given", async () => {
		const run = await readyWave([]);
		expect(run.code).toBe(1);
		expect(run.stderr).toContain("requires a JSON array of keys");
	});

	test("trims each key before batching", async () => {
		const run = await readyWave([JSON.stringify([" WORK-1 ", "WORK-2"])]);
		expect(run.code).toBe(0);
		expect(JSON.parse(run.stdout)).toMatchObject({
			dispatch: ["WORK-1", "WORK-2"],
			queued: [],
		});
	});

	test.each([[[" "]], [["WORK-1", " WORK-1 "]]])(
		"exits 1 for the keys %j",
		async (keys) => {
			expect((await readyWave([JSON.stringify(keys)])).code).toBe(1);
		},
	);
});
