import { readFile, stat, writeFile } from "node:fs/promises";

const REQUIRED_SECTIONS = [
	"Context",
	"User stories",
	"What to build",
	"Acceptance criteria",
	"Out of scope",
	"Blocked by",
] as const;

const HOUSEKEEPING_SECTIONS = ["Out of scope", "Blocked by"] as const;

export const QUESTION_SECTIONS = [
	"Context",
	"User stories",
	"What to build",
	"Acceptance criteria",
] as const;

export const SIZE_WARN_LINES = 400;
export const SIZE_WARN_CHARS = 12000;

const MAX_CRITERIA = 3;
const MAX_STORIES = 1;

const HEADING = /^#{1,6}\s+(.+?)\s*$/;
const FENCE = /^\s*```/;
const CHECKBOX = /^- \[[ xX]\](.*)$/gm;
const GIVEN_WHEN_THEN = /\bgiven\b.*\bwhen\b.*\bthen\b/i;
const STORY_HEADING = /^#{1,6}\s+user stories\s*$/i;
const ANY_HEADING = /^#{1,6}\s+/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

// Inline code, links, and the ?? ?. ?: operators carry a question mark that
// is not a question to the reader.
const NOT_QUESTIONS = [/`[^`]+`/g, /https?:\/\/[^\s)]+/gi, /\?\?|\?\.|\?:/g];

type TicketCheck = { ok: boolean; missing: string[]; warnings: string[] };

function sectionGap(name: string): string {
	return `Missing required section: ${name}`;
}

const HOUSEKEEPING = new Map<string, string>(
	HOUSEKEEPING_SECTIONS.map((name) => [sectionGap(name), name]),
);

const NO_CRITERIA =
	'Missing acceptance criteria: the Acceptance criteria section needs one or more "- [ ]" or "- [x]" checkbox lines';

function headingFor(name: string): RegExp {
	return new RegExp(`^#{1,6}\\s+${name}\\s*$`, "im");
}

async function isFile(path: string): Promise<boolean> {
	return stat(path).then(
		(info) => info.isFile(),
		() => false,
	);
}

// A one-line argument naming an existing file is read from disk; anything else
// is the draft itself.
async function readDraft(pathOrText: string): Promise<string> {
	if (pathOrText.includes("\n") || !(await isFile(pathOrText))) {
		return pathOrText;
	}
	return readFile(pathOrText, "utf8").catch(() => pathOrText);
}

function headingTitle(line: string): string | null {
	const found = HEADING.exec(line);
	return found === null ? null : (found[1] ?? "").trim().toLowerCase();
}

function unfencedLines(text: string): string[] {
	let fenced = false;
	return text.split("\n").filter((line) => {
		if (FENCE.test(line)) {
			fenced = !fenced;
			return false;
		}
		return !fenced;
	});
}

export function sectionBody(text: string, name: string): string {
	const lines = unfencedLines(text);
	const wanted = name.toLowerCase();
	const start = lines.findIndex((line) => headingTitle(line) === wanted);
	if (start < 0) return "";
	const after = lines.slice(start + 1);
	const end = after.findIndex((line) => headingTitle(line) !== null);
	return (end < 0 ? after : after.slice(0, end)).join("\n");
}

export function acceptanceCriterionLines(text: string): string[] {
	const body = sectionBody(text, "Acceptance criteria");
	return Array.from(body.matchAll(CHECKBOX), ([, rest = ""]) => rest.trim());
}

// Counts list items under the User stories heading up to the next heading.
// Unlike sectionBody, this scan does not skip fenced code.
export function countUserStories(draft: string): number {
	const lines = draft.split("\n");
	const start = lines.findIndex((line) => STORY_HEADING.test(line));
	if (start < 0) return 0;
	let stories = 0;
	for (const line of lines.slice(start + 1)) {
		if (STORY_HEADING.test(line)) continue;
		if (ANY_HEADING.test(line)) break;
		if (LIST_ITEM.test(line)) stories += 1;
	}
	return stories;
}

export function hasOpenQuestion(text: string): boolean {
	let prose = QUESTION_SECTIONS.map((name) => sectionBody(text, name)).join(
		"\n",
	);
	for (const pattern of NOT_QUESTIONS) prose = prose.replace(pattern, "");
	return prose.includes("?");
}

function criteriaGaps(criteria: string[]): string[] {
	if (criteria.length === 0) return [NO_CRITERIA];
	const gaps: string[] = [];
	if (criteria.length > MAX_CRITERIA) {
		gaps.push(
			`Too many acceptance criteria: the ticket has ${criteria.length} and the limit is at most three, so separate the behaviour clusters into atomic vertical tickets`,
		);
	}
	const loose = criteria.find((line) => !GIVEN_WHEN_THEN.test(line));
	if (loose !== undefined) {
		gaps.push(
			`Acceptance criterion "${loose}" does not follow Given/When/Then: write every criterion on one line as Given <state>, When <action>, Then <outcome>`,
		);
	}
	return gaps;
}

function sizeWarnings(text: string): string[] {
	const lines = text.split("\n").length;
	if (lines <= SIZE_WARN_LINES && text.length <= SIZE_WARN_CHARS) return [];
	return [
		`Draft is large at ${lines} lines and ${text.length} characters; smaller slices are easier to build and review`,
	];
}

export async function verifyTicket(
	draftPathOrText: string,
): Promise<TicketCheck> {
	const text = await readDraft(draftPathOrText);
	const missing = REQUIRED_SECTIONS.filter(
		(name) => !headingFor(name).test(text),
	).map(sectionGap);
	missing.push(...criteriaGaps(acceptanceCriterionLines(text)));
	const stories = countUserStories(text);
	if (stories > MAX_STORIES) {
		missing.push(
			`Too many user stories: the ticket lists ${stories} and may carry only one, so give each story a slice of its own`,
		);
	}
	return { ok: missing.length === 0, missing, warnings: sizeWarnings(text) };
}

// Fills only Out of scope and Blocked by, and only when they are the sole
// gaps; every other gap needs a person.
export function fillHousekeepingSections(
	text: string,
	missing: string[],
): string | null {
	const names = missing.map((gap) => HOUSEKEEPING.get(gap));
	if (names.length === 0 || names.includes(undefined)) return null;
	const appended = names.map((name) => `\n## ${name}\nNone.\n`).join("");
	return `${text.trimEnd()}\n${appended}`;
}

const USAGE =
	"usage: verify-ticket [--fill-housekeeping] <draftPath|draftText>";

function report(value: object, code: number): number {
	console.log(JSON.stringify(value));
	return code;
}

async function main(args: string[]): Promise<number> {
	const fill = args[0] === "--fill-housekeeping";
	const input = fill ? args[1] : args[0];
	if (!input) {
		console.error(USAGE);
		return 2;
	}
	const result = await verifyTicket(input);
	if (result.ok) return report(result, 0);
	if (!fill || input.includes("\n") || !(await isFile(input))) {
		return report(result, 1);
	}
	const filled = fillHousekeepingSections(
		await readDraft(input),
		result.missing,
	);
	if (filled === null) return report(result, 1);
	const again = await verifyTicket(filled);
	if (!again.ok) return report(result, 1);
	await writeFile(input, filled);
	return report({ ...again, filled: true }, 0);
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
