import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ExecuteRecovery,
	type ExecuteRecoveryEvidence,
	recoverExecuting,
} from "./execute-recovery";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const NEXT_ACTION_INVOCATION = "scripts/next-action.ts <args> <status|->";

export type LedgerWriter = {
	write: (markdown: string) => void | Promise<void>;
};

export type ClassifiedEntry =
	| { kind: "bare-key"; key: string }
	| { kind: "explicit-verb"; verb: string; rest: string }
	| { kind: "unknown"; args: string }
	| { kind: "other"; args: string };

export type NextAction =
	| { kind: "run"; verb: string; singleStep: true; iid?: number }
	| { kind: "stop"; reason: string; nextCommand?: string }
	| { kind: "wait"; reason: string }
	| { kind: "escalate"; reason: string };

export type NextActionInput = {
	args: string;
	status: string | null;
	recovery?: ExecuteRecoveryEvidence;
};

const TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const IID = /^\d+$/;
const COMMAND_WORD = /^[a-z][a-z0-9-]*$/;
const ALWAYS_ALLOWED = new Set(["status", "help", "auto", "improve"]);

const VERB_KEYWORDS: Array<{ pattern: RegExp; verb: string }> = [
	{ pattern: /release readiness/i, verb: "ship" },
	{ pattern: /address comments/i, verb: "address" },
	{ pattern: /\baddress\b/i, verb: "address" },
	{ pattern: /\bdiscovery\b/i, verb: "discover" },
	{ pattern: /\bdiscover\b/i, verb: "discover" },
	{ pattern: /\bgroom\b/i, verb: "groom" },
	{ pattern: /\bdraft\b/i, verb: "draft" },
	{ pattern: /\bexecute\b/i, verb: "execute" },
	{ pattern: /\breview\b/i, verb: "review" },
	{ pattern: /\barchive\b/i, verb: "archive" },
	{ pattern: /\bverify\b/i, verb: "verify" },
	{ pattern: /\bretro\b/i, verb: "retro" },
	{ pattern: /\bimprovement\b/i, verb: "improve" },
	{ pattern: /\bimprove\b/i, verb: "improve" },
	{ pattern: /\bship\b/i, verb: "ship" },
];

function skillRoot(): string {
	return (
		process.env.DELIVERY_SKILL_ROOT ??
		join(import.meta.dir, "..", "..", "skills", "delivery")
	);
}

function readSkill(): string {
	const root = skillRoot();
	const path = existsSync(join(root, "SKILL.md"))
		? join(root, "SKILL.md")
		: join(root, "delivery-SKILL.proposed.md");
	return readFileSync(path, "utf8");
}

function readAuto(): string {
	return readFileSync(join(skillRoot(), "workflows", "auto.md"), "utf8");
}

function section(doc: string, heading: string): string {
	const lines = doc.split("\n");
	const start = lines.indexOf(heading);
	if (start < 0) throw new Error(`missing section ${heading}`);
	const level = heading.match(/^#+/)?.[0].length ?? 2;
	const body: string[] = [];
	let fenced = false;
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("```")) fenced = !fenced;
		const depth = line.match(/^(#+) /)?.[1]?.length;
		if (!fenced && depth !== undefined && depth <= level) break;
		body.push(line);
	}
	return body.join("\n");
}

function cells(line: string): string[] {
	return line
		.split(/(?<!\\)\|/)
		.map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function knownVerbs(skill: string): Set<string> {
	const verbs = new Set<string>();
	const table = section(skill, "## Phase 0 — Entry detection");
	for (const line of table.split("\n")) {
		if (!line.startsWith("| `^")) continue;
		const row = cells(line);
		const matchCell = row[1] ?? "";
		for (const match of matchCell.matchAll(/`(\^[^`]+)`/g)) {
			const source = match[1] ?? "";
			const names = source.match(/^\^\(?([a-z|]+)/)?.[1];
			if (!names) continue;
			for (const name of names.split("|")) {
				if (name.length > 0) verbs.add(name);
			}
		}
	}
	return verbs;
}

function normaliseTag(tag: string): string {
	return tag
		.replace(/!(N|<iid>|\d+)/g, "!N")
		.replace(/<[^>]+>|[A-Z][A-Z0-9]+-\d+/g, "<x>")
		.replace(/\s+/g, " ")
		.trim();
}

function statusMatches(actual: string, tableTag: string): boolean {
	const have = normaliseTag(actual);
	const want = normaliseTag(tableTag);
	if (have === want) return true;
	const placeholder = want.indexOf("<x>");
	if (placeholder < 0) return false;
	const prefix = want.slice(0, placeholder).trimEnd();
	return have.startsWith(prefix);
}

function firstVerb(nextCell: string, status: string): string | null {
	if (/^\s*nothing\b/i.test(nextCell)) return null;
	let best: { index: number; verb: string } | null = null;
	for (const { pattern, verb } of VERB_KEYWORDS) {
		const index = nextCell.search(pattern);
		if (index < 0) continue;
		if (best === null || index < best.index) best = { index, verb };
	}
	if (best) return best.verb;
	if (/^\[waiting:/i.test(status.trim())) return "auto";
	return null;
}

function nextVerbForStatus(status: string | null): string | null {
	if (status === null || status.trim() === "") return "draft";
	const actual = status.trim().startsWith("[")
		? status.trim()
		: `[${status.trim()}]`;
	const table = section(readAuto(), "### Next step by status");
	for (const line of table.split("\n")) {
		if (
			!line.startsWith("| ") ||
			line.startsWith("| Status") ||
			line.startsWith("|---")
		) {
			continue;
		}
		const cols = cells(line);
		const statusCell = cols[1] ?? "";
		const nextCell = cols[2] ?? "";
		if (!statusCell.startsWith("`[")) continue;
		const tableTag = statusCell.slice(1, -1);
		if (!statusMatches(actual, tableTag)) continue;
		return firstVerb(nextCell, actual);
	}
	return null;
}

function prettyVerb(verb: string): string {
	if (verb === "ship") return "Release readiness";
	if (verb === "address") return "Address comments";
	return `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
}

export function classifyEntry(args: string): ClassifiedEntry {
	const trimmed = args.trim();
	if (TICKET_KEY.test(trimmed)) {
		return { kind: "bare-key", key: trimmed };
	}
	const first = trimmed.split(/\s+/, 2)[0] ?? "";
	const rest = trimmed.slice(first.length).trim();
	const verbs = knownVerbs(readSkill());
	if (verbs.has(first)) {
		return {
			kind: "explicit-verb",
			verb: first === "build" ? "execute" : first,
			rest,
		};
	}
	if (
		COMMAND_WORD.test(first) &&
		(rest === "" || TICKET_KEY.test(rest) || IID.test(rest))
	) {
		return { kind: "unknown", args: trimmed };
	}
	return { kind: "other", args: trimmed };
}

function stopped(reason: string, nextCommand?: string): NextAction {
	return nextCommand
		? { kind: "stop", reason, nextCommand }
		: { kind: "stop", reason };
}

function isExecuting(status: string | null): boolean {
	if (status === null || status.trim() === "") return false;
	const actual = status.trim().startsWith("[")
		? status.trim()
		: `[${status.trim()}]`;
	return statusMatches(actual, "[executing]");
}

function fromExecutingRecovery(
	recovery: ExecuteRecovery,
	entry: ClassifiedEntry,
): NextAction {
	if (recovery.kind === "review") {
		if (
			entry.kind === "explicit-verb" &&
			entry.verb !== "review" &&
			!ALWAYS_ALLOWED.has(entry.verb)
		) {
			return stopped(
				`${prettyVerb(entry.verb)} is not the next step for this ticket.`,
			);
		}
		return {
			kind: "run",
			verb: "review",
			singleStep: true,
			iid: recovery.iid,
		};
	}
	if (recovery.kind === "wait") {
		return { kind: "wait", reason: recovery.reason };
	}
	if (recovery.kind === "escalate") {
		return { kind: "escalate", reason: recovery.reason };
	}
	if (entry.kind === "explicit-verb" && entry.verb === "execute") {
		return { kind: "run", verb: "execute", singleStep: true };
	}
	if (entry.kind === "explicit-verb" && !ALWAYS_ALLOWED.has(entry.verb)) {
		return stopped(
			`${prettyVerb(entry.verb)} is not the next step for this ticket.`,
		);
	}
	return stopped(recovery.reason, recovery.nextCommand);
}

export function selectNextAction(
	input: NextActionInput,
	writer?: LedgerWriter,
): NextAction {
	void writer;
	const entry = classifyEntry(input.args);
	if (entry.kind === "unknown" || entry.kind === "other") {
		return stopped("That is not a known delivery command.");
	}

	if (entry.kind === "explicit-verb" && ALWAYS_ALLOWED.has(entry.verb)) {
		return { kind: "run", verb: entry.verb, singleStep: true };
	}

	if (isExecuting(input.status)) {
		if (!input.recovery) {
			return stopped(
				"Delivery cannot tell a live execute run from a crash until the merge request and whether execute is still running have been checked.",
			);
		}
		return fromExecutingRecovery(recoverExecuting(input.recovery), entry);
	}

	const next = nextVerbForStatus(input.status);

	if (entry.kind === "bare-key") {
		if (!next) {
			return stopped("There is no next delivery step for this ticket.");
		}
		return { kind: "run", verb: next, singleStep: true };
	}

	if (!next) {
		return stopped("There is no next delivery step for this ticket.");
	}
	if (entry.verb !== next) {
		return stopped(
			`${prettyVerb(entry.verb)} is not the next step for this ticket.`,
		);
	}
	return { kind: "run", verb: entry.verb, singleStep: true };
}

if (import.meta.main) {
	const args = process.argv[2] ?? "";
	const statusArg = process.argv[3];
	const status = !statusArg || statusArg === "-" ? null : statusArg;
	const result = selectNextAction({ args, status });
	console.log(JSON.stringify(result));
	process.exit(result.kind === "run" ? 0 : 1);
}
