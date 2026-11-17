import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { plannedPaths } from "./planned-paths";
import { NON_CODE_PREFIXES } from "./review-fanout";
import { safeGit } from "./safe-git";
import { type ZoneHit, loadZones, zoneHits, zonesRoot } from "./zone-map";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const RISK_ZONES_CHECK_INVOCATION = "scripts/risk-zones.ts check <repoRoot> <changeDir> [ledger]";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const RISK_ZONES_DIFF_INVOCATION = "scripts/risk-zones.ts check-diff <repoRoot> <changeDir> <base> <head> [ledger]";

export function redZoneApproved(ledger: string, changeName: string): boolean {
	const lines = ledger.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() === "## Approvals");
	if (start < 0) return false;
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s/.test(line));
	const escaped = changeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const wanted = new RegExp(`\\bred-zone ${escaped}(\\s|$)`);
	return (end < 0 ? rest : rest.slice(0, end)).some((line) =>
		wanted.test(line),
	);
}

// The run ledger beside an auto worker's journal:
// <state-root>/workers/<run-id>/<key>.md -> <state-root>/runs/<run-id>.md
export function workerRunLedger(journal: string | undefined): string | null {
	if (!journal || !isAbsolute(journal)) return null;
	const runDir = dirname(journal);
	return join(dirname(dirname(runDir)), "runs", `${basename(runDir)}.md`);
}

export interface ZoneCheck {
	map: boolean;
	planned: string[];
	red: ZoneHit[];
	yellow: ZoneHit[];
	approved: boolean;
	needsApproval: boolean;
	reasons: string[];
}

export async function checkChangeZones(options: {
	repoRoot: string;
	changeDir: string;
	ledger?: string | null;
}): Promise<ZoneCheck> {
	const zones = loadZones(zonesRoot(options.repoRoot));
	const changeName = basename(resolve(options.changeDir));
	if (zones === null) {
		return {
			map: false,
			planned: [],
			red: [],
			yellow: [],
			approved: false,
			needsApproval: false,
			reasons: [],
		};
	}
	const { planned, tracked } = await plannedPaths(
		options.repoRoot,
		options.changeDir,
	);
	const hits = zoneHits([...new Set([...planned, ...tracked])].sort(), zones);
	const reasons: string[] = [];
	if (planned.length === 0 && zones.some((zone) => zone.level === "red")) {
		reasons.push(
			"the change names no planned paths, so it cannot be shown to stay out of a red zone",
		);
	}
	if (hits.red.length > 0) {
		reasons.push(
			`the change plans to touch red zones: ${[...new Set(hits.red.map((hit) => hit.pattern))].join(", ")}`,
		);
	}
	const ledgerPath = options.ledger ?? null;
	const approved =
		reasons.length > 0 &&
		ledgerPath !== null &&
		existsSync(ledgerPath) &&
		redZoneApproved(readFileSync(ledgerPath, "utf8"), changeName);
	return {
		map: true,
		planned,
		red: hits.red,
		yellow: hits.yellow,
		approved,
		needsApproval: reasons.length > 0 && !approved,
		reasons,
	};
}

export interface DiffZoneCheck {
	map: boolean;
	changed: string[];
	red: ZoneHit[];
	yellow: ZoneHit[];
	approved: boolean;
	needsApproval: boolean;
	reasons: string[];
}

// The build's real diff, so a change that strays into a red zone its plan did
// not name still stops before its change request opens.
export function checkDiffZones(options: {
	repoRoot: string;
	changeDir: string;
	base: string;
	head: string;
	ledger?: string | null;
}): DiffZoneCheck {
	const zones = loadZones(zonesRoot(options.repoRoot));
	if (zones === null) {
		return {
			map: false,
			changed: [],
			red: [],
			yellow: [],
			approved: false,
			needsApproval: false,
			reasons: [],
		};
	}
	const diff = safeGit(options.repoRoot, [
		"-c",
		"core.quotepath=false",
		"diff",
		"--name-only",
		"-z",
		"--no-renames",
		`${options.base}...${options.head}`,
	]);
	if (diff.code !== 0) throw new Error(diff.stderr.trim() || "git diff failed");
	const changed = diff.stdout
		.split("\0")
		.filter(
			(path) =>
				path !== "" &&
				!NON_CODE_PREFIXES.some((prefix) => path.startsWith(prefix)),
		)
		.sort();
	const hits = zoneHits(changed, zones);
	const reasons =
		hits.red.length > 0
			? [
					`the change touches red zones: ${[...new Set(hits.red.map((hit) => hit.pattern))].join(", ")}`,
				]
			: [];
	const ledgerPath = options.ledger ?? null;
	const approved =
		reasons.length > 0 &&
		ledgerPath !== null &&
		existsSync(ledgerPath) &&
		redZoneApproved(
			readFileSync(ledgerPath, "utf8"),
			basename(resolve(options.changeDir)),
		);
	return {
		map: true,
		changed,
		red: hits.red,
		yellow: hits.yellow,
		approved,
		needsApproval: reasons.length > 0 && !approved,
		reasons,
	};
}

if (import.meta.main) {
	const [command, repoRoot, changeDir, ...rest] = process.argv.slice(2);
	const ledgerFor = (given: string | undefined) =>
		given ?? workerRunLedger(process.env.DELIVERY_WORKER_JOURNAL);
	const diffArgs = command === "check-diff" && rest[0] && rest[1];
	if (!repoRoot || !changeDir || !(command === "check" || diffArgs)) {
		console.error(
			`usage: ${RISK_ZONES_CHECK_INVOCATION} | ${RISK_ZONES_DIFF_INVOCATION}`,
		);
		process.exit(2);
	}
	try {
		const result = diffArgs
			? checkDiffZones({
					repoRoot,
					changeDir,
					base: rest[0] as string,
					head: rest[1] as string,
					ledger: ledgerFor(rest[2]),
				})
			: await checkChangeZones({
					repoRoot,
					changeDir,
					ledger: ledgerFor(rest[0]),
				});
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.needsApproval ? 3 : 0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
