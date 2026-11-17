import { afterEach, expect, test } from "bun:test";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_WORKER_IDLE_MINUTES, loadConfig } from "./config";
import { isTerminalStatus, journalStatus, watchWorkers } from "./worker-watch";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function workersDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "worker-watch-"));
	dirs.push(dir);
	return dir;
}

function journal(dir: string, key: string, at: Date): void {
	const path = join(dir, `${key}.md`);
	writeFileSync(path, "# journal\n");
	utimesSync(path, at, at);
}

const NOW = new Date("2026-10-29T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
	new Date(NOW.getTime() - minutes * 60_000);

test("a recent journal write keeps a worker active and a stale one marks it idle", () => {
	const dir = workersDir();
	journal(dir, "WORK-1", minutesAgo(3));
	journal(dir, "WORK-2", minutesAgo(25));
	const result = watchWorkers({
		workersDir: dir,
		dispatch: {
			workers: [
				{ key: "WORK-1", dispatchedAt: minutesAgo(40).toISOString() },
				{ key: "WORK-2", dispatchedAt: minutesAgo(40).toISOString() },
			],
		},
		now: NOW,
		idleLimitMinutes: 20,
	});
	expect(result.idle).toEqual(["WORK-2"]);
	expect(result.workers).toEqual([
		{
			key: "WORK-1",
			state: "active",
			lastActivity: minutesAgo(3).toISOString(),
			idleMinutes: 3,
			journal: true,
		},
		{
			key: "WORK-2",
			state: "idle",
			lastActivity: minutesAgo(25).toISOString(),
			idleMinutes: 25,
			journal: true,
		},
	]);
});

test("a worker with no journal is timed from its dispatch", () => {
	const dir = workersDir();
	const result = watchWorkers({
		workersDir: dir,
		dispatch: {
			workers: [
				{ key: "WORK-1", dispatchedAt: minutesAgo(5).toISOString() },
				{ key: "WORK-2", dispatchedAt: minutesAgo(21).toISOString() },
			],
		},
		now: NOW,
		idleLimitMinutes: 20,
	});
	expect(result.idle).toEqual(["WORK-2"]);
	expect(result.workers[0]).toMatchObject({ state: "active", journal: false });
});

test("a journal older than the dispatch counts from the dispatch", () => {
	const dir = workersDir();
	journal(dir, "WORK-1", minutesAgo(60));
	const result = watchWorkers({
		workersDir: dir,
		dispatch: {
			workers: [{ key: "WORK-1", dispatchedAt: minutesAgo(2).toISOString() }],
		},
		now: NOW,
		idleLimitMinutes: 20,
	});
	expect(result.workers[0]).toMatchObject({ state: "active", idleMinutes: 2 });
});

test("malformed dispatch input and limits fail closed", () => {
	const dir = workersDir();
	for (const dispatch of [
		{ workers: [] },
		{ workers: [{ key: "work-1", dispatchedAt: NOW.toISOString() }] },
		{ workers: [{ key: "WORK-1", dispatchedAt: "yesterday" }] },
		{
			workers: [
				{ key: "WORK-1", dispatchedAt: NOW.toISOString() },
				{ key: "WORK-1", dispatchedAt: NOW.toISOString() },
			],
		},
	]) {
		expect(() =>
			watchWorkers({
				workersDir: dir,
				dispatch,
				now: NOW,
				idleLimitMinutes: 20,
			}),
		).toThrow();
	}
	expect(() =>
		watchWorkers({
			workersDir: dir,
			dispatch: {
				workers: [{ key: "WORK-1", dispatchedAt: NOW.toISOString() }],
			},
			now: NOW,
			idleLimitMinutes: 0,
		}),
	).toThrow(/positive/);
});

test("the idle limit defaults to twenty minutes and is configurable", () => {
	expect(DEFAULT_WORKER_IDLE_MINUTES).toBe(20);
	expect(loadConfig({}).workerIdleMinutes).toBe(20);
	expect(loadConfig({ WORKER_IDLE_MINUTES: "45" }).workerIdleMinutes).toBe(45);
	expect(() => loadConfig({ WORKER_IDLE_MINUTES: "0" })).toThrow();
});

function journalWith(dir: string, key: string, status: string, at: Date) {
	const path = join(dir, `${key}.md`);
	writeFileSync(
		path,
		[
			"# journal",
			"",
			"## Keys",
			"",
			"| Key | Title | Stage | MR | Blocked by | Status |",
			"|-----|-------|-------|----|------------|--------|",
			`| ${key} | Title | 3 | !4 | - | ${status} |`,
			"",
		].join("\n"),
	);
	utimesSync(path, at, at);
}

test("a worker whose journal ends terminal is finished, not idle", () => {
	const dir = workersDir();
	journalWith(dir, "WORK-1", "[go !4]", minutesAgo(45));
	journalWith(dir, "WORK-2", "[stopped: pipeline red]", minutesAgo(2));
	journalWith(dir, "WORK-3", "[ready !6]", minutesAgo(45));
	journalWith(dir, "WORK-4", "[waiting: pipeline]", minutesAgo(45));
	const dispatchedAt = minutesAgo(60).toISOString();
	const result = watchWorkers({
		workersDir: dir,
		dispatch: {
			workers: ["WORK-1", "WORK-2", "WORK-3", "WORK-4"].map((key) => ({
				key,
				dispatchedAt,
			})),
		},
		now: NOW,
		idleLimitMinutes: 20,
	});
	expect(result.finished).toEqual(["WORK-1", "WORK-2"]);
	expect(result.idle).toEqual(["WORK-3", "WORK-4"]);
	expect(result.workers[0]).toMatchObject({
		key: "WORK-1",
		state: "finished",
		status: "[go !4]",
		idleMinutes: 45,
	});
});

test("only the worker's own row and known terminal tags count", () => {
	expect(
		journalStatus("| WORK-9 | x | 3 | !1 | - | [go !1] |\n", "WORK-1"),
	).toBeNull();
	expect(journalStatus("# journal\n", "WORK-1")).toBeNull();
	for (const status of [
		"[go !4]",
		"[merged !4]",
		"[stopped: no sandbox]",
		"[retro done]",
		"[triage: duplicate WORK-2]",
	]) {
		expect(isTerminalStatus(status)).toBe(true);
	}
	for (const status of [
		"[ready !4]",
		"[no-go !4]",
		"[waiting: approval]",
		"[executing]",
		"[stopped: ]",
		null,
	]) {
		expect(isTerminalStatus(status)).toBe(false);
	}
});

test("auto reconciles a finished worker and ends it instead of stopping it as idle", () => {
	const root = join(import.meta.dir, "..", "..");
	const auto = readFileSync(
		join(root, "skills/delivery/workflows/auto.md"),
		"utf8",
	).replace(/\s+/g, " ");
	expect(auto).toContain("Exit 4 names a finished worker");
	expect(auto).toContain(
		"reconcile its result from its journal, git, and forge as for any settled worker",
	);
	expect(auto).toContain(
		'scripts/sandbox-run.ts" stop <repoRoot> <run-id> <KEY>` ends its container',
	);
	expect(auto).toContain(
		"Never treat a finished worker as idle or redo its work",
	);
	const reference = readFileSync(join(root, "docs/reference.md"), "utf8");
	expect(reference).toContain(
		"finished when its journal row ends in a terminal status",
	);
});
