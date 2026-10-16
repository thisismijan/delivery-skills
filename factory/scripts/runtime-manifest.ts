import { z } from "zod";

export const RUNTIME_MANIFEST_VERSION = 1 as const;

export const CAPABILITY_IDS = [
	"process.run",
	"agent.dispatch",
	"model.inventory",
	"forge.change",
	"tracker.item",
	"review.publish",
	"mutation.guard",
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const CapabilityId = z.enum(CAPABILITY_IDS);

export const CapabilityMode = z.enum(["native", "adapter", "unavailable"]);
export type CapabilityMode = z.infer<typeof CapabilityMode>;

export const MutationEnforcement = z.enum([
	"enforced",
	"unenforced",
	"unknown",
]);
export type MutationEnforcement = z.infer<typeof MutationEnforcement>;

export const CapabilityDescriptor = z
	.object({
		available: z.boolean(),
		mode: CapabilityMode,
		invocation: z.string().min(1).optional(),
		enforcement: MutationEnforcement.optional(),
		models: z.array(z.string().min(1)).optional(),
	})
	.strict()
	.superRefine((descriptor, ctx) => {
		if (
			descriptor.available &&
			(descriptor.invocation?.trim().length ?? 0) === 0
		) {
			ctx.addIssue({
				code: "custom",
				path: ["invocation"],
				message: "an available capability needs an invocation reference",
			});
		}
	});
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptor>;

export const RuntimeManifest = z
	.object({
		version: z.literal(RUNTIME_MANIFEST_VERSION),
		capabilities: z.record(CapabilityId, CapabilityDescriptor),
	})
	.strict();
export type RuntimeManifest = z.infer<typeof RuntimeManifest>;

export interface NormalizedCapabilityResult {
	capability: CapabilityId;
	ok: boolean;
	reason?: string;
	invocation?: string;
}

export interface MissingCapability {
	capability: CapabilityId;
	remedy: string;
}

export const MUTATING_STAGES = new Set([
	"draft",
	"execute",
	"address-comments",
	"archive",
	"improve-apply",
	"improve-rollback",
	"auto",
]);

export const READ_ONLY_STAGES = new Set([
	"discover",
	"triage",
	"groom",
	"review",
	"ship",
	"verify",
	"retro",
	"improve",
	"status",
	"help",
]);

const MISSING_REMEDIES: Record<CapabilityId, string> = {
	"process.run":
		"Configure a runtime that can run subprocesses, then advertise process.run in the runtime manifest.",
	"agent.dispatch":
		"Configure a runtime that can dispatch subagents, then advertise agent.dispatch in the runtime manifest.",
	"model.inventory":
		"Record the models this runtime advertises, then advertise model.inventory in the runtime manifest.",
	"forge.change":
		"Install a forge adapter or keep work local, then advertise forge.change in the runtime manifest if merge-request operations are required.",
	"tracker.item":
		"Install a tracker adapter or use local work items, then advertise tracker.item in the runtime manifest if issue operations are required.",
	"review.publish":
		"Install a review adapter, then advertise review.publish in the runtime manifest if published review notes are required.",
	"mutation.guard":
		"Configure an enforceable mutation boundary, then advertise mutation.guard with enforced mode in the runtime manifest.",
};

export function parseRuntimeManifest(input: unknown): RuntimeManifest {
	return RuntimeManifest.parse(input);
}

export async function loadRuntimeManifest(
	path: string,
): Promise<RuntimeManifest> {
	return parseRuntimeManifest(await Bun.file(path).json());
}

export function lookupCapability(
	runtime: RuntimeManifest,
	id: CapabilityId,
): CapabilityDescriptor | undefined {
	return runtime.capabilities[id];
}

export function missingCapability(id: CapabilityId): MissingCapability {
	return { capability: id, remedy: MISSING_REMEDIES[id] };
}

export function capabilitySatisfied(
	runtime: RuntimeManifest,
	id: CapabilityId,
): boolean {
	const descriptor = lookupCapability(runtime, id);
	if (!descriptor?.available) return false;
	if (id === "mutation.guard") return descriptor.enforcement === "enforced";
	return true;
}

export function capabilityResult(
	runtime: RuntimeManifest,
	id: CapabilityId,
): NormalizedCapabilityResult {
	const descriptor = lookupCapability(runtime, id);
	if (!capabilitySatisfied(runtime, id)) {
		return {
			capability: id,
			ok: false,
			reason: missingCapability(id).remedy,
			invocation: descriptor?.invocation,
		};
	}
	return {
		capability: id,
		ok: true,
		invocation: descriptor?.invocation,
	};
}

export function requiredCapabilitiesForStage(stage: string): CapabilityId[] {
	if (MUTATING_STAGES.has(stage)) return ["mutation.guard"];
	return [];
}

export function missingCapabilitiesForStage(
	stage: string,
	runtime: RuntimeManifest,
): MissingCapability[] {
	return requiredCapabilitiesForStage(stage)
		.filter((id) => !capabilitySatisfied(runtime, id))
		.map(missingCapability);
}

export function advertisedModels(
	runtime: RuntimeManifest,
	inventory?: { models: string[] },
): string[] {
	if (inventory?.models) return [...inventory.models];
	const descriptor = lookupCapability(runtime, "model.inventory");
	if (!descriptor?.available) return [];
	return [...(descriptor.models ?? [])];
}
