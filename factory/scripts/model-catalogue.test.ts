import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CATALOGUE_PATH,
	catalogueModels,
	fastCatalogueCandidateIds,
	loadModelCatalogue,
	registerFastCatalogueCandidate,
	requireFastCatalogueCandidate,
	resolveAvailableModel,
	writeModelCatalogue,
} from "./model-catalogue";

test("the bundled catalogue names every tier without host keys", async () => {
	const catalogue = await loadModelCatalogue();
	expect(catalogue.version).toBe(3);
	for (const tier of ["frontier", "standard", "fast"] as const) {
		expect(catalogue.tiers[tier].candidates.length).toBeGreaterThan(0);
		expect(catalogueModels(catalogue, tier)).toEqual(
			catalogue.tiers[tier].candidates,
		);
		expect(catalogue.tiers[tier]).not.toHaveProperty("cursor");
		expect(catalogue.tiers[tier]).not.toHaveProperty("claudeCode");
	}
});

test("the resolver chooses the first frontier model the runtime advertises", async () => {
	const catalogue = await loadModelCatalogue();
	const inventory = {
		version: 1 as const,
		recordedAt: "2026-10-16T09:00:00.000Z",
		models: [
			"claude-sonnet-5-5-medium",
			"claude-opus-5-5-high",
			"muse-wonder-1.0-high",
		],
	};
	expect(resolveAvailableModel(catalogue, "frontier", inventory)).toEqual({
		tier: "frontier",
		model: "muse-wonder-1.0-high",
		availability: "live",
	});
});

test("the resolver falls through when the first frontier candidate is unavailable", async () => {
	const catalogue = await loadModelCatalogue();
	const inventory = {
		version: 1 as const,
		recordedAt: "2026-10-16T09:00:00.000Z",
		models: ["claude-opus-5-5-high"],
	};
	expect(resolveAvailableModel(catalogue, "frontier", inventory).model).toBe(
		"claude-opus-5-5-high",
	);
});

test("fast catalogue ids include every bundled fast candidate", async () => {
	const catalogue = await loadModelCatalogue();
	const ids = fastCatalogueCandidateIds(catalogue);
	expect(ids.length).toBeGreaterThan(1);
	expect(ids).toEqual(catalogue.tiers.fast.candidates.map((item) => item.id));
	expect(requireFastCatalogueCandidate(catalogue, ids[0] ?? "")).toBe(ids[0]);
	expect(() => requireFastCatalogueCandidate(catalogue, "sonnet")).toThrow(
		"not a fast catalogue model",
	);
});

test("approved Spark and Haiku are live while Composer stays evaluation-only", async () => {
	const catalogue = await loadModelCatalogue();
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === "muse-spark-1.3-medium",
		)?.availability,
	).toBe("live");
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === "haiku",
		)?.availability,
	).toBe("live");
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === "composer-1",
		)?.availability,
	).toBe("evaluation-only");
	expect(
		catalogue.tiers.fast.candidates.map((candidate) => candidate.id),
	).toEqual(["muse-spark-1.3-medium", "composer-1", "haiku"]);
	expect(
		resolveAvailableModel(catalogue, "fast", {
			version: 1,
			recordedAt: "2026-10-16T09:00:00.000Z",
			models: ["haiku", "composer-1"],
		}),
	).toEqual({
		tier: "fast",
		model: "haiku",
		availability: "live",
	});
});

test("live fast candidates resolve without evaluation and others stay blocked", async () => {
	const catalogue = await loadModelCatalogue();
	const live = catalogue.tiers.fast.candidates.filter(
		(candidate) => candidate.availability === "live",
	);
	const evaluationOnly = catalogue.tiers.fast.candidates.filter(
		(candidate) => candidate.availability === "evaluation-only",
	);
	expect(live.length).toBeGreaterThan(0);
	expect(evaluationOnly.length).toBeGreaterThan(0);
	const liveId = live[0]?.id;
	const blockedId = evaluationOnly[0]?.id;
	if (!liveId || !blockedId) throw new Error("fast catalogue rows missing");
	expect(
		resolveAvailableModel(catalogue, "fast", {
			version: 1,
			recordedAt: "2026-10-16T09:00:00.000Z",
			models: [liveId, blockedId],
		}),
	).toEqual({
		tier: "fast",
		model: liveId,
		availability: "live",
	});
	expect(() =>
		resolveAvailableModel(catalogue, "fast", {
			version: 1,
			recordedAt: "2026-10-16T09:00:00.000Z",
			models: [blockedId],
		}),
	).toThrow("evaluation-only");
	expect(
		resolveAvailableModel(
			catalogue,
			"fast",
			{
				version: 1,
				recordedAt: "2026-10-16T09:00:00.000Z",
				models: [blockedId],
			},
			{ allowEvaluationOnly: true },
		).model,
	).toBe(blockedId);
});

test("a new exact id joins the fast tier as evaluation-only", async () => {
	const catalogue = await loadModelCatalogue();
	const next = registerFastCatalogueCandidate(
		catalogue,
		"muse-spark-1.4-medium",
	);
	expect(
		next.tiers.fast.candidates.find(
			(candidate) => candidate.id === "muse-spark-1.4-medium",
		)?.availability,
	).toBe("evaluation-only");
	expect(catalogue.tiers.fast.candidates.map((item) => item.id)).not.toContain(
		"muse-spark-1.4-medium",
	);
	expect(registerFastCatalogueCandidate(next, "muse-spark-1.4-medium")).toEqual(
		next,
	);
});

test("a standard-tier id cannot be registered as fast", async () => {
	const catalogue = await loadModelCatalogue();
	const standardId = catalogue.tiers.standard.candidates[0]?.id;
	if (!standardId) throw new Error("standard catalogue rows missing");
	expect(() => registerFastCatalogueCandidate(catalogue, standardId)).toThrow(
		"already a standard model",
	);
	expect(fastCatalogueCandidateIds(catalogue)).not.toContain(standardId);
});

test("register-fast writes a temp catalogue and refuses a standard id", async () => {
	const dir = await mkdtemp(join(tmpdir(), "register-fast-"));
	const cataloguePath = join(dir, "model-catalogue.json");
	try {
		await writeModelCatalogue(
			await loadModelCatalogue(CATALOGUE_PATH),
			cataloguePath,
		);
		const registered = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "model-catalogue.ts"),
				"register-fast",
				"muse-spark-1.4-medium",
				cataloguePath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await registered.exited).toBe(0);
		expect(JSON.parse(await new Response(registered.stdout).text())).toEqual({
			id: "muse-spark-1.4-medium",
			availability: "evaluation-only",
		});
		const before = await Bun.file(cataloguePath).text();
		const refused = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "model-catalogue.ts"),
				"register-fast",
				"sonnet",
				cataloguePath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await refused.exited).toBe(1);
		expect(await Bun.file(cataloguePath).text()).toBe(before);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("missing capability fails closed rather than choosing an unrelated model", async () => {
	const catalogue = await loadModelCatalogue();
	const inventory = {
		version: 1 as const,
		recordedAt: "2026-10-16T09:00:00.000Z",
		models: ["composer-1"],
	};
	expect(() => resolveAvailableModel(catalogue, "frontier", inventory)).toThrow(
		"no live frontier model",
	);
});

test("an old inventory host field is ignored when resolving advertised models", async () => {
	const catalogue = await loadModelCatalogue();
	const inventory = {
		version: 1 as const,
		host: "claudeCode" as const,
		recordedAt: "2026-10-16T09:00:00.000Z",
		models: ["muse-wonder-1.0-high"],
	};
	expect(resolveAvailableModel(catalogue, "frontier", inventory)).toEqual({
		tier: "frontier",
		model: "muse-wonder-1.0-high",
		availability: "live",
	});
});
