import { expect, test } from "bun:test";
import {
	catalogueModels,
	fastCatalogueCandidateIds,
	loadModelCatalogue,
	requireFastCatalogueCandidate,
	resolveAvailableModel,
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

test("approved Spark is live while other fast models stay evaluation-only", async () => {
	const catalogue = await loadModelCatalogue();
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === "muse-spark-1.3-medium",
		)?.availability,
	).toBe("live");
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === "composer-1",
		)?.availability,
	).toBe("evaluation-only");
	expect(
		catalogue.tiers.fast.candidates.find(
			(candidate) => candidate.id === "haiku",
		)?.availability,
	).toBe("evaluation-only");
	const inventory = {
		version: 1 as const,
		recordedAt: "2026-10-16T09:00:00.000Z",
		models: ["muse-spark-1.3-medium", "composer-1"],
	};
	expect(resolveAvailableModel(catalogue, "fast", inventory)).toEqual({
		tier: "fast",
		model: "muse-spark-1.3-medium",
		availability: "live",
	});
	expect(() =>
		resolveAvailableModel(catalogue, "fast", {
			version: 1,
			recordedAt: "2026-10-16T09:00:00.000Z",
			models: ["composer-1"],
		}),
	).toThrow("evaluation-only");
	expect(
		resolveAvailableModel(
			catalogue,
			"fast",
			{
				version: 1,
				recordedAt: "2026-10-16T09:00:00.000Z",
				models: ["composer-1"],
			},
			{ allowEvaluationOnly: true },
		).model,
	).toBe("composer-1");
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
