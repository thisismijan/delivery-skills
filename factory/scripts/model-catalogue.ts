import { join } from "node:path";
import { z } from "zod";
import type { ModelTier } from "./task-profile";

export const ModelCatalogue = z.object({
	version: z.literal(1),
	tiers: z.object({
		frontier: z.object({
			cursor: z.string().min(1),
			claudeCode: z.string().min(1),
			purpose: z.string().min(1),
		}),
		standard: z.object({
			cursor: z.string().min(1),
			claudeCode: z.string().min(1),
			purpose: z.string().min(1),
		}),
		fast: z.object({
			cursor: z.string().min(1),
			claudeCode: z.string().min(1),
			purpose: z.string().min(1),
		}),
	}),
});
export type ModelCatalogue = z.infer<typeof ModelCatalogue>;

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

export function catalogueHostModel(
	catalogue: ModelCatalogue,
	tier: ModelTier,
	host: "cursor" | "claudeCode",
): string {
	return catalogue.tiers[tier][host];
}

if (import.meta.main) {
	try {
		const catalogue = await loadModelCatalogue();
		console.log(JSON.stringify(catalogue));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
