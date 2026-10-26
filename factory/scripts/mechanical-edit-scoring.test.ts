import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMechanicalEdit } from "./apply-mechanical-edit";
import {
	MIN_EVALUATED_FAST_SAMPLES,
	applyFastPromotion,
	evaluatePromotion,
} from "./fast-dispatch";
import {
	UNSCRIPTED_MECHANICAL_CANDIDATE,
	scoreUnscriptedMechanicalPack,
	unscriptedMechanicalFixtures,
} from "./mechanical-edit-scoring";
import { loadModelCatalogue } from "./model-catalogue";

test("the unscripted pack has at least five representative units", () => {
	expect(unscriptedMechanicalFixtures().length).toBeGreaterThanOrEqual(
		MIN_EVALUATED_FAST_SAMPLES,
	);
});

test("every unscripted fixture keeps the current worker", async () => {
	for (const fixture of unscriptedMechanicalFixtures()) {
		const root = await mkdtemp(join(tmpdir(), "unscripted-mechanical-"));
		try {
			for (const [path, contents] of Object.entries(fixture.files)) {
				await Bun.write(join(root, path), contents);
			}
			const result = await applyMechanicalEdit({
				payload: fixture.payload,
				root,
			});
			expect(result.apply).toBe("select-model");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
});

test("scripted units are not in the unscripted scoring pack", () => {
	const ids = unscriptedMechanicalFixtures().map((fixture) => fixture.id);
	expect(ids).not.toContain("python-unused-import");
	expect(ids).not.toContain("java-unused-import");
	expect(ids).not.toContain("typescript-format-only");
});

test("haiku scores on the pack do not change live availability", async () => {
	const catalogue = await loadModelCatalogue();
	const before = structuredClone(catalogue);
	const entries = scoreUnscriptedMechanicalPack({
		candidateModel: UNSCRIPTED_MECHANICAL_CANDIDATE,
		relativeUtility: 0.91,
	});
	expect(entries.length).toBeGreaterThanOrEqual(MIN_EVALUATED_FAST_SAMPLES);
	const verdict = evaluatePromotion(entries, UNSCRIPTED_MECHANICAL_CANDIDATE);
	expect(verdict.evidenceCleared).toBe(true);
	expect(verdict.availability).toBe("evaluation-only");
	expect(applyFastPromotion(catalogue, verdict)).toEqual(before);
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === UNSCRIPTED_MECHANICAL_CANDIDATE,
		)?.availability,
	).toBe("evaluation-only");
});

test("live scores on the pack do not count as graduation evidence", () => {
	const entries = scoreUnscriptedMechanicalPack({
		candidateModel: UNSCRIPTED_MECHANICAL_CANDIDATE,
		relativeUtility: 0.91,
		source: "live",
	});
	const verdict = evaluatePromotion(entries, UNSCRIPTED_MECHANICAL_CANDIDATE);
	expect(verdict.evidenceCleared).toBe(false);
	expect(verdict.sampleSize).toBe(0);
	expect(verdict.availability).toBe("evaluation-only");
});

test("the CLI lists the unscripted fixtures", async () => {
	const proc = Bun.spawn(
		["bun", join(import.meta.dir, "mechanical-edit-scoring.ts")],
		{ stdout: "pipe", stderr: "pipe" },
	);
	expect(await proc.exited).toBe(0);
	expect(JSON.parse(await new Response(proc.stdout).text())).toMatchObject({
		candidate: "haiku",
		observations: unscriptedMechanicalFixtures().length,
	});
});
