import { join } from "node:path";
import { z } from "zod";
import type { ModelTier } from "./task-profile";

export const ModelHost = z.enum(["cursor", "claudeCode"]);
export type ModelHost = z.infer<typeof ModelHost>;

export const ModelCandidate = z.object({
	id: z.string().min(1),
	availability: z.enum(["live", "evaluation-only"]),
});
export type ModelCandidate = z.infer<typeof ModelCandidate>;

const TierModels = z.object({
	cursor: z.array(ModelCandidate).min(1),
	claudeCode: z.array(ModelCandidate).min(1),
	purpose: z.string().min(1),
});

export const ModelCatalogue = z.object({
	version: z.literal(2),
	tiers: z.object({
		frontier: TierModels,
		standard: TierModels,
		fast: TierModels,
	}),
});
export type ModelCatalogue = z.infer<typeof ModelCatalogue>;

export const ModelInventory = z.object({
	version: z.literal(1),
	host: ModelHost,
	recordedAt: z.string().min(1),
	models: z.array(z.string().min(1)),
});
export type ModelInventory = z.infer<typeof ModelInventory>;

export interface ResolvedModel {
	tier: ModelTier;
	host: ModelHost;
	model: string;
	availability: ModelCandidate["availability"];
}

export const CATALOGUE_PATH = join(
	import.meta.dir,
	"..",
	"model-catalogue.json",
);

export async function loadModelCatalogue(
	path = CATALOGUE_PATH,
): Promise<ModelCatalogue> {
	return ModelCatalogue.parse(await Bun.file(path).json());
}

export function catalogueHostModels(
	catalogue: ModelCatalogue,
	tier: ModelTier,
	host: ModelHost,
): ModelCandidate[] {
	return catalogue.tiers[tier][host];
}

export function resolveAvailableModel(
	catalogue: ModelCatalogue,
	tier: ModelTier,
	inventory: ModelInventory,
	options: { allowEvaluationOnly?: boolean } = {},
): ResolvedModel {
	const advertised = new Set(inventory.models);
	const candidates = catalogueHostModels(catalogue, tier, inventory.host);
	const selected = candidates.find(
		(candidate) =>
			advertised.has(candidate.id) &&
			(candidate.availability === "live" ||
				options.allowEvaluationOnly === true),
	);
	if (!selected) {
		const availableCandidates = candidates
			.filter((candidate) => advertised.has(candidate.id))
			.map((candidate) => candidate.id);
		const detail =
			availableCandidates.length > 0
				? `matching models are evaluation-only: ${availableCandidates.join(", ")}`
				: `advertised models do not include: ${candidates.map((candidate) => candidate.id).join(", ")}`;
		throw new Error(
			`no live ${tier} model is available for ${inventory.host}; ${detail}`,
		);
	}
	return {
		tier,
		host: inventory.host,
		model: selected.id,
		availability: selected.availability,
	};
}

if (import.meta.main) {
	try {
		const catalogue = await loadModelCatalogue();
		const [command, tierArg, inventoryFile, flag] = process.argv.slice(2);
		if (!command) {
			console.log(JSON.stringify(catalogue));
		} else if (command === "resolve" && tierArg && inventoryFile) {
			const tier = z.enum(["fast", "standard", "frontier"]).parse(tierArg);
			const inventory = ModelInventory.parse(
				await Bun.file(inventoryFile).json(),
			);
			console.log(
				JSON.stringify(
					resolveAvailableModel(catalogue, tier, inventory, {
						allowEvaluationOnly: flag === "--evaluation",
					}),
				),
			);
		} else {
			console.error(
				"usage: model-catalogue [resolve <fast|standard|frontier> <inventory.json> [--evaluation]]",
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
