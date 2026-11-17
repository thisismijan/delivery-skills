import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { findChange } from "./find-change";
import { loadObservations } from "./record-routing";
import { loadSkips } from "./record-skip";
import type { RoutingObservation } from "./routing-observation";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const COST_REVIEW_INVOCATION = "scripts/cost-review.ts <repoRoot> <ledger.md>";

export const REVIEW_ROUNDS_FLAG = 3;
export const GREEN_ATTEMPTS_FLAG = 3;
export const PACKET_CHARS_FLAG = 60_000;
export const SHARE_FLAG = 0.5;

export interface Measured {
	tasks: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number | null;
	cheaperSuggested: number;
}

export interface KeyCost {
	key: string;
	change: string | null;
	mr: string | null;
	reviewRounds: number;
	lensRuns: number;
	focusedPasses: number;
	greenAttempts: number;
	largestPacket: { path: string; chars: number } | null;
	workersAvoided: number;
	measured: Measured | null;
}

export interface CostFinding {
	key: string | null;
	driver:
		| "review-rounds"
		| "repairs"
		| "packet-size"
		| "measured-share"
		| "cheaper-suggested"
		| "unmeasured";
	evidence: string;
	consider: string;
}

export interface CostReview {
	keys: KeyCost[];
	measuredTotal: Measured | null;
	byWork: { work: string; tokens: number; share: number }[];
	findings: CostFinding[];
}

// The Keys rows of a ledger: key and the change ref in the MR column, if any.
export function ledgerKeys(
	ledger: string,
): { key: string; mr: string | null }[] {
	const rows: { key: string; mr: string | null }[] = [];
	let inKeys = false;
	for (const line of ledger.split(/\r?\n/)) {
		if (/^## /.test(line)) inKeys = line.trim() === "## Keys";
		if (!inKeys || !line.trim().startsWith("|")) continue;
		const cells = line.split("|").map((cell) => cell.trim());
		const key = cells[1] ?? "";
		if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) continue;
		const mr = (cells[4] ?? "").match(/!?(\d+)/)?.[1] ?? null;
		rows.push({ key, mr });
	}
	return rows;
}

function listDirs(path: string): string[] {
	if (!existsSync(path)) return [];
	return readdirSync(path).filter((name) =>
		statSync(join(path, name)).isDirectory(),
	);
}

function listFiles(path: string): string[] {
	if (!existsSync(path)) return [];
	return readdirSync(path).filter((name) =>
		statSync(join(path, name)).isFile(),
	);
}

function changeFor(repoRoot: string, key: string): string | null {
	const changes = join(repoRoot, "openspec", "changes");
	const names = [
		...listDirs(changes).filter((name) => name !== "archive"),
		...listDirs(join(changes, "archive")).map((name) =>
			name.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
		),
	];
	const found = findChange(key, [...new Set(names)]);
	return found.match;
}

function largestPacket(dirs: string[]): { path: string; chars: number } | null {
	let best: { path: string; chars: number } | null = null;
	for (const dir of dirs) {
		for (const name of listFiles(dir).filter((file) =>
			file.endsWith("packet.md"),
		)) {
			const path = join(dir, name);
			const chars = readFileSync(path, "utf8").length;
			if (best === null || chars > best.chars) best = { path, chars };
		}
	}
	return best;
}

function lensCount(headDir: string): number {
	const coverage = join(headDir, "lens-coverage.json");
	if (!existsSync(coverage)) return 0;
	try {
		const parsed = JSON.parse(readFileSync(coverage, "utf8")) as {
			lenses?: unknown;
		};
		return Array.isArray(parsed.lenses) ? parsed.lenses.length : 0;
	} catch {
		return 0;
	}
}

function measure(observations: RoutingObservation[]): Measured | null {
	const withTokens = observations.filter(
		(item) =>
			item.context.usage.inputTokens !== undefined ||
			item.context.usage.outputTokens !== undefined,
	);
	if (withTokens.length === 0) return null;
	const costs = withTokens
		.map((item) => item.context.usage.costUsd)
		.filter((cost): cost is number => cost !== undefined);
	return {
		tasks: withTokens.length,
		inputTokens: withTokens.reduce(
			(sum, item) => sum + (item.context.usage.inputTokens ?? 0),
			0,
		),
		outputTokens: withTokens.reduce(
			(sum, item) => sum + (item.context.usage.outputTokens ?? 0),
			0,
		),
		costUsd:
			costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0),
		cheaperSuggested: withTokens.filter(
			(item) =>
				item.shadowTier !== item.currentTier &&
				!item.floorApplied &&
				rank(item.shadowTier) < rank(item.currentTier),
		).length,
	};
}

function rank(tier: "fast" | "standard" | "frontier"): number {
	return { fast: 0, standard: 1, frontier: 2 }[tier];
}

function tokens(item: RoutingObservation): number {
	return (
		(item.context.usage.inputTokens ?? 0) +
		(item.context.usage.outputTokens ?? 0)
	);
}

export function reviewCosts(input: {
	repoRoot: string;
	ledger: string;
	observations: RoutingObservation[];
	skipsByRun: Map<string, number>;
}): CostReview {
	const keys: KeyCost[] = [];
	const scoped: RoutingObservation[] = [];
	for (const { key, mr } of ledgerKeys(input.ledger)) {
		const change = changeFor(input.repoRoot, key);
		const runs = new Set<string>([
			...(change ? [change] : []),
			...(mr ? [`review-mr-${mr}`, `mr-${mr}`] : []),
		]);
		const mine = input.observations.filter((item) => runs.has(item.runId));
		scoped.push(...mine);
		const reviewRoot = mr ? join(input.repoRoot, ".review", `mr-${mr}`) : null;
		const heads = reviewRoot ? listDirs(reviewRoot) : [];
		const executeDir = change ? join(input.repoRoot, ".review", change) : null;
		keys.push({
			key,
			change,
			mr,
			reviewRounds: heads.length,
			lensRuns: heads.reduce(
				(sum, head) => sum + lensCount(join(reviewRoot as string, head)),
				0,
			),
			focusedPasses: heads.reduce(
				(sum, head) =>
					sum +
					listFiles(join(reviewRoot as string, head)).filter((name) =>
						/^focused-pass-\d+\.md$/.test(name),
					).length,
				0,
			),
			greenAttempts: executeDir
				? listFiles(executeDir).filter((name) =>
						/^green-gate-.*\.json$/.test(name),
					).length
				: 0,
			largestPacket: largestPacket([
				...(executeDir ? [executeDir] : []),
				...heads.map((head) => join(reviewRoot as string, head)),
			]),
			workersAvoided: [...runs].reduce(
				(sum, run) => sum + (input.skipsByRun.get(run) ?? 0),
				0,
			),
			measured: measure(mine),
		});
	}
	const measuredTotal = measure(scoped);
	const totalTokens = scoped.reduce((sum, item) => sum + tokens(item), 0);
	const workTotals = new Map<string, number>();
	for (const item of scoped) {
		const work = `${item.profile.stage} ${item.profile.workType} on the ${item.currentTier} tier`;
		workTotals.set(work, (workTotals.get(work) ?? 0) + tokens(item));
	}
	const byWork = [...workTotals.entries()]
		.filter(([, count]) => count > 0)
		.map(([work, count]) => ({
			work,
			tokens: count,
			share: totalTokens === 0 ? 0 : count / totalTokens,
		}))
		.sort((a, b) => b.tokens - a.tokens);
	return {
		keys,
		measuredTotal,
		byWork,
		findings: findingsFor(keys, measuredTotal, byWork),
	};
}

export function findingsFor(
	keys: KeyCost[],
	measuredTotal: Measured | null,
	byWork: CostReview["byWork"],
): CostFinding[] {
	const findings: CostFinding[] = [];
	for (const item of keys) {
		if (item.reviewRounds >= REVIEW_ROUNDS_FLAG) {
			findings.push({
				key: item.key,
				driver: "review-rounds",
				evidence: `${item.reviewRounds} review rounds, ${item.lensRuns} review lens runs, ${item.focusedPasses} focused passes`,
				consider:
					"Each round reruns the review lenses. Look at why findings kept arriving: a missed premise, a slice too large, or a gap the draft challenge should have caught.",
			});
		}
		if (item.greenAttempts >= GREEN_ATTEMPTS_FLAG) {
			findings.push({
				key: item.key,
				driver: "repairs",
				evidence: `${item.greenAttempts} green gate runs`,
				consider:
					"Each repair resends the implementer packet. Look for a test seam, spec gap, or flaky check that forced the extra attempts.",
			});
		}
		if (item.largestPacket && item.largestPacket.chars >= PACKET_CHARS_FLAG) {
			findings.push({
				key: item.key,
				driver: "packet-size",
				evidence: `${basename(item.largestPacket.path)} is ${item.largestPacket.chars} characters`,
				consider:
					"A subagent rereads its packet on every step. Look at trimming the code map, the diff context, or the evidence attached.",
			});
		}
	}
	if (measuredTotal === null) {
		findings.push({
			key: null,
			driver: "unmeasured",
			evidence: "no token counts were recorded for this run",
			consider:
				"Token figures exist only when ROUTING_PROFILING=always or the host writes usage files. Measure a representative run before acting on cost.",
		});
		return findings;
	}
	const top = byWork[0];
	if (top && top.share >= SHARE_FLAG) {
		findings.push({
			key: null,
			driver: "measured-share",
			evidence: `${top.work} used ${Math.round(top.share * 100)} percent of measured tokens`,
			consider:
				"Most of the spend sits in one kind of work; that is where a smaller packet or a cheaper proven model would save the most.",
		});
	}
	if (measuredTotal.cheaperSuggested > 0) {
		findings.push({
			key: null,
			driver: "cheaper-suggested",
			evidence: `${measuredTotal.cheaperSuggested} measured tasks had a cheaper shadow recommendation with no safety floor`,
			consider:
				"A cheaper tier is only a candidate. Prove it with a paired benchmark before any routing change.",
		});
	}
	return findings;
}

if (import.meta.main) {
	const [repoRoot, ledgerPath] = process.argv.slice(2);
	if (!repoRoot || !ledgerPath) {
		console.error(`usage: ${COST_REVIEW_INVOCATION}`);
		process.exit(2);
	}
	try {
		const routing = join(repoRoot, ".delivery", "routing");
		const skipsByRun = new Map<string, number>();
		for (const skip of await loadSkips(routing)) {
			skipsByRun.set(skip.runId, (skipsByRun.get(skip.runId) ?? 0) + 1);
		}
		const review = reviewCosts({
			repoRoot,
			ledger: readFileSync(ledgerPath, "utf8"),
			observations: await loadObservations(routing),
			skipsByRun,
		});
		console.log(JSON.stringify(review, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
