import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistObservation } from "./record-routing";
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
	expect(scorecard.actual.gatesPassed).toBe(2);
	expect(scorecard.actual.repairs).toBe(1);
	expect(scorecard.actual.inputTokens).toBe(40_000);
	expect(scorecard.actual.outputTokens).toBe(5_800);
	expect(scorecard.shadow.qualityStatus).toBe("not-evaluated");
	const text = formatRunRoutingScorecard(scorecard);
	expect(text).toContain("Shadow quality and savings are not evaluated");
	expect(text).not.toContain("shadowTier");
});

test("the CLI writes scorecard files without making them routing observations", async () => {
	const dir = await mkdtemp(join(tmpdir(), "routing-scorecard-"));
	try {
		const root = join(dir, ".delivery", "routing");
		const observation = representativeObservations()[0];
		if (!observation) throw new Error("representative observation missing");
		await persistObservation(root, observation);
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
		).json()) as { shadow: { qualityStatus: string } };
		expect(scorecard.shadow.qualityStatus).toBe("not-evaluated");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("a missing run fails instead of writing an empty scorecard", () => {
	expect(() =>
		buildRunRoutingScorecard(representativeObservations(), "missing"),
	).toThrow("no routing observations found");
});
