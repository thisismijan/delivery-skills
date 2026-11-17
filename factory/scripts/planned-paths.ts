import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readChangeMeta } from "./change-meta";
import { impactPaths } from "./plan-drift";
import { safeGit } from "./safe-git";

export interface PlannedPaths {
	// The paths the proposal's Impact section and the recorded affected areas name.
	planned: string[];
	// The tracked files at or under those paths.
	tracked: string[];
}

export async function plannedPaths(
	repoRoot: string,
	changeDir: string,
): Promise<PlannedPaths> {
	const proposal = join(changeDir, "proposal.md");
	const named = new Set(
		existsSync(proposal) ? impactPaths(readFileSync(proposal, "utf8")) : [],
	);
	try {
		for (const area of (await readChangeMeta(changeDir)).affectedAreas ?? []) {
			named.add(area.replace(/\/+$/, ""));
		}
	} catch {
		// A change without metadata is planned by its proposal alone.
	}
	const planned = [...named].sort();
	const tracked =
		planned.length === 0
			? []
			: safeGit(repoRoot, ["ls-files", "-z", "--", ...planned])
					.stdout.split("\0")
					.filter(Boolean)
					.sort();
	return { planned, tracked };
}
