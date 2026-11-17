import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type LegacyKind = "candidate" | "version";

export type LegacyEntry = {
	kind: LegacyKind;
	name: string;
	from: string;
	to: string;
};

export type LegacyReport = { entries: LegacyEntry[] };

export function resolveStateRoot(
	env: { DELIVERY_STATE_ROOT?: string },
	targetRepo: string,
): string {
	const override = env.DELIVERY_STATE_ROOT?.trim();
	if (override) return override;
	return join(targetRepo, ".delivery");
}

export function improvementPaths(stateRoot: string): {
	candidates: string;
	versions: string;
} {
	return {
		candidates: join(stateRoot, "candidates"),
		versions: join(stateRoot, "versions"),
	};
}

async function listEntries(dir: string): Promise<string[]> {
	try {
		return (await readdir(dir)).sort();
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export async function detectLegacyState(
	skillDir: string,
	stateRoot: string,
): Promise<LegacyReport> {
	const dest = improvementPaths(stateRoot);
	const entries: LegacyEntry[] = [];
	for (const name of await listEntries(join(skillDir, "candidates"))) {
		entries.push({
			kind: "candidate",
			name,
			from: join(skillDir, "candidates", name),
			to: join(dest.candidates, name),
		});
	}
	for (const name of await listEntries(join(skillDir, "versions"))) {
		entries.push({
			kind: "version",
			name,
			from: join(skillDir, "versions", name),
			to: join(dest.versions, name),
		});
	}
	return { entries };
}
