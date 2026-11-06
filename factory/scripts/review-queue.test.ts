import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_AWAITING_REVIEW,
	loadConfig,
	selectReadyWave,
} from "./config";
import { awaitingReview } from "./review-queue";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function ledger(rows: string[]): string {
	return [
		"# Ship the panel",
		"",
		"## Keys",
		"",
		"| Key | Title | Stage | MR | Blocked by | Status |",
		"|-----|-------|-------|----|------------|--------|",
		...rows,
		"",
		"## Verdicts",
		"",
		"| Date | MR | Kind | Head | Base | Patch-id | Verdict | By |",
		"|------|----|------|------|------|----------|---------|----|",
		"| 2026-11-01 | !9 | readiness | a | b | p | go | factory |",
		"",
	].join("\n");
}

const ROWS = [
	"| WORK-1 | Panel | 4 | !11 | | [go !11] |",
	"| WORK-2 | Totals | 3 | !12 | | [reviewed-blocked !12] |",
	"| WORK-3 | Export | 4 | !13 | | [waiting: pipeline abc] |",
	"| WORK-4 | Filter | 4 | !14 | | [stopped: scope] |",
	"| WORK-5 | Legend | 5 | !15 | | [merged !15] |",
	"| WORK-6 | Axis | 5 | !16 | | [verified !16] |",
	"| WORK-7 | Theme | 2 | | | [drafted] |",
	"| WORK-8 | Print | 1 | - | WORK-7 | [groomed] |",
];

describe("awaitingReview", () => {
	test("counts every open change, stopped and waiting ones included", () => {
		expect(awaitingReview(ledger(ROWS))).toEqual([
			{ key: "WORK-1", mr: "!11", status: "[go !11]" },
			{ key: "WORK-2", mr: "!12", status: "[reviewed-blocked !12]" },
			{ key: "WORK-3", mr: "!13", status: "[waiting: pipeline abc]" },
			{ key: "WORK-4", mr: "!14", status: "[stopped: scope]" },
		]);
	});

	test("reads only the Keys table", () => {
		expect(awaitingReview(ledger([]))).toEqual([]);
	});

	test("fails closed on a ledger it cannot read", () => {
		expect(() => awaitingReview("# Run\n\nNo table here.\n")).toThrow(
			"no Keys table",
		);
		expect(() =>
			awaitingReview(ledger(["| WORK-1 | Panel | 4 | MR 11 | | [go !11] |"])),
		).toThrow('unreadable change "MR 11"');
		expect(() => awaitingReview(ledger(["| WORK-1 | Panel | !11 |"]))).toThrow(
			"malformed row",
		);
	});
});

describe("the review queue holds new work", () => {
	test("no new worker starts while the operator's queue is full", () => {
		expect(
			selectReadyWave(["WORK-9", "WORK-10"], 4, [], {
				awaiting: 5,
				maxAwaitingReview: 5,
			}),
		).toEqual({
			dispatch: [],
			queued: ["WORK-9", "WORK-10"],
			heldForReview: true,
		});
	});

	test("live workers count against the queue, because each opens a change", () => {
		expect(
			selectReadyWave(["WORK-9", "WORK-10"], 4, ["WORK-7"], {
				awaiting: 3,
				maxAwaitingReview: 5,
			}),
		).toEqual({
			dispatch: ["WORK-9"],
			queued: ["WORK-10"],
			heldForReview: true,
		});
	});

	test("the worker cap still applies when the queue has room", () => {
		expect(
			selectReadyWave(["WORK-9", "WORK-10"], 1, [], {
				awaiting: 0,
				maxAwaitingReview: 5,
			}),
		).toEqual({ dispatch: ["WORK-9"], queued: ["WORK-10"] });
	});

	test("the limit defaults to five and MAX_AWAITING_REVIEW changes it", () => {
		expect(DEFAULT_MAX_AWAITING_REVIEW).toBe(5);
		expect(loadConfig({}).maxAwaitingReview).toBe(5);
		expect(loadConfig({ MAX_AWAITING_REVIEW: "2" }).maxAwaitingReview).toBe(2);
		expect(() => loadConfig({ MAX_AWAITING_REVIEW: "0" })).toThrow();
	});

	test("the ready-wave command reads the queue from the ledger", () => {
		const dir = mkdtempSync(join(tmpdir(), "review-queue-"));
		dirs.push(dir);
		const ledgerPath = join(dir, "WORK.md");
		writeFileSync(ledgerPath, ledger(ROWS));
		const proc = Bun.spawnSync(
			[
				"bun",
				join(import.meta.dir, "config.ts"),
				"ready-wave",
				JSON.stringify(["WORK-7"]),
				join(dir, "dispatch.json"),
				ledgerPath,
			],
			{
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, MAX_AWAITING_REVIEW: "4" },
			},
		);
		expect(proc.stderr.toString()).toBe("");
		expect(JSON.parse(proc.stdout.toString())).toMatchObject({
			dispatch: [],
			queued: ["WORK-7"],
			heldForReview: true,
			maxAwaitingReview: 4,
			awaitingReview: [
				{ mr: "!11" },
				{ mr: "!12" },
				{ mr: "!13" },
				{ mr: "!14" },
			],
		});
	});
});
