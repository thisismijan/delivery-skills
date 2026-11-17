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
		provider: z
			.string()
			.regex(/^[a-z0-9][a-z0-9-]*$/)
			.optional(),
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
	.strict()
	.superRefine((manifest, ctx) => {
		const remoteIdentity: Array<{
			id: CapabilityId;
			message: string;
		}> = [
			{
				id: "tracker.item",
				message: "an available remote work-item capability needs a provider id",
			},
			{
				id: "forge.change",
				message: "an available forge capability needs a provider id",
			},
			{
				id: "review.publish",
				message:
					"an available review-publication capability needs a provider id",
			},
		];
		for (const { id, message } of remoteIdentity) {
			const descriptor = manifest.capabilities[id];
			if (descriptor?.available && !descriptor.provider) {
				ctx.addIssue({
					code: "custom",
					path: ["capabilities", id, "provider"],
					message,
				});
			}
		}
	});
export type RuntimeManifest = z.infer<typeof RuntimeManifest>;

export function defaultRuntimeManifest(
	processAvailable = false,
): RuntimeManifest {
	const capabilities = Object.fromEntries(
		CAPABILITY_IDS.map((id) => [
			id,
			id === "process.run" && processAvailable
				? {
						available: true,
						mode: "native" as const,
						invocation: "bun",
					}
				: {
						available: false,
						mode: "unavailable" as const,
						...(id === "mutation.guard"
							? { enforcement: "unenforced" as const }
							: {}),
					},
		]),
	);
	return RuntimeManifest.parse({
		version: RUNTIME_MANIFEST_VERSION,
		capabilities,
	});
}

export function overlayRuntimeManifest(
	base: RuntimeManifest,
	overlay: RuntimeManifest,
): RuntimeManifest {
	return RuntimeManifest.parse({
		version: RUNTIME_MANIFEST_VERSION,
		capabilities: {
			...base.capabilities,
			...overlay.capabilities,
		},
	});
}

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
	"init",
	"draft",
	"execute",
	"address-comments",
	"land",
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
		"Install a forge adapter, record session integration tools, or keep work local, then advertise forge.change in the runtime manifest if merge-request operations are required.",
	"tracker.item":
		"Install a tracker adapter, record session integration tools, or use local work items, then advertise tracker.item in the runtime manifest if issue operations are required.",
	"review.publish":
		"Install a review adapter or record session integration tools, then advertise review.publish in the runtime manifest if published review notes are required.",
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
	if (stage === "auto") return ["mutation.guard", "agent.dispatch"];
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

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	if (command === "default") {
		const processAvailable = args.includes("--process");
		process.stdout.write(
			`${JSON.stringify(defaultRuntimeManifest(processAvailable), null, 2)}\n`,
		);
	} else if (command === "overlay" && args[0] && args[1]) {
		const base = await loadRuntimeManifest(args[0]);
		const overlay = await loadRuntimeManifest(args[1]);
		process.stdout.write(
			`${JSON.stringify(overlayRuntimeManifest(base, overlay), null, 2)}\n`,
		);
	} else {
		console.error(
			"usage: runtime-manifest.ts default [--process] | overlay <base.json> <overlay.json>",
		);
		process.exit(2);
	}
}
