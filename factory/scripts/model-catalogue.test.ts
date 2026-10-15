import { expect, test } from "bun:test";
import { catalogueHostModel, loadModelCatalogue } from "./model-catalogue";

test("the bundled catalogue names every tier for both hosts", async () => {
	const catalogue = await loadModelCatalogue();
	expect(catalogue.version).toBe(1);
	for (const tier of ["frontier", "standard", "fast"] as const) {
		expect(catalogue.tiers[tier].cursor.length).toBeGreaterThan(0);
		expect(catalogue.tiers[tier].claudeCode.length).toBeGreaterThan(0);
		expect(catalogueHostModel(catalogue, tier, "cursor")).toBe(
			catalogue.tiers[tier].cursor,
		);
	}
});

test("catalogue mappings are configuration, not dispatch", async () => {
	const catalogue = await loadModelCatalogue();
	expect(catalogue.tiers.frontier.claudeCode).toBe("opus");
	expect(catalogue.tiers.standard.claudeCode).toBe("sonnet");
});
