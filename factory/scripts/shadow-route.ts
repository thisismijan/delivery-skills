import { join } from "node:path";
import { z } from "zod";
import type {
	LiveModel as LiveModelName,
	ModelTier,
	TaskProfileInput,
} from "./task-profile";
import {
	LiveModel,
	TaskProfile,
	TaskProfileInput as TaskProfileInputSchema,
	liveModelToTier,
} from "./task-profile";

const RANK: Record<ModelTier, number> = {
	fast: 0,
	standard: 1,
	frontier: 2,
};

const FAST_WORK = new Set(["search", "classify", "summarise"]);
export const HOLD_OUT_STAGES = new Set([
	"execute",
	"address",
	"review",
	"ship",
]);
export const ALWAYS_FRONTIER_DOMAINS = new Set([
	"auth",
	"migration",
	"concurrency",
	"distributed-state",
]);

export const ShadowDecision = z.object({
	mode: z.literal("shadow"),
	executed: z.literal("current"),
	currentModel: LiveModel,
	currentTier: z.enum(["fast", "standard", "frontier"]),
	shadowTier: z.enum(["fast", "standard", "frontier"]),
	floorApplied: z.boolean(),
	profile: TaskProfile,
});
export type ShadowDecision = z.infer<typeof ShadowDecision>;

export function maxTier(a: ModelTier, b: ModelTier): ModelTier {
	return RANK[a] >= RANK[b] ? a : b;
}

export type FastEligibleFields = Pick<
	TaskProfileInput,
	| "workType"
	| "risk"
	| "ambiguity"
	| "blastRadius"
	| "novelty"
	| "verificationStrength"
>;

export function isFastEligible(profile: FastEligibleFields): boolean {
	return (
		FAST_WORK.has(profile.workType) &&
		profile.risk === "reversible" &&
		profile.ambiguity === "low" &&
		profile.blastRadius === "local" &&
		profile.novelty === "known-pattern" &&
		profile.verificationStrength === "strong"
	);
}

export function proposedTier(profile: TaskProfileInput): ModelTier {
	if (isFastEligible(profile)) return "fast";
	if (
		profile.reasoningDepth === "high" ||
		profile.ambiguity === "high" ||
		profile.novelty === "novel"
	) {
		return "frontier";
	}
	return "standard";
}

export function routingFloor(profile: TaskProfileInput): ModelTier {
	let floor: ModelTier = "fast";
	if (profile.workType === "review" && HOLD_OUT_STAGES.has(profile.stage)) {
		floor = maxTier(floor, "frontier");
	}
	if (profile.workType === "design") floor = maxTier(floor, "standard");
	if (profile.workType === "decompose" && profile.ambiguity === "high") {
		floor = maxTier(floor, "frontier");
	}
	if (profile.domains.some((domain) => ALWAYS_FRONTIER_DOMAINS.has(domain))) {
		floor = maxTier(floor, "frontier");
	}
	if (profile.novelty === "novel" && profile.domains.includes("algorithm")) {
		floor = maxTier(floor, "frontier");
	}
	if (
		profile.verificationStrength === "weak" &&
		profile.blastRadius !== "local"
	) {
		floor = maxTier(floor, "frontier");
	}
	if (profile.risk === "safety-critical") floor = maxTier(floor, "frontier");
	if (profile.workType === "implement" || profile.workType === "write-tests") {
		floor = maxTier(floor, "standard");
	}
	return floor;
}

export function shadowTier(profile: TaskProfileInput): ModelTier {
	return maxTier(proposedTier(profile), routingFloor(profile));
}

export function shadowRoute(
	input: TaskProfileInput,
	currentModel: LiveModelName,
): ShadowDecision {
	const profileInput = TaskProfileInputSchema.parse(input);
	const recommended = shadowTier(profileInput);
	const currentTier = liveModelToTier(currentModel);
	return {
		mode: "shadow",
		executed: "current",
		currentModel,
		currentTier,
		shadowTier: recommended,
		floorApplied:
			RANK[routingFloor(profileInput)] > RANK[proposedTier(profileInput)],
		profile: { ...profileInput, selectedTier: recommended },
	};
}

if (import.meta.main) {
	const profileFile = process.argv[2];
	const currentModelArg = process.argv[3];
	if (!profileFile || !currentModelArg) {
		console.error("usage: shadow-route <profile.json> <sonnet|opus>");
		process.exit(2);
	}
	try {
		const currentModel = LiveModel.parse(currentModelArg);
		const profile = TaskProfileInputSchema.parse(
			await Bun.file(profileFile).json(),
		);
		const decision = shadowRoute(profile, currentModel);
		const out = process.argv[4];
		const payload = `${JSON.stringify(decision, null, 2)}\n`;
		if (out) await Bun.write(join(out), payload);
		console.log(JSON.stringify(decision));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
