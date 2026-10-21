import { expect, test } from "bun:test";
import { join } from "node:path";
import {
	DEFAULT_MAX_FIX_ATTEMPTS,
	DEFAULT_MAX_PARALLEL_WORKTREES,
	loadConfig,
	selectReadyWave,
} from "./config";

test("defaults when env is empty", () => {
	const c = loadConfig({});
	expect(c.maxFixAttempts).toBe(DEFAULT_MAX_FIX_ATTEMPTS);
	expect(c.maxParallelWorktrees).toBe(DEFAULT_MAX_PARALLEL_WORKTREES);
	expect(c.maxParallelWorktrees).toBe(4);
	expect(c.modelDefault).toBe("sonnet");
	expect(c.codeHost).toBeUndefined();
	expect(c.specTool).toBeUndefined();
});

test("accepts generic forge and spec provider ids or leaves them absent", () => {
	const c = loadConfig({
		CODE_HOST: "forge-b",
		SPEC_TOOL: "spec-c",
	});
	expect(c.codeHost).toBe("forge-b");
	expect(c.specTool).toBe("spec-c");
});

test("reads MAX_FIX_ATTEMPTS from env", () => {
	expect(loadConfig({ MAX_FIX_ATTEMPTS: "3" }).maxFixAttempts).toBe(3);
});

test("throws on a non-positive fix-attempt count (fail closed)", () => {
	expect(() => loadConfig({ MAX_FIX_ATTEMPTS: "0" })).toThrow();
});

test("throws on a non-numeric fix-attempt count", () => {
	expect(() => loadConfig({ MAX_FIX_ATTEMPTS: "abc" })).toThrow();
});

test("reads MAX_PARALLEL_WORKTREES from env", () => {
	expect(loadConfig({ MAX_PARALLEL_WORKTREES: "2" }).maxParallelWorktrees).toBe(
		2,
	);
});

test("throws on a non-positive parallel worktree count (fail closed)", () => {
	expect(() => loadConfig({ MAX_PARALLEL_WORKTREES: "0" })).toThrow();
});

test("throws on a non-numeric parallel worktree count", () => {
	expect(() => loadConfig({ MAX_PARALLEL_WORKTREES: "abc" })).toThrow();
});

test("throws on an unsafe parallel worktree count", () => {
	expect(() =>
		loadConfig({ MAX_PARALLEL_WORKTREES: "9007199254740992" }),
	).toThrow();
});

test("selectReadyWave dispatches at most the configured limit and preserves order", () => {
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

test("selectReadyWave refuses a non-positive limit", () => {
	expect(() => selectReadyWave(["A"], 0)).toThrow(/positive safe integer/);
});

test("selectReadyWave refuses duplicate keys", () => {
	expect(() => selectReadyWave(["A", "A"], 4)).toThrow(/unique/);
});

test("the ready-wave CLI uses the configured limit", async () => {
	const proc = Bun.spawn(
		[
			"bun",
			join(import.meta.dir, "config.ts"),
			"ready-wave",
			JSON.stringify(["K1", "K2", "K3", "K4", "K5"]),
		],
		{
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, MAX_PARALLEL_WORKTREES: "2" },
		},
	);
	expect(await proc.exited).toBe(0);
	expect(JSON.parse(await new Response(proc.stdout).text())).toEqual({
		dispatch: ["K1", "K2"],
		queued: ["K3", "K4", "K5"],
		maxParallelWorktrees: 2,
	});
});

test("the ready-wave CLI fails closed without a key list", async () => {
	const proc = Bun.spawn(
		["bun", join(import.meta.dir, "config.ts"), "ready-wave"],
		{ stdout: "pipe", stderr: "pipe" },
	);
	expect(await proc.exited).toBe(1);
	expect(await new Response(proc.stderr).text()).toContain(
		"requires a JSON array of keys",
	);
});
