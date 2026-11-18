import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ModelCatalogue,
	type ModelInventory,
	loadModelCatalogue,
	resolveSecondFamily,
} from "./model-catalogue";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const tier = (
	candidates: ModelCatalogue["tiers"]["standard"]["candidates"],
) => ({
	candidates,
	purpose: "test",
});

const catalogue: ModelCatalogue = {
	version: 3,
	tiers: {
		frontier: tier([
			{ id: "big-1", availability: "live", aliases: [], family: "alpha" },
		]),
		standard: tier([
			{
				id: "alpha-mid",
				availability: "live",
				aliases: ["alpha-mid-host"],
				family: "alpha",
			},
			{
				id: "beta-trial",
				availability: "evaluation-only",
				aliases: [],
				family: "beta",
			},
			{ id: "gamma-mid", availability: "live", aliases: [], family: "gamma" },
			{ id: "alpha-old", availability: "live", aliases: [], family: "alpha" },
		]),
		fast: tier([
			{ id: "small-1", availability: "live", aliases: [], family: "alpha" },
		]),
	},
};

const inventory = (models: string[]): ModelInventory => ({
	version: 1,
	recordedAt: "2026-11-16T00:00:00Z",
	models,
});

test("a live model from another family takes one seat", () => {
	expect(
		resolveSecondFamily(
			catalogue,
			"standard",
			inventory(["alpha-mid-host", "gamma-mid"]),
		),
	).toEqual({
		primary: {
			tier: "standard",
			model: "alpha-mid-host",
			availability: "live",
		},
		otherFamily: { tier: "standard", model: "gamma-mid", availability: "live" },
		reason:
			"gamma-mid is a live standard model from a different family than alpha-mid-host.",
	});
});

test("with one family available, no second seat is chosen and the reason says so", () => {
	const result = resolveSecondFamily(
		catalogue,
		"standard",
		inventory(["alpha-mid", "alpha-old", "beta-trial"]),
	);
	expect(result.otherFamily).toBeNull();
	expect(result.reason).toBe(
		"Only one standard model family is available, so every lens uses alpha-mid.",
	);
});

test("a model with no recorded family never gets a second seat", () => {
	const unknown: ModelCatalogue = {
		...catalogue,
		tiers: {
			...catalogue.tiers,
			standard: tier([
				{ id: "plain", availability: "live", aliases: [] },
				{ id: "gamma-mid", availability: "live", aliases: [], family: "gamma" },
			]),
		},
	};
	expect(
		resolveSecondFamily(unknown, "standard", inventory(["plain", "gamma-mid"]))
			.otherFamily,
	).toBeNull();
});

test("every model in the shipped catalogue records its family", async () => {
	const shipped = await loadModelCatalogue();
	for (const level of Object.values(shipped.tiers)) {
		for (const candidate of level.candidates) {
			expect({ id: candidate.id, family: typeof candidate.family }).toEqual({
				id: candidate.id,
				family: "string",
			});
		}
	}
});

test("the command prints the choice for a recorded inventory", () => {
	const dir = mkdtempSync(join(tmpdir(), "second-family-"));
	dirs.push(dir);
	const file = join(dir, "inventory.json");
	writeFileSync(
		file,
		JSON.stringify(
			inventory(["claude-sonnet-5-5-medium", "gemini-4-argon-medium"]),
		),
	);
	const proc = Bun.spawnSync(
		[
			"bun",
			join(import.meta.dir, "model-catalogue.ts"),
			"second-family",
			"standard",
			file,
		],
		{ stdout: "pipe", stderr: "pipe", env: process.env },
	);
	expect(proc.exitCode).toBe(0);
	const result = JSON.parse(proc.stdout.toString());
	expect(result.primary.model).toBe("claude-sonnet-5-5-medium");
	expect(result.otherFamily.model).toBe("gemini-4-argon-medium");
});

test("the code review runs one lens on the second family and reports lens models", () => {
	const skill = readFileSync(
		join(import.meta.dir, "..", "..", "skills", "code-review-max", "SKILL.md"),
		"utf8",
	);
	expect(skill).toContain('scripts/model-catalogue.ts" second-family standard');
	const text = skill.replace(/\s+/g, " ");
	const seat = readFileSync(
		join(
			import.meta.dir,
			"..",
			"..",
			"skills",
			"code-review-max",
			"reference",
			"second-family.md",
		),
		"utf8",
	).replace(/\s+/g, " ");
	expect(text).toContain(
		"When `otherFamily` names a model, read `reference/second-family.md`.",
	);
	expect(seat).toContain(
		"When `otherFamily` names a model, run exactly one lens on it in place of the standard model",
	);
	expect(seat).toContain("so the lens count and the cost stay the same");
	expect(text).toContain(
		"When `otherFamily` is null, every lens uses the standard model.",
	);
	expect(skill).toContain("### Lens models");
});
