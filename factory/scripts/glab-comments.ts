import { AUDIT_PREFIX } from "./audit";

export { AUDIT_PREFIX };

// Pure helpers over a merge request's discussions; the caller pipes the JSON
// in. Anything that is not a list of discussions throws.

export interface CommentAnchor {
	path: string;
	line: number;
	side?: "new" | "old";
}

export interface MrComment {
	// The note's own id, as glab returns it.
	id: string | number;
	// The thread the note belongs to; replies are posted to this discussion.
	discussionId: string;
	// The author's display name, or the username when there is no name.
	author: string;
	body: string;
	anchor?: CommentAnchor;
}

interface GlabAuthor {
	name?: string;
	username?: string;
}

interface GlabNote {
	id?: string | number;
	author?: GlabAuthor | string;
	body?: string;
	system?: boolean;
}

interface GlabDiscussion {
	id?: string | number;
	notes?: GlabNote[];
}

export const DEFAULT_FACTORY_AUTHORS = ["factory", "delivery-bot"];
const NOT_AN_ARRAY = "glab discussions payload is not a JSON array";
const NOT_JSON = "glab discussions payload is not valid JSON";

function authorName(author: GlabNote["author"]): string {
	if (typeof author === "string") return author;
	if (!author || typeof author !== "object") return "";
	return author.name ?? author.username ?? "";
}

// Finds where the bracket opened at `open` closes. Brackets inside string
// literals are skipped, so a body containing `][` cannot end a page early.
function closingIndex(text: string, open: number): number {
	let depth = 0;
	let quoted = false;
	for (let at = open; at < text.length; at++) {
		const char = text.charAt(at);
		if (quoted) {
			if (char === "\\") at++;
			else if (char === '"') quoted = false;
		} else if (char === '"') {
			quoted = true;
		} else if (char === "[" || char === "{") {
			depth++;
		} else if (char === "]" || char === "}") {
			depth--;
			if (depth === 0) return at;
		}
	}
	return -1;
}

// With --paginate, glab prints each page as its own JSON array, back to back
// (`[...][...]`), so the input is a sequence of arrays rather than one value.
function readPages(text: string): unknown[] {
	const entries: unknown[] = [];
	let pages = 0;
	let at = 0;
	while (at < text.length) {
		const char = text.charAt(at);
		if (char === " " || char === "\n" || char === "\r" || char === "\t") {
			at++;
			continue;
		}
		if (char !== "[") throw new Error(NOT_AN_ARRAY);
		const end = closingIndex(text, at);
		if (end < 0) throw new Error(NOT_JSON);
		let page: unknown;
		try {
			page = JSON.parse(text.slice(at, end + 1));
		} catch {
			throw new Error(NOT_JSON);
		}
		if (!Array.isArray(page)) throw new Error(NOT_AN_ARRAY);
		entries.push(...page);
		pages++;
		at = end + 1;
	}
	if (pages === 0) throw new Error(NOT_JSON);
	return entries;
}

// The input is glab's discussions payload (threads of notes). The result has
// one entry per human note; GitLab's system notes are left out.
export function parseMrComments(payload: string): MrComment[] {
	return readPages(payload).flatMap((entry) => {
		const thread = entry as GlabDiscussion;
		const discussionId = String(thread.id ?? "");
		const notes = Array.isArray(thread.notes) ? thread.notes : [];
		return notes
			.filter((note) => note.system !== true)
			.map((note) => ({
				id: note.id ?? "",
				discussionId,
				author: authorName(note.author),
				body: note.body ?? "",
			}));
	});
}

const isAuditNote = (comment: MrComment) =>
	comment.body.startsWith(AUDIT_PREFIX);

export function excludeHoldoutNote(notes: MrComment[]): MrComment[] {
	return notes.filter((comment) => !isAuditNote(comment));
}

// An audit reply from a factory author means this thread was already handled.
// Everything up to that reply is dropped, including the human note it
// answered, so a rerun does not classify and answer it again. Later human
// notes in the thread are new and stay.
export function excludeHandledThreads(
	comments: MrComment[],
	factoryAuthors: ReadonlySet<string> = new Set(DEFAULT_FACTORY_AUTHORS),
): MrComment[] {
	const handledUpTo = new Map<string, number>();
	for (const [index, comment] of comments.entries()) {
		if (isAuditNote(comment) && factoryAuthors.has(comment.author)) {
			handledUpTo.set(comment.discussionId, index);
		}
	}
	return comments.filter((comment, index) => {
		if (isAuditNote(comment)) return false;
		const last = handledUpTo.get(comment.discussionId);
		return last === undefined || index > last;
	});
}

if (import.meta.main) {
	try {
		const authorList =
			process.env.DELIVERY_FACTORY_AUTHORS ?? DEFAULT_FACTORY_AUTHORS.join(",");
		const authors = new Set(
			authorList
				.split(",")
				.map((name) => name.trim())
				.filter((name) => name !== ""),
		);
		const notes = parseMrComments(await Bun.stdin.text());
		console.log(JSON.stringify(excludeHandledThreads(notes, authors)));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
