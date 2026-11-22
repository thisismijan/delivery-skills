import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

// Reads exported session transcripts after a run and reports where the main session's tool
// output went. It runs after the fact, so measuring costs the run nothing. It counts characters
// of tool output, not billed tokens: a transcript does not record the system prompt, thinking,
// or the model's own output.

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const TRANSCRIPT_COST_INVOCATION = "scripts/transcript-cost.ts <transcript.json>...";
export const TRANSCRIPT_COST_USAGE =
	"transcript-cost.ts <transcript.json>... [--json]";
export const LARGE_READ_LINES = 350;
export const LARGE_SHELL_CHARS = 20_000;

export interface ToolEvent {
	tool: string;
	args: Record<string, unknown>;
	output: string;
}

export interface RunCost {
	name: string;
	steps: number;
	outputChars: number;
	carriedCharSteps: number;
	byKind: Record<string, { chars: number; calls: number; carried: number }>;
	rereadChars: number;
	largeWholeReads: Array<{ path: string; lines: number; chars: number }>;
	scriptSourceReads: string[];
	runtimeNotesReads: number;
	toolListings: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function outputText(result: unknown): string {
	if (result === undefined || result === null) return "";
	if (typeof result === "string") return result;
	const value = isRecord(result) && "value" in result ? result.value : result;
	if (typeof value === "string") return value;
	if (isRecord(value)) {
		for (const key of ["contents", "content", "output", "text"]) {
			const text = value[key];
			if (typeof text === "string") return text;
		}
	}
	return JSON.stringify(value);
}

// The exported transcript shape: `{ messages: [...] }`, where each tool message names its tool,
// its arguments, and its result.
export function toolEvents(transcript: unknown): ToolEvent[] {
	const messages = isRecord(transcript) ? transcript.messages : transcript;
	if (!Array.isArray(messages)) {
		throw new Error("a transcript is an object with a messages array");
	}
	const events: ToolEvent[] = [];
	for (const message of messages) {
		if (!isRecord(message) || message.role !== "tool") continue;
		if (message.tool_result === undefined || message.tool_result === null) {
			continue;
		}
		events.push({
			tool:
				typeof message.tool_name === "string" ? message.tool_name : "unknown",
			args: isRecord(message.tool_args) ? message.tool_args : {},
			output: outputText(message.tool_result),
		});
	}
	return events;
}

function readPath(args: Record<string, unknown>): string | undefined {
	for (const key of ["target_file", "path", "file_path"]) {
		if (typeof args[key] === "string") return args[key] as string;
	}
	return undefined;
}

function isRanged(args: Record<string, unknown>): boolean {
	return ["offset", "limit", "start_line", "end_line"].some(
		(key) => args[key] !== undefined && args[key] !== null,
	);
}

// The pack's own skill names, from the skills directory beside this factory: `<skills>/_factory`
// when installed, `<clone>/factory` beside `<clone>/skills` in a clone.
export function packSkillNames(scriptsDir: string = import.meta.dir): string[] {
	const factory = resolve(scriptsDir, "..");
	for (const dir of [
		resolve(factory, ".."),
		resolve(factory, "..", "skills"),
	]) {
		if (!existsSync(join(dir, "delivery", "SKILL.md"))) continue;
		return readdirSync(dir, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isDirectory() && existsSync(join(dir, entry.name, "SKILL.md")),
			)
			.map((entry) => entry.name);
	}
	return [];
}

export function readArea(
	path: string,
	skills: readonly string[] = packSkillNames(),
): string {
	if (
		/\/_factory\/|\/factory\/(scripts|agents|reference)\/|\/factory\/RUNTIME\.md$/.test(
			path,
		) ||
		skills.some((skill) => path.includes(`/skills/${skill}/`))
	) {
		return "skill or factory";
	}
	if (/\/\.delivery\/|\/\.review\/|\/openspec\/changes\//.test(path)) {
		return "run artifacts";
	}
	return "source";
}

export function shellKind(command: string, outputChars: number): string {
	const kind =
		/\bbun (run )?test\b|bun run (check|test|lint|typecheck)|biome|tsc\b|eslint|pytest|mvn|gradle|quiet-run\.ts|test-gate\.ts/.test(
			command,
		)
			? "shell: tests, lint, typecheck"
			: /git (diff|show)\b/.test(command)
				? "shell: git diff or show"
				: /\bgit\b/.test(command)
					? "shell: other git"
					: /forge-provider\.ts|work-item-provider\.ts/.test(command)
						? "shell: provider commands"
						: /\b(cat|sed -n|head|tail|nl|less|more)\b/.test(command)
							? "shell: file reads"
							: /\b(rg|grep|find|ls)\b/.test(command)
								? "shell: search and listing"
								: /\/scripts\/[\w-]+\.ts/.test(command)
									? "shell: other factory scripts"
									: "shell: other";
	return outputChars > LARGE_SHELL_CHARS ? `${kind} (over 20k chars)` : kind;
}

function eventKind(event: ToolEvent, skills: readonly string[]): string {
	const path = readPath(event.args);
	if (/read/i.test(event.tool) && path) {
		const lines = event.output ? event.output.split("\n").length : 0;
		const shape = isRanged(event.args)
			? "ranged"
			: lines > LARGE_READ_LINES
				? `whole, over ${LARGE_READ_LINES} lines`
				: "whole";
		return `read: ${readArea(path, skills)}, ${shape}`;
	}
	if (/terminal|shell|bash/i.test(event.tool)) {
		const command =
			typeof event.args.command === "string" ? event.args.command : "";
		return shellKind(command, event.output.length);
	}
	if (/grep|search|glob/i.test(event.tool)) return "search";
	if (/get_mcp_tools|list.*tools/i.test(event.tool)) return "host tool listing";
	if (/^mcp$|mcp/i.test(event.tool)) return "host tool calls";
	if (/replace|edit|write/i.test(event.tool)) return "edits";
	return `other: ${event.tool}`;
}

export function runCost(
	name: string,
	events: readonly ToolEvent[],
	skills: readonly string[] = packSkillNames(),
): RunCost {
	const cost: RunCost = {
		name,
		steps: events.length,
		outputChars: 0,
		carriedCharSteps: 0,
		byKind: {},
		rereadChars: 0,
		largeWholeReads: [],
		scriptSourceReads: [],
		runtimeNotesReads: 0,
		toolListings: 0,
	};
	const seen = new Set<string>();
	for (const [index, event] of events.entries()) {
		const chars = event.output.length;
		// Every later step re-sends this output as part of the context.
		const carried = chars * (events.length - index - 1);
		const kind = eventKind(event, skills);
		const entry = cost.byKind[kind] ?? { chars: 0, calls: 0, carried: 0 };
		entry.chars += chars;
		entry.calls += 1;
		entry.carried += carried;
		cost.byKind[kind] = entry;
		cost.outputChars += chars;
		cost.carriedCharSteps += carried;
		if (kind === "host tool listing") cost.toolListings += 1;
		const path = kind.startsWith("read:") ? readPath(event.args) : undefined;
		if (!path) continue;
		if (seen.has(path)) cost.rereadChars += chars;
		seen.add(path);
		if (kind.includes("over")) {
			cost.largeWholeReads.push({
				path,
				lines: event.output.split("\n").length,
				chars,
			});
		}
		if (
			/\/scripts\/[\w-]+\.ts$/.test(path) &&
			readArea(path, skills) === "skill or factory"
		) {
			cost.scriptSourceReads.push(basename(path));
		}
		if (basename(path) === "RUNTIME.md") cost.runtimeNotesReads += 1;
	}
	return cost;
}

export interface CostSummary {
	runs: RunCost[];
	outputChars: number;
	carriedCharSteps: number;
	byKind: Array<{
		kind: string;
		share: number;
		carriedShare: number;
		chars: number;
		calls: number;
	}>;
	rereadShare: number;
	runsReadingScriptSource: number;
	largeWholeReads: number;
	toolListingsPerRun: number;
}

export function summarize(runs: readonly RunCost[]): CostSummary {
	const totals = new Map<
		string,
		{ chars: number; calls: number; carried: number }
	>();
	let outputChars = 0;
	let carriedCharSteps = 0;
	let reread = 0;
	for (const run of runs) {
		outputChars += run.outputChars;
		carriedCharSteps += run.carriedCharSteps;
		reread += run.rereadChars;
		for (const [kind, entry] of Object.entries(run.byKind)) {
			const total = totals.get(kind) ?? { chars: 0, calls: 0, carried: 0 };
			total.chars += entry.chars;
			total.calls += entry.calls;
			total.carried += entry.carried;
			totals.set(kind, total);
		}
	}
	const share = (part: number, whole: number) =>
		whole === 0 ? 0 : part / whole;
	return {
		runs: [...runs],
		outputChars,
		carriedCharSteps,
		byKind: [...totals.entries()]
			.map(([kind, total]) => ({
				kind,
				share: share(total.chars, outputChars),
				carriedShare: share(total.carried, carriedCharSteps),
				chars: total.chars,
				calls: total.calls,
			}))
			.sort((left, right) => right.chars - left.chars),
		rereadShare: share(reread, outputChars),
		runsReadingScriptSource: runs.filter(
			(run) => run.scriptSourceReads.length > 0,
		).length,
		largeWholeReads: runs.reduce(
			(sum, run) => sum + run.largeWholeReads.length,
			0,
		),
		toolListingsPerRun: share(
			runs.reduce((sum, run) => sum + run.toolListings, 0),
			runs.length,
		),
	};
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function formatSummary(summary: CostSummary): string {
	const runs = summary.runs.length;
	const lines = [
		`${runs} session${runs === 1 ? "" : "s"}, ${summary.outputChars.toLocaleString("en-GB")} characters of tool output (about ${Math.round(summary.outputChars / 4).toLocaleString("en-GB")} tokens at four characters each).`,
		"These are characters of tool output, not billed tokens.",
		"",
		"Where the tool output went: share of all characters, then the share when each result counts again on every later step that re-sends it:",
		...summary.byKind.map(
			(entry) =>
				`  ${entry.kind}: ${percent(entry.share)}, ${percent(entry.carriedShare)} with re-sends, ${entry.calls} calls`,
		),
		"",
		`Re-reads of a file already read in the same session: ${percent(summary.rereadShare)} of all output.`,
		`Sessions that read a factory script's source: ${summary.runsReadingScriptSource} of ${runs}.`,
		`Whole-file reads over ${LARGE_READ_LINES} lines: ${summary.largeWholeReads}.`,
		`Host tool listings per session: ${summary.toolListingsPerRun.toFixed(1)}.`,
		"",
		"Per session (steps, characters of tool output):",
		...summary.runs.map(
			(run) =>
				`  ${run.name}: ${run.steps} steps, ${run.outputChars.toLocaleString("en-GB")} characters`,
		),
	];
	return lines.join("\n");
}

// A batch export keeps one `<id>/transcript.json` per session and names them in `index.json`
// beside those folders.
async function sessionName(path: string): Promise<string> {
	if (basename(path) !== "transcript.json") return basename(path);
	const id = basename(dirname(path));
	try {
		const index = JSON.parse(
			await readFile(join(dirname(dirname(path)), "index.json"), "utf8"),
		) as { agents?: Array<{ bcId?: string; name?: string }> };
		const named = index.agents?.find((agent) => agent.bcId === id)?.name;
		return named ? `${named} (${id})` : id;
	} catch {
		return id;
	}
}

export async function transcriptCost(
	paths: readonly string[],
): Promise<CostSummary> {
	const skills = packSkillNames();
	const runs: RunCost[] = [];
	for (const path of paths) {
		const events = toolEvents(JSON.parse(await readFile(path, "utf8")));
		runs.push(runCost(await sessionName(path), events, skills));
	}
	return summarize(runs);
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const json = args.includes("--json");
	const paths = args.filter((arg) => arg !== "--json");
	if (paths.length === 0) {
		console.error(`usage: ${TRANSCRIPT_COST_USAGE}`);
		process.exit(2);
	}
	try {
		const summary = await transcriptCost(paths);
		console.log(
			json ? JSON.stringify(summary, null, 2) : formatSummary(summary),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
