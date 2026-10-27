import { join } from "node:path";
import { z } from "zod";
import type { ModelTier } from "./task-profile";

export const ModelCandidate = z.object({
	id: z.string().min(1),
	availability: z.enum(["live", "evaluation-only"]),
	aliases: z.array(z.string().min(1)).default([]),
});
export type ModelCandidate = z.infer<typeof ModelCandidate>;

const TierModels = z.object({
	candidates: z.array(ModelCandidate).min(1),
	purpose: z.string().min(1),
});

export const ModelCatalogue = z.object({
	version: z.literal(3),
	tiers: z.object({
		frontier: TierModels,
		standard: TierModels,
		fast: TierModels,
	}),
});
export type ModelCatalogue = z.infer<typeof ModelCatalogue>;

export const ModelInventory = z.object({
	version: z.literal(1),
	recordedAt: z.string().min(1),
	models: z.array(z.string().min(1)),
	host: z.string().min(1).optional(),
});
export type ModelInventory = z.infer<typeof ModelInventory>;

export interface ResolvedModel {
	tier: ModelTier;
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

export function catalogueModels(
	catalogue: ModelCatalogue,
	tier: ModelTier,
): ModelCandidate[] {
	return catalogue.tiers[tier].candidates;
}

export function fastCatalogueCandidateIds(catalogue: ModelCatalogue): string[] {
	return catalogueModels(catalogue, "fast").map((candidate) => candidate.id);
}

export function requireFastCatalogueCandidate(
	catalogue: ModelCatalogue,
	candidateModel: string,
): string {
	const ids = fastCatalogueCandidateIds(catalogue);
	if (!ids.includes(candidateModel)) {
		throw new Error(
			`${candidateModel} is not a fast catalogue model; fast candidates are: ${ids.join(", ")}`,
		);
	}
	return candidateModel;
}

export async function writeModelCatalogue(
	catalogue: ModelCatalogue,
	path = CATALOGUE_PATH,
): Promise<void> {
	await Bun.write(path, `${JSON.stringify(catalogue, null, "\t")}\n`);
}

export function registerFastCatalogueCandidate(
	catalogue: ModelCatalogue,
	candidateModel: string,
): ModelCatalogue {
	const next = structuredClone(catalogue);
	for (const tier of ["frontier", "standard", "fast"] as const) {
		if (
			next.tiers[tier].candidates.some((item) => item.id === candidateModel)
		) {
			if (tier === "fast") return next;
			throw new Error(
				`${candidateModel} is already a ${tier} model; not registering as fast`,
			);
		}
	}
	next.tiers.fast.candidates.push({
		id: candidateModel,
		availability: "evaluation-only",
	});
	return next;
}

export function resolveAvailableModel(
	catalogue: ModelCatalogue,
	tier: ModelTier,
	inventory: ModelInventory,
	options: { allowEvaluationOnly?: boolean } = {},
): ResolvedModel {
	const advertised = inventory.models;
	const advertisedSet = new Set(advertised);
	const candidates = catalogueModels(catalogue, tier);
	const selected = candidates
		.map((candidate) => {
			const hostId = advertised.find(
				(model) => model === candidate.id || candidate.aliases.includes(model),
			);
			return hostId ? { candidate, hostId } : undefined;
		})
		.find(
			(
				match,
			): match is {
				candidate: ModelCandidate;
				hostId: string;
			} =>
				match !== undefined &&
				(match.candidate.availability === "live" ||
					options.allowEvaluationOnly === true),
		);
	if (!selected) {
		const availableCandidates = candidates
			.filter(
				(candidate) =>
					advertisedSet.has(candidate.id) ||
					candidate.aliases.some((alias) => advertisedSet.has(alias)),
			)
			.map((candidate) => candidate.id);
		const detail =
			availableCandidates.length > 0
				? `matching models are evaluation-only: ${availableCandidates.join(", ")}`
				: `advertised models do not include: ${candidates.map((candidate) => candidate.id).join(", ")}`;
		throw new Error(`no live ${tier} model is available; ${detail}`);
	}
	return {
		tier,
		model: selected.hostId,
		availability: selected.candidate.availability,
	};
}

if (import.meta.main) {
	try {
		const [command, ...rest] = process.argv.slice(2);
		if (!command) {
			console.log(JSON.stringify(await loadModelCatalogue()));
		} else if (command === "resolve" && rest[0] && rest[1]) {
			const [tierArg, inventoryFile, flag] = rest;
			const catalogue = await loadModelCatalogue();
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
		} else if (command === "register-fast" && rest[0]) {
			const [candidateModel, cataloguePath] = rest;
			const path = cataloguePath ?? CATALOGUE_PATH;
			const catalogue = await loadModelCatalogue(path);
			const next = registerFastCatalogueCandidate(catalogue, candidateModel);
			await writeModelCatalogue(next, path);
			console.log(
				JSON.stringify({
					id: candidateModel,
					availability: next.tiers.fast.candidates.find(
						(item) => item.id === candidateModel,
					)?.availability,
				}),
			);
		} else {
			console.error(
				"usage: model-catalogue [resolve <fast|standard|frontier> <inventory.json> [--evaluation] | register-fast <id> [catalogue.json]]",
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
