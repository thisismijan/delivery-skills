import { AUDIT_PREFIX } from "./audit";

export { AUDIT_PREFIX };

// Pure parsing/filtering helpers for merge-request comments.
// No process is spawned here; the command pipes JSON input in.
// Fail-closed: unparseable / non-array input throws.

export interface MrComment {
	id: string | number; // note id from glab JSON
	discussionId: string; // parent thread id, for replying via .../discussions/<id>/notes
	author: string; // display name or username of the author
	body: string; // full comment body text
}

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

// Re-entry-safe scope: an audit reply proves this workflow already handled the
// discussion. Drop the whole thread, not just the reply, or the original human
// note would be classified and answered again on every invocation.
export function excludeHandledThreads(
	comments: MrComment[],
	factoryAuthors: ReadonlySet<string> = new Set(["factory", "delivery-bot"]),
): MrComment[] {
	const lastAuthenticatedReply = new Map<string, number>();
	comments.forEach((comment, index) => {
		if (
			comment.body.startsWith(AUDIT_PREFIX) &&
			factoryAuthors.has(comment.author)
		) {
			lastAuthenticatedReply.set(comment.discussionId, index);
		}
	});
	return comments.filter((comment, index) => {
		if (comment.body.startsWith(AUDIT_PREFIX)) return false;
		const cutoff = lastAuthenticatedReply.get(comment.discussionId);
		return cutoff === undefined || index > cutoff;
	});
}

export const DEFAULT_FACTORY_AUTHORS = "factory,delivery-bot";

// Comma-separated identity list. `fallback` applies only when the variable is
// unset; an empty value is an explicit empty list.
export function parseAuthorList(
	value: string | undefined,
	fallback = "",
): Set<string> {
	return new Set(
		(value ?? fallback)
			.split(",")
			.map((author) => author.trim())
			.filter(Boolean),
	);
}

// Review bots are automated reviewers that comment only after a change is
// posted. Their notes are review input, never the factory's own audit trail, so
// a bot identity is removed from the factory authors even when listed in both.
export function scopeAuthors(
	env: Record<string, string | undefined> = process.env,
): { factory: Set<string>; reviewBots: Set<string> } {
	const reviewBots = parseAuthorList(env.DELIVERY_REVIEW_BOTS);
	const factory = parseAuthorList(
		env.DELIVERY_FACTORY_AUTHORS,
		DEFAULT_FACTORY_AUTHORS,
	);
	for (const bot of reviewBots) factory.delete(bot);
	return { factory, reviewBots };
}

export interface UnansweredBotThread {
	discussionId: string;
	noteId: string | number;
	author: string;
}

export interface ReviewBotStatus {
	configured: boolean; // at least one review-bot identity is configured
	botHasCommented: boolean; // any configured bot authored a note on the change
	unanswered: UnansweredBotThread[];
}

// A review-bot thread is one a configured bot started. It is unanswered while
// no other author has replied after the bot's last note in it.
export function reviewBotThreads(
	comments: MrComment[],
	reviewBots: ReadonlySet<string>,
): ReviewBotStatus {
	const threads = new Map<string, MrComment[]>();
	for (const comment of comments) {
		const notes = threads.get(comment.discussionId) ?? [];
		notes.push(comment);
		threads.set(comment.discussionId, notes);
	}
	const unanswered: UnansweredBotThread[] = [];
	for (const [discussionId, notes] of threads) {
		const first = notes[0];
		if (!first || !reviewBots.has(first.author)) continue;
		let lastBot = 0;
		notes.forEach((note, index) => {
			if (reviewBots.has(note.author)) lastBot = index;
		});
		const replied = notes
			.slice(lastBot + 1)
			.some((note) => !reviewBots.has(note.author));
		const last = notes[lastBot] ?? first;
		if (!replied) {
			unanswered.push({ discussionId, noteId: last.id, author: last.author });
		}
	}
	return {
		configured: reviewBots.size > 0,
		botHasCommented: comments.some((comment) => reviewBots.has(comment.author)),
		unanswered,
	};
}

if (import.meta.main) {
	const input = await new Response(Bun.stdin.stream()).text();
	try {
		const comments = excludeHandledThreads(
			parseMrComments(input),
			scopeAuthors().factory,
		);
		console.log(JSON.stringify(comments));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
