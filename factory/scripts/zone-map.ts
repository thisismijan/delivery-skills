import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { safeGit } from "./safe-git";

export const ZONES_PATH = ".delivery/zones";

export type ZoneLevel = "red" | "yellow";

export interface Zone {
	level: ZoneLevel;
	pattern: string;
}

export interface ZoneHit {
	path: string;
	pattern: string;
}

export interface ZoneHits {
	red: ZoneHit[];
	yellow: ZoneHit[];
}

const GLOB_CHARS = /[*?[{]/;

// One zone per line: `red <path or glob>` or `yellow <path or glob>`. Blank
// lines and lines starting with # are ignored. Anything else fails closed.
export function parseZones(text: string): Zone[] {
	const zones: Zone[] = [];
	text.split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) return;
		const match = line.match(/^(red|yellow)\s+(\S+)$/);
		const pattern = match?.[2];
		if (
			!match ||
			!pattern ||
			isAbsolute(pattern) ||
			pattern.split("/").includes("..")
		) {
			throw new Error(
				`${ZONES_PATH} line ${index + 1} is not "red <path>" or "yellow <path>" below the repository: ${line}`,
			);
		}
		zones.push({ level: match[1] as ZoneLevel, pattern });
	});
	return zones;
}

export function inZone(path: string, pattern: string): boolean {
	if (GLOB_CHARS.test(pattern)) return new Bun.Glob(pattern).match(path);
	const prefix = pattern.replace(/\/+$/, "");
	return path === prefix || path.startsWith(`${prefix}/`);
}

// A path in both a red and a yellow zone counts as red only.
export function zoneHits(paths: string[], zones: Zone[]): ZoneHits {
	const hits: ZoneHits = { red: [], yellow: [] };
	for (const path of paths) {
		for (const level of ["red", "yellow"] as const) {
			const zone = zones.find(
				(candidate) =>
					candidate.level === level && inZone(path, candidate.pattern),
			);
			if (!zone) continue;
			hits[level].push({ path, pattern: zone.pattern });
			break;
		}
	}
	return hits;
}

// The map belongs to the main checkout, so a worker's worktree reads the same
// map as the coordinator.
export function zonesRoot(cwd: string): string {
	const common = safeGit(cwd, [
		"rev-parse",
		"--path-format=absolute",
		"--git-common-dir",
	]);
	if (common.code !== 0) return resolve(cwd);
	return dirname(common.stdout.trim());
}

export function loadZones(root: string): Zone[] | null {
	const path = join(root, ZONES_PATH);
	if (!existsSync(path)) return null;
	return parseZones(readFileSync(path, "utf8"));
}
