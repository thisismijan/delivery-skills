import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_WORKER_IDLE_MINUTES, loadConfig } from "./config";
import { watchWorkers } from "./worker-watch";

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
