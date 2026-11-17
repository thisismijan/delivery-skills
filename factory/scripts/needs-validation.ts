import { createHash } from "node:crypto";
import { sanitizeHumanText } from "./human-text";
import { isLedgerTime, sectionEntries } from "./ledger-store";
import {
	type NeedsValidationAcknowledgement,
	type NeedsValidationItem,
	openNeedsValidation,
} from "./readiness-decision";
import { MAX_MARKER } from "./stage3-readiness";

export type { NeedsValidationAcknowledgement, NeedsValidationItem };

export const NEEDS_VALIDATION_HEADING = "### Needs validation";
export const NEEDS_VALIDATION_ACK_PHRASE = "acknowledged needs-validation";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const NEEDS_VALIDATION_CHECK_INVOCATION = "scripts/needs-validation.ts <iid> <head> <max-pass> <ledger> <previous-max-pass>";

const EARLIER_FINDINGS_HEADING = "### Earlier findings";
const SECTION_END = /^#{1,6}\s/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s/;
// A severity label or finding tag anywhere in a line is a finding. Taking a
// line that only starts with one would leave a prefix the reader cannot list.
const MISPLACED_LABEL = /\[(?:critical|high|medium|low|bug|approach|nit)\]/i;
const ITEM_HEAD = /^\s*\d+[.)]\s+\*\*`([^`]+)`\s*[—–-]\s*(.+?)\s*\*\*\s*$/;
const CLOSED_HEAD =
	/^\s*\d+[.)]\s+\*\*`([^`]+)`\s*[—–-]\s*closed:\s*(.+?)\s*\*\*\s*$/i;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FACT_LINE = /^\s*\*\*Missing fact:\*\*\s*(.*)$/i;
const CHECK_LINE = /^\s*\*\*Owner check:\*\*\s*(.*)$/i;
const ACKNOWLEDGEMENT_LINE = new RegExp(
	`^- (\\S+) !(\\d+) — ${NEEDS_VALIDATION_ACK_PHRASE} (NV-[0-9a-f]{8}) — (.+?) — "(.*)"$`,
);

type Fence = { char: string; size: number };

function openingFence(line: string): Fence | null {
	const match = FENCE_LINE.exec(line);
	const run = match?.[1];
	if (!run) return null;
	if (run.startsWith("`") && (match?.[2] ?? "").includes("`")) return null;
	return { char: run.charAt(0), size: run.length };
}

function closesFence(line: string, fence: Fence): boolean {
	const run = FENCE_CLOSE.exec(line)?.[1];
	return run?.startsWith(fence.char) === true && run.length >= fence.size;
}

type Placement = { line: string; target: "rest" | "drop" | number };

interface Scan {
	rest: string;
	sections: string[][];
	codeBlock: boolean;
	misplaced: boolean;
}

function scanSections(
	markdown: string,
	heading: string,
	findMisplaced: boolean,
): Scan {
	const wanted = heading.toLowerCase();
	const placed: Placement[] = [];
	let sectionCount = 0;
	let current: number | null = null;
	let fence: Fence | null = null;
	let codeAt = -1;
	let misplacedOpen = false;
	let misplaced = false;
	for (const line of markdown.split("\n")) {
		if (fence) {
			placed.push({ line, target: current ?? "rest" });
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		const text = line.trim();
		if (
			current !== null &&
			(SECTION_END.test(line) || text.startsWith("<!--"))
		) {
			current = null;
			misplacedOpen = false;
		}
		// A heading starts a section only at column 0, the same rule the earlier
		// walk uses, so the two readers never claim the same line.
		if (current === null && line.trimEnd().toLowerCase() === wanted) {
			current = sectionCount++;
			placed.push({ line, target: "drop" });
			continue;
		}
		const opening = openingFence(line);
		if (opening) {
			fence = opening;
			// An item holds no code block, and its lines cannot be told from finding
			// text, so the review from the block on is read as review text.
			if (current !== null && codeAt < 0) codeAt = placed.length;
		}
		let target: Placement["target"] = current ?? "rest";
		if (current !== null && findMisplaced) {
			if (MISPLACED_LABEL.test(line)) {
				misplacedOpen = true;
				misplaced = true;
				target = "rest";
			} else if (
				!opening &&
				misplacedOpen &&
				text !== "" &&
				!LIST_MARKER.test(line)
			) {
				target = "rest";
			} else {
				misplacedOpen = false;
			}
		} else if (opening) {
			misplacedOpen = false;
		}
		placed.push({ line, target });
	}
	const codeBlock = codeAt >= 0;
	if (codeBlock) {
		for (let index = codeAt; index < placed.length; index++) {
			const entry = placed[index];
			if (entry) entry.target = "rest";
		}
	}
	const sections: string[][] = Array.from({ length: sectionCount }, () => []);
	const rest: string[] = [];
	// Lines taken out of the review leave a heading behind, so a finding that
	// continues across the gap cannot run on into the text after it.
	let gap = false;
	for (const { line, target } of placed) {
		if (target === "rest") {
			if (gap && rest.length > 0) rest.push(NEEDS_VALIDATION_HEADING);
			gap = false;
			rest.push(line);
		} else {
			gap = true;
			if (target !== "drop") sections[target]?.push(line);
		}
	}
	return { rest: rest.join("\n"), sections, codeBlock, misplaced };
}

export function splitNeedsValidation(markdown: string): {
	rest: string;
	sections: string[];
} {
	const scan = scanSections(markdown, NEEDS_VALIDATION_HEADING, true);
	return {
		rest: scan.rest,
		sections: scan.sections.map((lines) => lines.join("\n")),
	};
}

export function needsValidationId(path: string, missingFact: string): string {
	const normalizedPath = path.trim().replace(/^\.\//, "");
	const normalizedFact = missingFact
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase()
		.replace(/[.;:]+$/, "")
		.trim();
	const digest = createHash("sha256")
		.update(`${normalizedPath}\n${normalizedFact}`)
		.digest("hex");
	return `NV-${digest.slice(0, 8)}`;
}

function firstWords(text: string): string {
	return text.trim().split(/\s+/).slice(0, 6).join(" ");
}

type Draft =
	| {
			kind: "item";
			path: string;
			title: string;
			fact: string[];
			check: string[];
			field: "fact" | "check" | null;
	  }
	| { kind: "other" };

function completeItems(
	drafts: Draft[],
	problems: string[],
): NeedsValidationItem[] {
	const items: NeedsValidationItem[] = [];
	for (const draft of drafts) {
		if (draft.kind !== "item") continue;
		const missingFact = draft.fact.join("\n").trim();
		const ownerCheck = draft.check.join("\n").trim();
		if (!missingFact) {
			problems.push(
				`The needs-validation item "${draft.title}" has no missing fact.`,
			);
		}
		if (!ownerCheck) {
			problems.push(
				`The needs-validation item "${draft.title}" has no owner check.`,
			);
		}
		if (!missingFact || !ownerCheck) continue;
		items.push({
			id: needsValidationId(draft.path, missingFact),
			path: draft.path,
			title: draft.title,
			missingFact,
			ownerCheck,
		});
	}
	return items;
}

function readSection(lines: string[], problems: string[]): Draft[] {
	const drafts: Draft[] = [];
	let current: Draft | null = null;
	const attach = (line: string): boolean => {
		if (current?.kind === "other") return true;
		if (current?.kind === "item" && current.field) {
			(current.field === "fact" ? current.fact : current.check).push(
				line.trim(),
			);
			return true;
		}
		return false;
	};
	const stray = (line: string) => {
		problems.push(
			`The needs-validation section has text that is not part of an item: "${firstWords(line)}".`,
		);
		current = { kind: "other" };
		drafts.push(current);
	};
	for (const line of lines) {
		if (line.trim() === "") continue;
		const head = ITEM_HEAD.exec(line);
		if (head) {
			current = {
				kind: "item",
				path: head[1] ?? "",
				title: (head[2] ?? "").trim(),
				fact: [],
				check: [],
				field: null,
			};
			drafts.push(current);
			continue;
		}
		const numbered = NUMBERED.exec(line);
		if (numbered) {
			problems.push(
				`The needs-validation entry "${(numbered[1] ?? "").replace(/\*\*/g, "").trim()}" does not start with a file path.`,
			);
			current = { kind: "other" };
			drafts.push(current);
			continue;
		}
		const fact = FACT_LINE.exec(line);
		const check = CHECK_LINE.exec(line);
		if (fact || check) {
			if (current?.kind === "item") {
				current.field = fact ? "fact" : "check";
				const text = (fact?.[1] ?? check?.[1] ?? "").trim();
				if (text) (fact ? current.fact : current.check).push(text);
			} else if (current === null) {
				stray(line);
			}
			continue;
		}
		if (/^\s/.test(line) && attach(line)) continue;
		stray(line);
	}
	return drafts;
}

// True when a code block opened anywhere in the review is never closed, so the
// text after it is hidden from the section reader.
export function hasUnclosedCodeBlock(markdown: string): boolean {
	let fence: Fence | null = null;
	for (const line of markdown.split("\n")) {
		if (fence) {
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		fence = openingFence(line);
	}
	return fence !== null;
}

function isField(line: string): boolean {
	return FACT_LINE.test(line) || CHECK_LINE.test(line);
}

function fieldLines(lines: string[]): number {
	return lines.filter(isField).length;
}

// Field lines that are not quoted inside a code block.
function fieldLinesOutsideFences(markdown: string): number {
	let fence: Fence | null = null;
	let count = 0;
	for (const line of markdown.split("\n")) {
		if (fence) {
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		const opening = openingFence(line);
		if (opening) {
			fence = opening;
			continue;
		}
		if (isField(line)) count++;
	}
	return count;
}

export function parseNeedsValidationItems(markdown: string): {
	items: NeedsValidationItem[];
	problems: string[];
} {
	const scan = scanSections(markdown, NEEDS_VALIDATION_HEADING, true);
	const problems: string[] = [];
	const drafts = scan.sections.flatMap((lines) => readSection(lines, problems));
	if (!scan.codeBlock && hasUnclosedCodeBlock(markdown)) {
		problems.push(
			"The review has a code block that is never closed, so its text after the block cannot be read.",
		);
	}
	// A missing-fact or owner-check line outside the section means its item is
	// not being read, for example under another heading or after a sub-heading.
	const allFields = fieldLinesOutsideFences(markdown);
	const inSections = fieldLines(scan.sections.flat());
	const closedFacts = walkEarlier(markdown).factLines;
	if (allFields > inSections + closedFacts) {
		problems.push(
			"A missing-fact or owner-check line sits outside the needs-validation section, so its item cannot be read. Check the section heading, that no sub-heading or comment splits the section, and that an earlier finding with a missing-fact line has `closed:` in its title.",
		);
	}
	if (scan.codeBlock) {
		problems.push(
			"The needs-validation section has a code block. An item must not contain one, so write its owner check as one line.",
		);
	}
	// A labelled line leaves the section, and the item it belongs to with it, so
	// any label at all is a problem, whatever its severity.
	if (scan.misplaced) {
		problems.push(
			"The needs-validation section has a severity label or finding tag in an item. Remove it from the section so the item can be read.",
		);
	}
	const items: NeedsValidationItem[] = [];
	const seen = new Set<string>();
	for (const item of completeItems(drafts, problems)) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		items.push(item);
	}
	return { items, problems };
}

interface EarlierLine {
	text: string;
	fact: boolean;
}

interface EarlierEntry {
	path: string;
	title: string;
	fact: string[];
}

interface EarlierWalk {
	lines: EarlierLine[];
	closed: NeedsValidationItem[];
	problems: string[];
	// Missing-fact lines of closed entries, the only field lines the earlier
	// findings section may hold outside the needs-validation section.
	factLines: number;
}

// The one reader of the earlier findings section. The closed items and the text
// that stage 3 searches for blockers both come from this walk, so they cannot
// disagree. Fences are tracked on every line, so a heading or a label inside a
// code block is never read as structure. A code block inside the section is a
// problem, so the review is kept as a draft.
function walkEarlier(markdown: string): EarlierWalk {
	const lines: EarlierLine[] = [];
	const closed: NeedsValidationItem[] = [];
	const problems: string[] = [];
	let inEarlier = false;
	let entry: EarlierEntry | null = null;
	let capturing = false;
	let fence: Fence | null = null;
	let codeInEarlier = false;
	let labelInEarlier = false;
	let factLines = 0;
	let checkInEntry = false;
	const finish = () => {
		if (!entry) return;
		const missingFact = entry.fact.join("\n").trim();
		if (!missingFact) {
			problems.push(
				`The closed needs-validation entry "${entry.title}" has no missing fact.`,
			);
		} else {
			closed.push({
				id: needsValidationId(entry.path, missingFact),
				path: entry.path,
				title: entry.title,
				missingFact,
				ownerCheck: "",
			});
		}
		entry = null;
	};
	for (const line of markdown.split("\n")) {
		if (fence) {
			lines.push({ text: line, fact: false });
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		const opening = openingFence(line);
		if (opening) {
			capturing = false;
			fence = opening;
			if (inEarlier && entry !== null) codeInEarlier = true;
			lines.push({ text: line, fact: false });
			continue;
		}
		const text = line.trim();
		if (SECTION_END.test(line) || text.startsWith("<!--")) {
			finish();
			capturing = false;
			inEarlier = text.toLowerCase() === EARLIER_FINDINGS_HEADING.toLowerCase();
			lines.push({ text: line, fact: false });
			continue;
		}
		if (!inEarlier) {
			lines.push({ text: line, fact: false });
			continue;
		}
		if (CLOSED_HEAD.test(line) || NUMBERED.test(line)) {
			finish();
			const head = CLOSED_HEAD.exec(line);
			if (head) {
				entry = {
					path: head[1] ?? "",
					title: (head[2] ?? "").trim(),
					fact: [],
				};
			}
			capturing = false;
			lines.push({ text: line, fact: false });
			continue;
		}
		if (!entry) {
			lines.push({ text: line, fact: false });
			continue;
		}
		// A closed entry keeps only its missing fact. An owner check written under
		// it is text, not a fact, so it is never read into the fact or its id.
		if (CHECK_LINE.test(line)) {
			checkInEntry = true;
			capturing = false;
			lines.push({ text: line, fact: false });
			continue;
		}
		const fact = FACT_LINE.exec(line);
		if (fact && MISPLACED_LABEL.test(line)) {
			factLines++;
			labelInEarlier = true;
			capturing = false;
			lines.push({ text: line, fact: false });
			continue;
		}
		if (fact) {
			factLines++;
			capturing = true;
			const first = (fact[1] ?? "").trim();
			if (first) entry.fact.push(first);
			lines.push({ text: line, fact: true });
			continue;
		}
		if (capturing && MISPLACED_LABEL.test(line)) {
			labelInEarlier = true;
			capturing = false;
		} else if (capturing && line.trim() !== "" && /^\s/.test(line)) {
			entry.fact.push(line.trim());
			lines.push({ text: line, fact: true });
			continue;
		} else if (line.trim() !== "" && !/^\s/.test(line)) {
			capturing = false;
		}
		lines.push({ text: line, fact: false });
	}
	finish();
	if (codeInEarlier) {
		problems.push(
			"The earlier findings section has a code block. A closed entry must not contain one.",
		);
	}
	if (checkInEntry) {
		problems.push(
			"The earlier findings section has an owner-check line in a closed entry. A closed entry keeps only its missing fact, so remove the line.",
		);
	}
	if (labelInEarlier) {
		problems.push(
			"The earlier findings section has a severity label or finding tag in a closed entry's missing fact. Remove it so the entry can be read.",
		);
	}
	return { lines, closed, problems, factLines };
}

export function parseClosedNeedsValidation(markdown: string): {
	closed: NeedsValidationItem[];
	problems: string[];
} {
	const walk = walkEarlier(markdown);
	return { closed: walk.closed, problems: walk.problems };
}

export function withoutClosedFacts(markdown: string): string {
	return walkEarlier(markdown)
		.lines.filter((line) => !line.fact)
		.map((line) => line.text)
		.join("\n");
}

export function needsValidationAcknowledgements(
	ledger: string,
): NeedsValidationAcknowledgement[] {
	const acknowledgements: NeedsValidationAcknowledgement[] = [];
	for (const line of sectionEntries(ledger, "## approvals")) {
		const match = ACKNOWLEDGEMENT_LINE.exec(line);
		if (!match) continue;
		const [, time, iid, itemId, acknowledgedBy, words] = match;
		if (!time || !isLedgerTime(time)) continue;
		acknowledgements.push({
			iid: iid ?? "",
			itemId: itemId ?? "",
			acknowledgedBy: acknowledgedBy ?? "",
			words: words ?? "",
		});
	}
	return acknowledgements;
}

export interface NeedsValidationCheckInput {
	iid: string;
	head: string;
	maxPass: string;
	ledger: string | null;
	previousMaxPass: string | null;
	workerJournal: boolean;
}

export interface NeedsValidationCheckItem extends NeedsValidationItem {
	acknowledged: boolean;
}

export interface NeedsValidationCheck {
	items: NeedsValidationCheckItem[];
	closed: NeedsValidationItem[];
	open: NeedsValidationItem[];
	problems: string[];
	ledgerRead: boolean;
}

function lastNonBlankLine(text: string): string {
	const lines = text.split("\n").filter((line) => line.trim() !== "");
	return (lines.at(-1) ?? "").trim();
}

function notThisReview(input: NeedsValidationCheckInput): string | null {
	if (input.maxPass.trim() === "") return "The code review file is empty.";
	const marker = MAX_MARKER.exec(lastNonBlankLine(input.maxPass));
	if (!marker) return "The code review does not end with its review marker.";
	if (marker[1] !== input.iid) {
		return "The code review is for a different merge request.";
	}
	if ((marker[2] ?? "").toLowerCase() !== input.head.toLowerCase()) {
		return "The code review is for a different commit.";
	}
	if (!/\*\*Verdict:\*\*\s*\S/i.test(input.maxPass)) {
		return "The code review has no verdict.";
	}
	return null;
}

export function checkNeedsValidation(
	input: NeedsValidationCheckInput,
): NeedsValidationCheck {
	const ledgerRead = !input.workerJournal && input.ledger !== null;
	const refused = notThisReview(input);
	if (refused) {
		return { items: [], closed: [], open: [], problems: [refused], ledgerRead };
	}
	const parsed = parseNeedsValidationItems(input.maxPass);
	const closedParsed = parseClosedNeedsValidation(input.maxPass);
	const problems = [...parsed.problems, ...closedParsed.problems];
	if (input.previousMaxPass !== null) {
		const earlier = parseNeedsValidationItems(input.previousMaxPass);
		for (const problem of earlier.problems) {
			problems.push(`In the earlier code review: ${problem}`);
		}
		const accounted = new Set([
			...parsed.items.map((item) => item.id),
			...closedParsed.closed.map((item) => item.id),
		]);
		for (const item of earlier.items) {
			if (accounted.has(item.id)) continue;
			problems.push(
				`The earlier code review raised "${item.title}" in ${item.path}, and this review neither lists it again nor closes it.`,
			);
		}
	}
	const acknowledgements =
		ledgerRead && input.ledger !== null
			? needsValidationAcknowledgements(input.ledger)
			: [];
	const open = openNeedsValidation(input.iid, parsed.items, acknowledgements);
	const openIds = new Set(open.map((item) => item.id));
	return {
		items: parsed.items.map((item) => ({
			...item,
			acknowledged: !openIds.has(item.id),
		})),
		closed: closedParsed.closed,
		open,
		problems,
		ledgerRead,
	};
}

function print(result: NeedsValidationCheck): void {
	console.log(
		JSON.stringify(result, (_key, value) =>
			typeof value === "string" ? sanitizeHumanText(value) : value,
		),
	);
	for (const problem of result.problems) {
		console.error(sanitizeHumanText(problem));
	}
}

async function readFile(path: string, what: string): Promise<string> {
	try {
		return await Bun.file(path).text();
	} catch {
		throw new Error(`The ${what} could not be read.`);
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const [iid, head, maxPath, ledgerPath, previousPath] = args;
	if (
		args.length !== 5 ||
		!iid ||
		!head ||
		!maxPath ||
		!ledgerPath ||
		!previousPath
	) {
		console.error(`usage: ${NEEDS_VALIDATION_CHECK_INVOCATION}`);
		process.exit(2);
	}
	if (!/^\d+$/.test(iid) || !/^[0-9a-f]{40}$/i.test(head)) {
		console.error(
			`usage: ${NEEDS_VALIDATION_CHECK_INVOCATION} (the merge request number is digits and the head is a full commit)`,
		);
		process.exit(2);
	}
	const workerJournal = Boolean(process.env.DELIVERY_WORKER_JOURNAL);
	let result: NeedsValidationCheck;
	try {
		const maxPass = await readFile(maxPath, "code review file");
		const ledger =
			workerJournal || ledgerPath === "-"
				? null
				: await readFile(ledgerPath, "run ledger");
		const previousMaxPass =
			previousPath === "-"
				? null
				: await readFile(previousPath, "earlier code review file");
		result = checkNeedsValidation({
			iid,
			head,
			maxPass,
			ledger,
			previousMaxPass,
			workerJournal,
		});
	} catch (error) {
		result = {
			items: [],
			closed: [],
			open: [],
			problems: [error instanceof Error ? error.message : String(error)],
			ledgerRead: false,
		};
	}
	print(result);
	if (result.problems.length > 0) process.exit(2);
	process.exit(result.open.length > 0 ? 1 : 0);
}
