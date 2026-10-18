import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

export const ADAPTER_CAPABILITY_IDS = [
	"process.run",
	"agent.dispatch",
	"model.inventory",
	"forge.change",
	"tracker.item",
	"review.publish",
	"mutation.guard",
] as const;

export type AdapterCapabilityId = (typeof ADAPTER_CAPABILITY_IDS)[number];

const CAPABILITY_ID_SET = new Set<string>(ADAPTER_CAPABILITY_IDS);
const MODES = new Set(["native", "provider", "unenforced", "unavailable"]);

export interface AdapterCapability {
	id: AdapterCapabilityId;
	available: boolean;
	mode: string;
	invocation?: string;
}

export interface AdapterManifest {
	name: string;
	version: number;
	capabilities: AdapterCapability[];
}

export interface GeneratedRuntimeManifest {
	version: 1;
	capabilities: Record<
		string,
		{
			available: boolean;
			mode: "native" | "adapter" | "unavailable";
			invocation?: string;
			enforcement?: "enforced" | "unenforced";
		}
	>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAdapterManifest(
	raw: unknown,
	dirName: string,
): string[] {
	const errors: string[] = [];
	if (!isRecord(raw)) {
		return ["manifest must be an object"];
	}
	if (raw.name !== dirName) {
		errors.push(`name must match directory '${dirName}'`);
	}
	if (raw.version !== 1) {
		errors.push("version must be 1");
	}
	if (!Array.isArray(raw.capabilities)) {
		errors.push("capabilities must be an array");
		return errors;
	}
	const seen = new Set<string>();
	for (const [index, entry] of raw.capabilities.entries()) {
		if (!isRecord(entry)) {
			errors.push(`capabilities[${index}] must be an object`);
			continue;
		}
		if (typeof entry.id !== "string" || !CAPABILITY_ID_SET.has(entry.id)) {
			errors.push(`capabilities[${index}].id is not a portable capability`);
		} else if (seen.has(entry.id)) {
			errors.push(`capability '${entry.id}' is duplicated`);
		} else {
			seen.add(entry.id);
		}
		if (typeof entry.available !== "boolean") {
			errors.push(`capabilities[${index}].available must be boolean`);
		}
		if (typeof entry.mode !== "string" || !MODES.has(entry.mode)) {
			errors.push(`capabilities[${index}].mode is not a known mode`);
		}
		if (
			entry.invocation !== undefined &&
			typeof entry.invocation !== "string"
		) {
			errors.push(`capabilities[${index}].invocation must be a string`);
		}
	}
	for (const id of ADAPTER_CAPABILITY_IDS) {
		if (!seen.has(id)) {
			errors.push(`missing capability '${id}'`);
		}
	}
	return errors;
}

export function adapterRuntimeManifest(
	raw: unknown,
	dirName: string,
	options: { mutationGuardVerified?: boolean } = {},
): GeneratedRuntimeManifest {
	const errors = validateAdapterManifest(raw, dirName);
	if (errors.length > 0) throw new Error(errors.join("; "));
	const manifest = raw as AdapterManifest;
	const capabilities: GeneratedRuntimeManifest["capabilities"] = {};
	for (const capability of manifest.capabilities) {
		const available = capability.available;
		const mode =
			!available || capability.mode === "unavailable"
				? "unavailable"
				: capability.mode === "provider"
					? "adapter"
					: "native";
		capabilities[capability.id] = {
			available,
			mode,
			...(available
				? {
						invocation:
							capability.invocation ??
							`adapter:${manifest.name}:${capability.id}`,
					}
				: {}),
			...(capability.id === "mutation.guard"
				? {
						enforcement:
							available &&
							capability.mode !== "unenforced" &&
							options.mutationGuardVerified
								? ("enforced" as const)
								: ("unenforced" as const),
					}
				: {}),
		};
	}
	return { version: 1, capabilities };
}

if (import.meta.main) {
	const command = process.argv[2];
	const path = process.argv[3];
	if (command !== "runtime" || !path) {
		console.error("usage: adapter-contract.ts runtime <adapter.json>");
		process.exit(2);
	}
	const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
	const evidencePath = process.argv[4];
	const runtime = adapterRuntimeManifest(raw, basename(dirname(path)), {
		mutationGuardVerified:
			evidencePath !== undefined &&
			readFileSync(evidencePath, "utf8").trim() === "verified",
	});
	process.stdout.write(`${JSON.stringify(runtime, null, 2)}\n`);
}
