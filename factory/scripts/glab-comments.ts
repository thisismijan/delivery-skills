// Pure parsing/filtering helpers for MR comments gathered via `glab api`.
// No process is spawned here; the command pipes glab's JSON output in.
// Fail-closed: unparseable / non-array input throws.

export interface MrComment {
	id: string | number; // note id from glab JSON
	discussionId: string; // parent thread id, for replying via .../discussions/<id>/notes
	author: string; // display name or username of the author
	body: string; // full comment body text
}

// The audit prefix produced by auditComment(event, body) in scripts/audit.ts:
// `**ig-spec** · ${event}\n\n...`. Exclusion matches the leading marker only.
export const AUDIT_PREFIX = "**ig-spec** ·";

interface RawGlabNote {
	id?: string | number;
	author?: { name?: string; username?: string } | string;
	body?: string;
	system?: boolean;
}

interface RawGlabDiscussion {
	id?: string | number;
	notes?: RawGlabNote[];
}

function normalizeAuthor(author: RawGlabNote["author"]): string {
	if (typeof author === "string") return author;
	if (author && typeof author === "object") {
		return author.name ?? author.username ?? "";
	}
	return "";
}

// Index of the `]` closing the top-level array opening at `start`, or -1 if
// unterminated. String- and escape-aware so a `][` inside a body never misleads.
function arrayEnd(s: string, start: number): number {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let j = start; j < s.length; j++) {
		const ch = s[j];
		if (ch === undefined) break;
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "[" || ch === "{") depth++;
		else if (ch === "]" || ch === "}") {
			depth--;
			if (depth === 0) return j;
		}
	}
	return -1;
}

// `glab api --paginate` emits one JSON array PER PAGE, concatenated as adjacent
// `][` — not a single JSON document — so parse each top-level array and join
// them. Fail-closed: a non-array top-level value, malformed JSON, or trailing
// non-array content throws.
function parsePaginatedDiscussions(rawJson: string): unknown[] {
	const discussions: unknown[] = [];
	let parsedAny = false;
	let i = 0;
	while (i < rawJson.length) {
		const ch = rawJson[i];
		if (ch === undefined) break;
		if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
			i++;
			continue;
		}
		if (ch !== "[") {
			throw new Error("glab discussions payload is not a JSON array");
		}
		const end = arrayEnd(rawJson, i);
		if (end === -1) {
			throw new Error("glab discussions payload is not valid JSON");
		}
		let page: unknown;
		try {
			page = JSON.parse(rawJson.slice(i, end + 1));
		} catch {
			throw new Error("glab discussions payload is not valid JSON");
		}
		if (!Array.isArray(page)) {
			throw new Error("glab discussions payload is not a JSON array");
		}
		discussions.push(...page);
		parsedAny = true;
		i = end + 1;
	}
	if (!parsedAny) {
		throw new Error("glab discussions payload is not valid JSON");
	}
	return discussions;
}

// Input is the `discussions` payload (threads holding notes), not a flat note
// list; flattens to one entry per note (dropping GitLab system events).
export function parseMrComments(rawJson: string): MrComment[] {
	const comments: MrComment[] = [];
	for (const rawDiscussion of parsePaginatedDiscussions(rawJson)) {
		const discussion = rawDiscussion as RawGlabDiscussion;
		const discussionId = String(discussion.id ?? "");
		const notes = Array.isArray(discussion.notes) ? discussion.notes : [];
		for (const note of notes) {
			if (note.system === true) continue;
			comments.push({
				id: note.id ?? "",
				discussionId,
				author: normalizeAuthor(note.author),
				body: note.body ?? "",
			});
		}
	}
	return comments;
}

export function excludeHoldoutNote(comments: MrComment[]): MrComment[] {
	return comments.filter((c) => !c.body.startsWith(AUDIT_PREFIX));
}

if (import.meta.main) {
	const input = await new Response(Bun.stdin.stream()).text();
	try {
		const comments = excludeHoldoutNote(parseMrComments(input));
		console.log(JSON.stringify(comments));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
