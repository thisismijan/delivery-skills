export const LEGACY_GROOM_ROOT = ".ig-spec/grooming";
export const LEGACY_META_FILENAME = ".ig-spec.json";
export const LEGACY_AUDIT_PREFIX = "**ig-spec** ·";

export type DeliveryChangeMeta = {
	workItemKey: string;
	complexitySignal: "low" | "medium" | "high";
	frontierJustification?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLegacyChangeMeta(input: string): DeliveryChangeMeta {
	let raw: unknown;
	try {
		raw = JSON.parse(input);
	} catch {
		throw new Error("legacy change meta is not valid JSON");
	}
	if (!isRecord(raw)) {
		throw new Error("legacy change meta is not an object");
	}
	const jiraKey = typeof raw.jiraKey === "string" ? raw.jiraKey.trim() : "";
	const complexitySignal = raw.complexitySignal;
	if (jiraKey.length === 0) {
		throw new Error("legacy change meta is missing jiraKey");
	}
	if (
		complexitySignal !== "low" &&
		complexitySignal !== "medium" &&
		complexitySignal !== "high"
	) {
		throw new Error("legacy change meta has a bad complexitySignal");
	}
	const opusJustification =
		typeof raw.opusJustification === "string"
			? raw.opusJustification.trim()
			: "";
	return {
		workItemKey: jiraKey,
		complexitySignal,
		...(opusJustification.length > 0
			? { frontierJustification: opusJustification }
			: {}),
	};
}

export function isLegacyAuditComment(body: string): boolean {
	return body.startsWith(LEGACY_AUDIT_PREFIX);
}

export function legacyGroomDir(slug: string): string {
	return `${LEGACY_GROOM_ROOT}/${slug}/`;
}
