import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { LEVEL_OVERRIDES, loadConfig } from "./config";
import { ledgerEntryLines, ledgerLineTime } from "./ledger-store";
import { WorkerDispatch } from "./worker-watch";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const LOOK_AWAY_INVOCATION =
	"scripts/look-away-metrics.ts <state-root> <run-id>";

const RAISE_STRETCH_SECONDS = 4 * 60 * 60;
const FOUR_HOURS = "four hours";
const DAY_MS = 24 * 60 * 60 * 1000;
const STOP_LINE =
	/^- (\d{4}-\d{2}-\d{2}(?:T\S+)?) ([A-Z][A-Z0-9]+-\d+|run) ([A-Za-z][A-Za-z0-9-]*)(?=\s|$)/;
const DATE_ONLY_LINE = /^- (\d{4}-\d{2}-\d{2})(?=\s|$)/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IDLE_LINE = /\bworker ([A-Z][A-Z0-9]+-\d+) idle for \d+ minutes; stopped/;
const LEVEL_LINE = /\blevel \S+: maxParallelWorktrees=(\S+)/;
const POSITIVE_WHOLE = /^[1-9]\d*$/;

export type Peak =
	| { state: "exact" | "at-least"; workers: number }
	| { state: "unknown"; reason: string };

export interface StopCounts {
	total: number;
	byStage: Record<string, number>;
	unreadable: string[];
}

export type Stretch =
	| {
			state: "known";
			seconds: number;
			text: string;
			from: string;
			to: string;
			includesWaiting: true;
	  }
	| { state: "unknown"; reason: string };

export type RunLimit = { state: "known"; value: number } | { state: "unknown" };

export interface Suggestion {
	action: "raise" | "hold";
	runLimit: RunLimit;
	configuredLimit: number;
	reasons: string[];
}

export interface Journal {
	name: string;
	text: string | undefined;
}

export interface LookAwayReport {
	peak: Peak;
	stops: StopCounts;
	journals: { read: number; unreadable: string[] };
	idleWorkers: string[];
	longestStretch: Stretch;
	suggestion: Suggestion;
}

function unknownPeak(reason: string): Peak {
	return { state: "unknown", reason };
}

export function peakConcurrency(dispatch: unknown | undefined): Peak {
	if (dispatch === undefined) {
		return unknownPeak("the dispatch records were not found");
	}
	const parsed = WorkerDispatch.safeParse(dispatch);
	if (!parsed.success) {
		const repeated = parsed.error.issues.some(
			(issue) => issue.message === "each key is watched once",
		);
		return unknownPeak(
			repeated
				? "a key appears twice in the dispatch records, so a worker was dispatched again"
				: "the dispatch records are not in the expected form",
		);
	}
	const events: { at: number; start: boolean }[] = [];
	let unfinished = false;
	for (const worker of parsed.data.workers) {
		const start = Date.parse(worker.dispatchedAt);
		if (worker.finishedAt === undefined) {
			unfinished = true;
			events.push({ at: start, start: true });
			continue;
		}
		const end = Date.parse(worker.finishedAt);
		if (end < start) {
			return unknownPeak(
				`worker ${worker.key} is recorded as finished before it was dispatched`,
			);
		}
		if (end > start) {
			events.push({ at: start, start: true }, { at: end, start: false });
		}
	}
	events.sort((a, b) => a.at - b.at || Number(a.start) - Number(b.start));
	let running = 0;
	let peak = 1;
	for (const event of events) {
		running += event.start ? 1 : -1;
		peak = Math.max(peak, running);
	}
	return { state: unfinished ? "at-least" : "exact", workers: peak };
}

export function stopsByStage(sources: string[]): StopCounts {
	const counts = new Map<string, number>();
	const unreadable: string[] = [];
	let total = 0;
	for (const source of sources) {
		for (const line of ledgerEntryLines(source, "Stops")) {
			total += 1;
			const match = STOP_LINE.exec(line);
			const when = match?.[1];
			const stage = match?.[3];
			const readable =
				when !== undefined && (DATE.test(when) || ledgerLineTime(`- ${when}`));
			if (!readable || stage === undefined) {
				unreadable.push(line);
				continue;
			}
			const name = stage.toLowerCase();
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	const byStage: Record<string, number> = {};
	for (const name of [...counts.keys()].sort()) {
		byStage[name] = counts.get(name) ?? 0;
	}
	return { total, byStage, unreadable };
}

export function idleWorkers(ledger: string): string[] {
	const keys: string[] = [];
	for (const line of ledgerEntryLines(ledger, "Decisions")) {
		const key = IDLE_LINE.exec(line)?.[1];
		if (key !== undefined && !keys.includes(key)) keys.push(key);
	}
	return keys;
}

export function runLimit(ledger: string): RunLimit {
	let highest = 0;
	for (const line of ledgerEntryLines(ledger, "Decisions")) {
		const value = LEVEL_LINE.exec(line)?.[1];
		if (value === undefined || !POSITIVE_WHOLE.test(value)) continue;
		const limit = Number(value);
		if (Number.isSafeInteger(limit)) highest = Math.max(highest, limit);
	}
	return highest > 0
		? { state: "known", value: highest }
		: { state: "unknown" };
}

function dayStart(date: string): number | undefined {
	const start = Date.parse(`${date}T00:00:00Z`);
	if (Number.isNaN(start)) return undefined;
	return new Date(start).toISOString().startsWith(date) ? start : undefined;
}

function hoursAndMinutes(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

export function longestStretch(sources: string[]): Stretch {
	const timed: { at: number; time: string }[] = [];
	const untimed: ({ start: number } | "anywhere")[] = [];
	for (const source of sources) {
		for (const section of ["Stops", "Approvals"] as const) {
			for (const line of ledgerEntryLines(source, section)) {
				const time = ledgerLineTime(line);
				if (time !== undefined) {
					timed.push({ at: Date.parse(time), time });
					continue;
				}
				const date = DATE_ONLY_LINE.exec(line)?.[1];
				const start = date === undefined ? undefined : dayStart(date);
				untimed.push(start === undefined ? "anywhere" : { start });
			}
		}
	}
	if (timed.length < 2) {
		return {
			state: "unknown",
			reason: "at least two timed interrupts are needed to measure a stretch",
		};
	}
	timed.sort((a, b) => a.at - b.at);
	let best: { seconds: number; from: string; to: string } | undefined;
	for (let index = 1; index < timed.length; index += 1) {
		const from = timed[index - 1];
		const to = timed[index];
		if (!from || !to) continue;
		const split = untimed.some(
			(line) =>
				line === "anywhere" ||
				(line.start < to.at && line.start + DAY_MS > from.at),
		);
		if (split) continue;
		const seconds = (to.at - from.at) / 1000;
		if (!best || seconds > best.seconds) {
			best = { seconds, from: from.time, to: to.time };
		}
	}
	if (!best) {
		return {
			state: "unknown",
			reason:
				"an older line with no time could have fallen inside every gap between timed interrupts",
		};
	}
	return {
		state: "known",
		seconds: best.seconds,
		text: hoursAndMinutes(best.seconds),
		from: best.from,
		to: best.to,
		includesWaiting: true,
	};
}

export function suggest(
	peak: Peak,
	stretch: Stretch,
	limits: { runLimit: RunLimit; configuredLimit: number },
	idle: string[],
	journalsComplete: boolean,
): Suggestion {
	const failed: string[] = [];
	const { runLimit: used, configuredLimit } = limits;
	let reached = false;
	if (peak.state === "unknown") {
		failed.push(`The peak is unknown: ${peak.reason}.`);
	} else if (peak.state === "at-least") {
		failed.push(
			`The peak of at least ${peak.workers} was not confirmed because a worker has no finish time recorded.`,
		);
	} else if (used.state === "known") {
		reached = peak.workers >= used.value;
		if (!reached) {
			failed.push(
				`The peak of ${peak.workers} did not reach the limit the run used (${used.value}).`,
			);
		}
	}
	if (used.state === "unknown") {
		failed.push("The limit the run used is unknown.");
	} else if (used.value !== configuredLimit) {
		failed.push(
			`The limit the run used (${used.value}) differs from the limit configured now (${configuredLimit}).`,
		);
	}
	if (stretch.state === "unknown") {
		failed.push(`The longest stretch is unknown: ${stretch.reason}.`);
	} else if (stretch.seconds < RAISE_STRETCH_SECONDS) {
		failed.push(
			`The longest stretch (${stretch.text}) was under ${FOUR_HOURS}.`,
		);
	}
	if (!journalsComplete) {
		failed.push(
			"A worker journal could not be read, so an interrupt may be missing.",
		);
	}
	if (idle.length > 0) {
		failed.push(
			`A worker was stopped for being idle (${idle.join(", ")}), which is not evidence that more is safe.`,
		);
	}
	if (
		failed.length === 0 &&
		peak.state === "exact" &&
		stretch.state === "known" &&
		used.state === "known"
	) {
		return {
			action: "raise",
			runLimit: used,
			configuredLimit,
			reasons: [
				`The peak of ${peak.workers} reached the limit the run used (${used.value}), which is also the limit configured now.`,
				`The longest stretch without an interrupt was ${stretch.text}, at least ${FOUR_HOURS}.`,
				"That stretch counts time spent waiting for a person, so treat this as a prompt to look, not as proof of unsupervised work.",
			],
		};
	}
	return {
		action: "hold",
		runLimit: used,
		configuredLimit,
		reasons: failed,
	};
}

export function lookAwayReport(input: {
	ledger: string;
	journals: Journal[];
	dispatch: unknown | undefined;
	dispatchProblem?: string;
	configuredLimit: number;
}): LookAwayReport {
	const readable = input.journals.flatMap((journal) =>
		journal.text === undefined ? [] : [journal.text],
	);
	const unreadable = input.journals
		.filter((journal) => journal.text === undefined)
		.map((journal) => journal.name);
	const sources = [input.ledger, ...readable];
	const peak = input.dispatchProblem
		? unknownPeak(input.dispatchProblem)
		: peakConcurrency(input.dispatch);
	const stops = stopsByStage(sources);
	const idle = idleWorkers(input.ledger);
	const used = runLimit(input.ledger);
	const stretch: Stretch =
		unreadable.length > 0
			? {
					state: "unknown",
					reason: `a worker journal could not be read, so the stop counts and the stretch are incomplete (${unreadable.join(", ")})`,
				}
			: longestStretch(sources);
	return {
		peak,
		stops,
		journals: { read: readable.length, unreadable },
		idleWorkers: idle,
		longestStretch: stretch,
		suggestion: suggest(
			peak,
			stretch,
			{ runLimit: used, configuredLimit: input.configuredLimit },
			idle,
			unreadable.length === 0,
		),
	};
}

function configurationProblem(error: unknown): string {
	if (!(error instanceof z.ZodError)) {
		return error instanceof Error ? error.message : String(error);
	}
	const names = Object.entries(LEVEL_OVERRIDES);
	const problems = error.issues.map((issue) => {
		const field = String(issue.path[0] ?? "configuration");
		const setting = names.find(([, key]) => key === field)?.[0] ?? field;
		return `${setting}: ${issue.message}`;
	});
	return `invalid configuration: ${problems.join("; ")}`;
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

if (import.meta.main) {
	const [stateRoot, runId] = process.argv.slice(2);
	if (!stateRoot || !runId) {
		console.error(`usage: ${LOOK_AWAY_INVOCATION}`);
		process.exit(2);
	}
	const ledgerPath = join(stateRoot, `${runId}.md`);
	const ledger = existsSync(ledgerPath) ? readText(ledgerPath) : undefined;
	if (ledger === undefined) {
		console.error(`no ledger could be read at ${ledgerPath}`);
		process.exit(1);
	}
	let configuredLimit: number;
	try {
		configuredLimit = loadConfig().maxParallelWorktrees;
	} catch (error) {
		console.error(configurationProblem(error));
		process.exit(1);
	}
	const workersDir = join(stateRoot, "workers", runId);
	const dispatchPath = join(workersDir, "dispatch.json");
	let dispatch: unknown;
	let dispatchProblem: string | undefined;
	if (existsSync(dispatchPath)) {
		const text = readText(dispatchPath);
		try {
			if (text === undefined) throw new Error("unreadable");
			dispatch = JSON.parse(text);
		} catch {
			dispatchProblem = "the dispatch records could not be read as JSON";
		}
	}
	const journals: Journal[] = existsSync(workersDir)
		? readdirSync(workersDir)
				.filter((name) => name.endsWith(".md"))
				.sort()
				.map((name) => ({ name, text: readText(join(workersDir, name)) }))
		: [];
	console.log(
		JSON.stringify(
			lookAwayReport({
				ledger,
				journals,
				dispatch,
				dispatchProblem,
				configuredLimit,
			}),
			null,
			2,
		),
	);
}
