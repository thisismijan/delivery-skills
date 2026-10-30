import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistObservation } from "./record-routing";
import { persistSkipBatch } from "./record-skip";
import { representativeObservations } from "./representative-routing-runs";
import {
	buildRunRoutingScorecard,
	formatRunRoutingScorecard,
} from "./routing-scorecard";

test("a run scorecard separates measured live results from unevaluated shadow advice", () => {
	const scorecard = buildRunRoutingScorecard(
		representativeObservations(),
		"run-execute-mdf-sample",
	);
	expect(scorecard.taskCount).toBe(2);
	expect(scorecard.workersAvoided.count).toBe(0);
	expect(scorecard.actual.gatesPassed).toBe(2);
	expect(scorecard.actual.repairs).toBe(1);
	expect(scorecard.actual.inputTokens).toBe(40_000);
	expect(scorecard.actual.outputTokens).toBe(5_800);
	expect(scorecard.shadow.qualityStatus).toBe("not-evaluated");
	const text = formatRunRoutingScorecard(scorecard);
	expect(text).toContain("Shadow quality and savings are not evaluated");
	expect(text).toContain(
		"Workers avoided: none. Token savings are not estimated.",
	);
	expect(text).not.toContain("shadowTier");
});

test("a run scorecard counts skipped workers without inventing token savings", () => {
	const observations = representativeObservations().filter(
		(item) => item.runId === "run-execute-mdf-sample",
	);
	const skips = [
		{
			version: 1 as const,
			runId: "run-execute-mdf-sample",
			skipId: "mechanical-test-writer",
			worker: "test-writer" as const,
			reason: "mechanical-edit apply is script",
			recordedAt: "2026-10-28T15:00:00.000Z",
		},
		{
			version: 1 as const,
			runId: "run-execute-mdf-sample",
			skipId: "mechanical-implementer",
			worker: "implementer" as const,
			reason: "mechanical-edit apply is script",
			recordedAt: "2026-10-28T15:00:01.000Z",
		},
	];
	const scorecard = buildRunRoutingScorecard(
		observations,
		"run-execute-mdf-sample",
		skips,
	);
	expect(scorecard.workersAvoided.count).toBe(2);
	expect(scorecard.workersAvoided.byWorker).toEqual({
		implementer: 1,
		"test-writer": 1,
	});
	const text = formatRunRoutingScorecard(scorecard);
	expect(text).toContain("Workers avoided: 2 (implementer, test-writer).");
	expect(text).toContain("Token savings are not estimated.");
	expect(text).not.toMatch(/tokens saved/i);
});

test("a skip-only run still writes a scorecard", () => {
	const skips = [
		{
			version: 1 as const,
			runId: "run-skip-only",
			skipId: "empty-comments",
			worker: "comment-assessor" as const,
			reason: "no in-scope comments remained",
			recordedAt: "2026-10-28T15:02:00.000Z",
		},
	];
	const scorecard = buildRunRoutingScorecard([], "run-skip-only", skips);
	expect(scorecard.taskCount).toBe(0);
	expect(scorecard.workersAvoided.count).toBe(1);
	expect(formatRunRoutingScorecard(scorecard)).toContain(
		"Workers avoided: 1 (comment-assessor).",
	);
});

test("the CLI writes scorecard files without making them routing observations", async () => {
	const dir = await mkdtemp(join(tmpdir(), "routing-scorecard-"));
	try {
		const root = join(dir, ".delivery", "routing");
		const observation = representativeObservations()[0];
		if (!observation) throw new Error("representative observation missing");
		await persistObservation(root, observation);
		await persistSkipBatch(root, observation.runId, {
			skipId: "mechanical-test-writer",
			worker: "test-writer",
			reason: "mechanical-edit apply is script",
		});
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "routing-scorecard.ts"),
				root,
				observation.runId,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		expect(
			await Bun.file(join(root, observation.runId, "scorecard.md")).exists(),
		).toBe(true);
		const scorecard = (await Bun.file(
			join(root, observation.runId, "scorecard.json"),
		).json()) as {
			shadow: { qualityStatus: string };
			workersAvoided: { count: number };
		};
		expect(scorecard.shadow.qualityStatus).toBe("not-evaluated");
		expect(scorecard.workersAvoided.count).toBe(1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("a missing run fails instead of writing an empty scorecard", () => {
	expect(() =>
		buildRunRoutingScorecard(representativeObservations(), "missing"),
	).toThrow("no routing observations found");
});

test("a hostile run id cannot escape the scorecard output directory", async () => {
	const dir = await mkdtemp(join(tmpdir(), "routing-scorecard-hostile-"));
	try {
		const root = join(dir, "routing");
		const proc = Bun.spawn(
			["bun", join(import.meta.dir, "routing-scorecard.ts"), root, "../escape"],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(1);
		expect(await Bun.file(join(dir, "escape", "scorecard.md")).exists()).toBe(
			false,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
