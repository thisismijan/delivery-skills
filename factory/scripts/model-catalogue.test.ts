import { expect, test } from "bun:test";
import {
	catalogueModels,
	loadModelCatalogue,
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

test("available fast models remain blocked from live routing", async () => {
	const catalogue = await loadModelCatalogue();
	const inventory = {
		version: 1 as const,
		recordedAt: "2026-10-16T09:00:00.000Z",
		models: ["muse-spark-1.3-medium", "composer-1"],
	};
	expect(() => resolveAvailableModel(catalogue, "fast", inventory)).toThrow(
		"evaluation-only",
	);
	expect(
		resolveAvailableModel(catalogue, "fast", inventory, {
			allowEvaluationOnly: true,
		}).model,
	).toBe("muse-spark-1.3-medium");
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
