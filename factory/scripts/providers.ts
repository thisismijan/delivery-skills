export const PROVIDER_KINDS = [
	"forge",
	"tracker",
	"review",
	"subprocess",
	"subagent",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type ProviderMode = "available" | "absent" | "failed";

export interface ProviderDescriptor {
	kind: ProviderKind;
	mode: ProviderMode;
	invocation?: string;
}

export type ProviderFailureReason =
	| "missing-provider"
	| "provider-failed"
	| "invalid-result";

export interface NormalizedProviderResult<T> {
	ok: boolean;
	provider: ProviderKind;
	value?: T;
	reason?: ProviderFailureReason;
	message?: string;
}

export interface TrackerItem {
	key: string;
}

export interface ForgeChange {
	id: string;
}

export function missingProvider(
	kind: ProviderKind,
): NormalizedProviderResult<never> {
	return {
		ok: false,
		provider: kind,
		reason: "missing-provider",
		message: `The ${kind} provider is not available. Delivery stops at this boundary and preserves completed work.`,
	};
}

function failedProvider(
	kind: ProviderKind,
	message: string,
): NormalizedProviderResult<never> {
	return {
		ok: false,
		provider: kind,
		reason: "provider-failed",
		message,
	};
}

function invalidResult(
	kind: ProviderKind,
	message: string,
): NormalizedProviderResult<never> {
	return {
		ok: false,
		provider: kind,
		reason: "invalid-result",
		message,
	};
}

export function invokeProvider<T>(
	descriptor: ProviderDescriptor,
	probe?: () => { ok: boolean; value?: T | null },
): NormalizedProviderResult<T> {
	if (descriptor.mode === "absent") return missingProvider(descriptor.kind);
	if (descriptor.mode === "failed") {
		return failedProvider(
			descriptor.kind,
			`The ${descriptor.kind} provider failed.`,
		);
	}
	if (typeof probe !== "function") {
		return missingProvider(descriptor.kind);
	}
	const outcome = probe();
	if (!outcome.ok || outcome.value == null) {
		return invalidResult(
			descriptor.kind,
			`The ${descriptor.kind} provider did not return a usable result.`,
		);
	}
	return {
		ok: true,
		provider: descriptor.kind,
		value: outcome.value,
	};
}

export function readTrackerItem(
	descriptor: ProviderDescriptor,
	probe?: () => { ok: boolean; item?: TrackerItem | null },
): NormalizedProviderResult<TrackerItem> {
	if (descriptor.kind !== "tracker") {
		return invalidResult("tracker", "Descriptor is not a tracker provider.");
	}
	return invokeProvider(descriptor, () => {
		const outcome = probe?.() ?? { ok: false, item: null };
		const key = outcome.item?.key?.trim() ?? "";
		if (!outcome.ok || key.length === 0) {
			return { ok: false, value: null };
		}
		return { ok: true, value: { key } };
	});
}

export function readForgeChange(
	descriptor: ProviderDescriptor,
	probe?: () => { ok: boolean; change?: ForgeChange | null },
): NormalizedProviderResult<ForgeChange> {
	if (descriptor.kind !== "forge") {
		return invalidResult("forge", "Descriptor is not a forge provider.");
	}
	return invokeProvider(descriptor, () => {
		const outcome = probe?.() ?? { ok: false, change: null };
		const id = outcome.change?.id?.trim() ?? "";
		if (!outcome.ok || id.length === 0) {
			return { ok: false, value: null };
		}
		return { ok: true, value: { id } };
	});
}
