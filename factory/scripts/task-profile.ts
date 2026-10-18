import { z } from "zod";

export const ModelTier = z.enum(["fast", "standard", "frontier"]);
export type ModelTier = z.infer<typeof ModelTier>;

export const LiveModel = z.enum(["sonnet", "opus"]);
export type LiveModel = z.infer<typeof LiveModel>;

export const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export const SafePathSegment = z
	.string()
	.regex(SAFE_PATH_SEGMENT, "expected a simple file-safe name");

export const TaskProfileInput = z
	.object({
		version: z.literal(1),
		taskId: SafePathSegment,
		stage: z.enum([
			"discover",
			"groom",
			"draft",
			"execute",
			"review",
			"address",
			"ship",
			"verify",
			"retro",
		]),
		workType: z.enum([
			"search",
			"classify",
			"decompose",
			"design",
			"write-tests",
			"implement",
			"review",
			"summarise",
		]),
		reasoningDepth: z.enum(["low", "medium", "high"]),
		ambiguity: z.enum(["low", "medium", "high"]),
		blastRadius: z.enum(["local", "subsystem", "cross-system"]),
		risk: z.enum(["reversible", "material", "safety-critical"]),
		novelty: z.enum(["known-pattern", "adaptation", "novel"]),
		verificationStrength: z.enum(["strong", "partial", "weak"]),
		contextSize: z.enum(["small", "medium", "large"]),
		domains: z.array(
			z.enum([
				"auth",
				"migration",
				"concurrency",
				"distributed-state",
				"public-contract",
				"algorithm",
				"infrastructure",
				"user-interface",
			]),
		),
		reason: z.array(z.string().min(1)).min(1),
		promotionTriggers: z.array(z.string().min(1)).default([]),
	})
	.strict();
export type TaskProfileInput = z.infer<typeof TaskProfileInput>;

export const TaskProfile = TaskProfileInput.extend({
	selectedTier: ModelTier,
});
export type TaskProfile = z.infer<typeof TaskProfile>;

export function liveModelToTier(model: LiveModel): ModelTier {
	return model === "opus" ? "frontier" : "standard";
}

export function parseTaskProfileInput(input: unknown): TaskProfileInput {
	return TaskProfileInput.parse(input);
}

if (import.meta.main) {
	const file = process.argv[2];
	if (!file) {
		console.error("usage: task-profile <profile.json>");
		process.exit(2);
	}
	try {
		const profile = parseTaskProfileInput(await Bun.file(file).json());
		console.log(JSON.stringify(profile));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
