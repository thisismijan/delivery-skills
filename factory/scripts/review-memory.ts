import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { sanitizeHumanText } from "./human-text";
import { EVIDENCE_TAIL_CHARS } from "./review-packet";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const REVIEW_MEMORY_RECORD_INVOCATION =
	"scripts/review-memory.ts record <repoRoot> <iid> <head-sha> <outcome.json>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const REVIEW_MEMORY_FILTER_INVOCATION =
	"scripts/review-memory.ts filter <repoRoot> <iid> <head-sha> <candidates.json>";

export const REJECTIONS_BUDGET_CHARS = EVIDENCE_TAIL_CHARS - 1000;

const SHA = /^[0-9a-f]{40}$/;
const MAX_RANGE_LINES = 80;
const MAX_GUARDS = 3;
const MAX_REJECTIONS = 5;
const MAX_TITLE = 200;
const MAX_REASON = 600;
const PRIOR = "prior-rejection-at-location";

export function isSafePath(path: string): boolean {
	if (
		path.length === 0 ||
		path.startsWith("/") ||
		path.includes("\\") ||
		path.includes("\0")
	) {
		return false;
	}
	return path
		.split("/")
		.every((part) => part !== "" && part !== "." && part !== "..");
}

const SafePath = z.string().refine(isSafePath, "must be a relative path");
const Code = z.array(z.string()).min(1);
const Line = z.number().int().positive();

const StoredGuard = z.object({ path: SafePath, code: Code }).strict();
const StoredRejection = z
	.object({
		title: z.string().min(1).max(MAX_TITLE),
		reason: z.string().min(1).max(MAX_REASON),
		recordedHead: z.string().regex(SHA),
		startLine: Line,
		endLine: Line,
		guards: z.array(StoredGuard).max(MAX_GUARDS),
	})
	.strict();
const StoredEntry = z
	.object({
		path: SafePath,
		code: Code,
		rejections: z.array(StoredRejection).min(1).max(MAX_REJECTIONS),
	})
	.strict();

export const ReviewMemory = z
	.object({ version: z.literal(1), entries: z.array(StoredEntry) })
	.strict();
export type ReviewMemory = z.infer<typeof ReviewMemory>;
type Entry = ReviewMemory["entries"][number];
type Rejection = Entry["rejections"][number];

class Unusable extends Error {}
class Refused extends Error {}

export function normaliseCode(lines: string[]): string[] {
	return lines
		.map((line) => line.trim().replace(/\s+/g, " "))
		.filter((line) => line.length > 0);
}

export interface Located {
	start: number;
	end: number;
}

export function locateCode(fileLines: string[], code: string[]): Located[] {
	const kept: Array<{ text: string; line: number }> = [];
	fileLines.forEach((raw, index) => {
		const [text] = normaliseCode([raw]);
		if (text !== undefined) kept.push({ text, line: index + 1 });
	});
	const found: Located[] = [];
	if (code.length === 0) return found;
	for (let at = 0; at + code.length <= kept.length; at++) {
		if (code.every((line, offset) => kept[at + offset]?.text === line)) {
			const first = kept[at];
			const last = kept[at + code.length - 1];
			if (first && last) found.push({ start: first.line, end: last.line });
		}
	}
	return found;
}

export function locationKey(path: string, code: string[]): string {
	return [path, ...code].join("\n");
}

export function rejectionRef(key: string, title: string): string {
	return createHash("sha256")
		.update(`${key}\0${title}`)
		.digest("hex")
		.slice(0, 12);
}

function git(cwd: string, args: string[]): { code: number; stdout: string } {
	try {
		const proc = Bun.spawnSync(["git", "-c", "core.quotepath=false", ...args], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		return { code: proc.exitCode ?? 1, stdout: proc.stdout.toString() };
	} catch {
		throw new Unusable(`${cwd} is not a usable directory.`);
	}
}

function checkArguments(repoRoot: string, iid: string, head: string): void {
	if (!/^\d+$/.test(iid)) {
		throw new Unusable("The merge request id must be digits only.");
	}
	if (!SHA.test(head)) {
		throw new Unusable("The head must be a full 40 character commit SHA.");
	}
	if (git(repoRoot, ["rev-parse", "--git-dir"]).code !== 0) {
		throw new Unusable(`${repoRoot} is not a git repository.`);
	}
	if (git(repoRoot, ["cat-file", "-e", `${head}^{commit}`]).code !== 0) {
		throw new Unusable(`${head} is not a commit in this repository.`);
	}
}

interface HeadFiles {
	read(path: string): string[] | undefined;
}

function headFiles(repoRoot: string, head: string): HeadFiles {
	const cache = new Map<string, string[] | undefined>();
	return {
		read(path) {
			if (cache.has(path)) return cache.get(path);
			const run = git(repoRoot, ["cat-file", "blob", `${head}:${path}`]);
			let lines: string[] | undefined;
			if (run.code === 0) {
				lines = run.stdout.split("\n").map((line) => line.replace(/\r$/, ""));
				if (lines.at(-1) === "") lines.pop();
			}
			cache.set(path, lines);
			return lines;
		},
	};
}

const memoryPath = (repoRoot: string, iid: string) =>
	join(repoRoot, ".review", `mr-${iid}`, "rejected.json");

function loadMemory(repoRoot: string, iid: string): ReviewMemory {
	const file = memoryPath(repoRoot, iid);
	if (!existsSync(file)) return { version: 1, entries: [] };
	const unreadable = new Unusable(
		`The review memory at .review/mr-${iid}/rejected.json cannot be read. Delete that file to forget the remembered rejections, then run again.`,
	);
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		throw unreadable;
	}
	const parsed = ReviewMemory.safeParse(raw);
	if (!parsed.success) throw unreadable;
	return parsed.data;
}

function readText(path: string, what: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new Unusable(`The ${what} at ${path} cannot be read.`);
	}
}

const entryRefs = (entry: Entry) =>
	entry.rejections.map((rejection) => ({
		rejection,
		ref: rejectionRef(locationKey(entry.path, entry.code), rejection.title),
	}));

const Candidates = z
	.object({
		candidates: z.array(
			z.object({
				id: z.string().min(1),
				path: z.string().min(1),
				line: Line.optional(),
				endLine: Line.optional(),
			}),
		),
	})
	.superRefine((value, ctx) => {
		const seen = new Set<string>();
		for (const candidate of value.candidates) {
			if (seen.has(candidate.id)) {
				ctx.addIssue({ code: "custom", message: "ids must be unique" });
			}
			seen.add(candidate.id);
			if (
				candidate.line !== undefined &&
				candidate.endLine !== undefined &&
				candidate.endLine < candidate.line
			) {
				ctx.addIssue({ code: "custom", message: "end line before line" });
			}
		}
	});

interface Listed {
	ref: string;
	title: string;
	reason: string;
	recordedHead: string;
	startLine: number;
	endLine: number;
}

interface FilterResult {
	id: string;
	path: string;
	line?: number;
	status: "fresh" | typeof PRIOR;
	cause?: string;
}

export interface FilterOutput {
	head: string;
	results: FilterResult[];
	rejections: Array<{ id: string; omitted: number; items: Listed[] }>;
}

function sectionChars(groups: FilterOutput["rejections"]): number {
	const text = JSON.stringify({ rejections: groups }, null, 2);
	return text.length - text.indexOf('"rejections"') + 1;
}

export function filterCandidates(options: {
	repoRoot: string;
	iid: string;
	head: string;
	candidatesText: string;
}): FilterOutput {
	const { repoRoot, iid, head } = options;
	checkArguments(repoRoot, iid, head);
	const memory = loadMemory(repoRoot, iid);
	let raw: unknown;
	try {
		raw = JSON.parse(options.candidatesText);
	} catch {
		throw new Unusable("The candidate list is not valid JSON.");
	}
	const parsed = Candidates.safeParse(raw);
	if (!parsed.success) {
		throw new Unusable(
			"The candidate list is not in the expected shape: each candidate needs a unique id and a path, and a line only as a positive whole number.",
		);
	}
	const files = headFiles(repoRoot, head);
	const guardPresent = (path: string, code: string[]) =>
		locateCode(files.read(path) ?? [], code).length > 0;

	const results: FilterResult[] = [];
	const applicable: Listed[][] = [];
	for (const candidate of parsed.data.candidates) {
		const base = {
			id: candidate.id,
			path: candidate.path,
			...(candidate.line === undefined ? {} : { line: candidate.line }),
		};
		const fresh = (cause: string) => {
			results.push({ ...base, status: "fresh", cause });
			applicable.push([]);
		};
		if (candidate.line === undefined) {
			fresh("no-line");
			continue;
		}
		const entries = isSafePath(candidate.path)
			? memory.entries.filter((entry) => entry.path === candidate.path)
			: [];
		if (entries.length === 0) {
			fresh("no-record");
			continue;
		}
		const low = candidate.line;
		const high = candidate.endLine ?? candidate.line;
		const lines = files.read(candidate.path) ?? [];
		const anchored = entries.filter((entry) =>
			locateCode(lines, entry.code).some(
				(range) => range.start <= high && range.end >= low,
			),
		);
		if (anchored.length === 0) {
			fresh("cited-code-changed");
			continue;
		}
		const holding: Listed[] = [];
		for (const entry of [...anchored].reverse()) {
			for (const { rejection, ref } of entryRefs(entry).reverse()) {
				if (
					rejection.guards.every((guard) =>
						guardPresent(guard.path, guard.code),
					)
				) {
					holding.push({
						ref,
						title: rejection.title,
						reason: rejection.reason,
						recordedHead: rejection.recordedHead,
						startLine: rejection.startLine,
						endLine: rejection.endLine,
					});
				}
			}
		}
		if (holding.length === 0) {
			fresh("guard-changed");
			continue;
		}
		results.push({ ...base, status: PRIOR });
		applicable.push(holding);
	}

	const groups: FilterOutput["rejections"] = [];
	results.forEach((result, index) => {
		const holding = applicable[index] ?? [];
		if (result.status !== PRIOR) return;
		const items: Listed[] = [];
		for (const item of holding) {
			const trial = [
				...groups,
				{ id: result.id, omitted: holding.length, items: [...items, item] },
			];
			if (sectionChars(trial) <= REJECTIONS_BUDGET_CHARS) items.push(item);
		}
		if (items.length === 0) {
			results[index] = {
				id: result.id,
				path: result.path,
				...(result.line === undefined ? {} : { line: result.line }),
				status: "fresh",
				cause: "memory-over-budget",
			};
			return;
		}
		groups.push({
			id: result.id,
			omitted: holding.length - items.length,
			items,
		});
	});
	return { head, results, rejections: groups };
}

const Place = z
	.object({ path: z.string(), startLine: Line, endLine: Line })
	.strict();
const Disproved = z
	.object({
		title: z.string(),
		path: z.string(),
		line: Line,
		startLine: Line,
		endLine: Line,
		reason: z.string(),
		guards: z.array(Place).optional(),
	})
	.strict();
const Named = z
	.object({ id: z.string().min(1), rejection: z.string().min(1) })
	.strict();
const Outcome = z
	.object({
		disproved: z.array(z.unknown()).default([]),
		reversed: z.array(z.unknown()).default([]),
		droppedAsPreviouslyDisproved: z.array(z.unknown()).default([]),
	})
	.strict();

const FilterFile = z.object({
	results: z.array(
		z.object({
			id: z.string(),
			path: z.string(),
			line: z.number().optional(),
			status: z.string(),
		}),
	),
	rejections: z.array(
		z.object({
			id: z.string(),
			items: z.array(
				z.object({
					ref: z.string(),
					title: z.string(),
					reason: z.string(),
					recordedHead: z.string(),
				}),
			),
		}),
	),
});

function shapeProblem(error: z.ZodError): string {
	return error.issues.some((issue) => issue.code === "unrecognized_keys")
		? "has an entry the outcome does not define"
		: "is incomplete or has a value of the wrong kind";
}

function readRange(
	files: HeadFiles,
	place: { path: string; startLine: number; endLine: number },
): { code: string[] } | { problem: string } {
	if (!isSafePath(place.path)) {
		return {
			problem: `${place.path} is not a path inside the repository`,
		};
	}
	if (place.endLine < place.startLine) {
		return { problem: `the range in ${place.path} runs backwards` };
	}
	const size = place.endLine - place.startLine + 1;
	if (size > MAX_RANGE_LINES) {
		return {
			problem: `the range in ${place.path} covers ${size} lines and at most ${MAX_RANGE_LINES} are allowed`,
		};
	}
	const lines = files.read(place.path);
	if (!lines) {
		return {
			problem: `the cited code in ${place.path} was not found at that head`,
		};
	}
	if (place.endLine > lines.length) {
		return {
			problem: `the range in ${place.path} goes past the end of the file, which has ${lines.length} lines`,
		};
	}
	const code = normaliseCode(lines.slice(place.startLine - 1, place.endLine));
	if (code.length === 0) {
		return { problem: `the range in ${place.path} holds no code` };
	}
	return { code };
}

interface PlannedRejection {
	path: string;
	code: string[];
	rejection: Rejection;
}

export interface RecordResult {
	recorded: number;
	reversed: number;
	previouslyDisproved: string;
}

export function recordOutcome(options: {
	repoRoot: string;
	iid: string;
	head: string;
	outcomeText: string;
}): RecordResult {
	const { repoRoot, iid, head } = options;
	checkArguments(repoRoot, iid, head);
	const memory = loadMemory(repoRoot, iid);

	let raw: unknown;
	try {
		raw = JSON.parse(options.outcomeText);
	} catch {
		throw new Refused("The outcome file is not valid JSON.");
	}
	const outcome = Outcome.safeParse(raw);
	if (!outcome.success) {
		throw new Refused(
			"The outcome file is not in the expected shape: it may only hold the lists of disproved, reversed, and dropped candidates.",
		);
	}

	const files = headFiles(repoRoot, head);
	const problems: string[] = [];
	const planned: PlannedRejection[] = [];

	outcome.data.disproved.forEach((item, index) => {
		const label = `disproved candidate ${index + 1}`;
		const parsed = Disproved.safeParse(item);
		if (!parsed.success) {
			problems.push(`${label} ${shapeProblem(parsed.error)}.`);
			return;
		}
		const found = parsed.data;
		const title = found.title.trim();
		const reason = found.reason.trim();
		const fail = (problem: string) => problems.push(`${label}: ${problem}.`);
		if (title.length === 0) return fail("the title is empty");
		if (title.length > MAX_TITLE) {
			return fail(`the title is longer than ${MAX_TITLE} characters`);
		}
		if (reason.length === 0) return fail("the reason is empty");
		if (reason.length > MAX_REASON) {
			return fail(`the reason is longer than ${MAX_REASON} characters`);
		}
		if (found.line < found.startLine || found.line > found.endLine) {
			return fail("the cited line is not inside the range that was read");
		}
		const cited = readRange(files, found);
		if ("problem" in cited) return fail(cited.problem);
		const guards = found.guards ?? [];
		if (guards.length > MAX_GUARDS) {
			return fail(
				`it relies on more than ${MAX_GUARDS} other places, and a claim like that is not remembered`,
			);
		}
		const stored: Rejection["guards"] = [];
		for (const guard of guards) {
			const read = readRange(files, guard);
			if ("problem" in read) {
				return fail(`a place it relies on: ${read.problem}`);
			}
			stored.push({ path: guard.path, code: read.code });
		}
		planned.push({
			path: found.path,
			code: cited.code,
			rejection: {
				title,
				reason,
				recordedHead: head,
				startLine: found.startLine,
				endLine: found.endLine,
				guards: stored,
			},
		});
	});

	const named = [
		{
			list: "reversed",
			label: "reversed candidate",
			items: outcome.data.reversed,
		},
		{
			list: "dropped",
			label: "dropped candidate",
			items: outcome.data.droppedAsPreviouslyDisproved,
		},
	];
	const needsFilter = named.some((group) => group.items.length > 0);
	const filterRel = join(".review", `mr-${iid}`, head, "memory-filter.json");
	let filterFile: z.infer<typeof FilterFile> | undefined;
	if (needsFilter) {
		const filterPath = join(repoRoot, filterRel);
		if (!existsSync(filterPath)) {
			throw new Unusable(
				`The filter result at ${filterRel} does not exist. Run the filter step for this head first.`,
			);
		}
		let parsedFilter: unknown;
		try {
			parsedFilter = JSON.parse(readText(filterPath, "filter result"));
		} catch (error) {
			if (error instanceof Unusable) throw error;
			throw new Unusable(
				`The filter result at ${filterRel} is not valid JSON.`,
			);
		}
		const checked = FilterFile.safeParse(parsedFilter);
		if (!checked.success) {
			throw new Unusable(
				`The filter result at ${filterRel} is not in the expected shape.`,
			);
		}
		filterFile = checked.data;
	}

	const reversedRefs: string[] = [];
	const bullets: string[] = [];
	const seen = new Map<string, Set<string>>();
	for (const group of named) {
		group.items.forEach((item, index) => {
			const label = `${group.label} ${index + 1}`;
			const parsed = Named.safeParse(item);
			if (!parsed.success) {
				problems.push(`${label} ${shapeProblem(parsed.error)}.`);
				return;
			}
			const { id, rejection } = parsed.data;
			const result = filterFile?.results.find((one) => one.id === id);
			if (!result || result.status !== PRIOR) {
				problems.push(
					`${label} (${id}): the filter did not find a prior rejection for it.`,
				);
				return;
			}
			const listed = filterFile?.rejections
				.find((one) => one.id === id)
				?.items.find((one) => one.ref === rejection);
			if (!listed) {
				problems.push(
					`${label} (${id}): the rejection ${rejection} is not one of those listed for it.`,
				);
				return;
			}
			const key = `${id}\0${rejection}`;
			const lists = seen.get(key) ?? new Set<string>();
			lists.add(group.list);
			seen.set(key, lists);
			if (group.list === "reversed") {
				reversedRefs.push(rejection);
				return;
			}
			const place =
				result.line === undefined
					? result.path
					: `${result.path}:${result.line}`;
			bullets.push(
				`- \`${place}\` ${sanitizeHumanText(listed.title)}. Earlier reason: ${sanitizeHumanText(listed.reason)} (judged at ${listed.recordedHead.slice(0, 12)})`,
			);
		});
	}
	for (const [key, lists] of seen) {
		if (lists.size < 2) continue;
		const [id] = key.split("\0");
		problems.push(
			`${id}: the same rejection cannot be both reversed and dropped.`,
		);
	}

	if (problems.length > 0) throw new Refused(problems.join("\n"));

	const next: ReviewMemory = structuredClone(memory);
	let reversed = 0;
	for (const ref of reversedRefs) {
		for (const entry of next.entries) {
			const hit = entryRefs(entry).find((one) => one.ref === ref);
			if (!hit) continue;
			entry.rejections = entry.rejections.filter(
				(one) => one !== hit.rejection,
			);
			reversed++;
		}
		next.entries = next.entries.filter((entry) => entry.rejections.length > 0);
	}
	for (const item of planned) {
		const key = locationKey(item.path, item.code);
		let entry = next.entries.find(
			(one) => locationKey(one.path, one.code) === key,
		);
		if (!entry) {
			entry = { path: item.path, code: item.code, rejections: [] };
			next.entries.push(entry);
		}
		entry.rejections = entry.rejections.filter(
			(one) => one.title !== item.rejection.title,
		);
		entry.rejections.push(item.rejection);
		while (entry.rejections.length > MAX_REJECTIONS) entry.rejections.shift();
	}

	if (JSON.stringify(next) !== JSON.stringify(memory)) {
		writeMemory(repoRoot, iid, next);
	}
	return {
		recorded: planned.length,
		reversed,
		previouslyDisproved: bullets.join("\n"),
	};
}

function writeMemory(
	repoRoot: string,
	iid: string,
	memory: ReviewMemory,
): void {
	const file = memoryPath(repoRoot, iid);
	mkdirSync(join(repoRoot, ".review", `mr-${iid}`), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	try {
		writeFileSync(temporary, `${JSON.stringify(memory, null, 2)}\n`);
		renameSync(temporary, file);
	} finally {
		rmSync(temporary, { force: true });
	}
}

if (import.meta.main) {
	const [command, repoRoot, iid, head, file] = process.argv.slice(2);
	const usage =
		command === "record"
			? REVIEW_MEMORY_RECORD_INVOCATION
			: command === "filter"
				? REVIEW_MEMORY_FILTER_INVOCATION
				: `${REVIEW_MEMORY_RECORD_INVOCATION}\n${REVIEW_MEMORY_FILTER_INVOCATION}`;
	if (
		(command !== "record" && command !== "filter") ||
		!repoRoot ||
		!iid ||
		!head ||
		!file
	) {
		console.error(`usage: ${usage}`);
		process.exit(2);
	}
	try {
		const text = readText(
			file,
			command === "record" ? "outcome file" : "candidate list",
		);
		const output =
			command === "record"
				? recordOutcome({ repoRoot, iid, head, outcomeText: text })
				: filterCandidates({ repoRoot, iid, head, candidatesText: text });
		console.log(JSON.stringify(output, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(error instanceof Refused ? 3 : 1);
	}
}
