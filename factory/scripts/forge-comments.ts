export {
	AUDIT_PREFIX,
	excludeHandledThreads,
	type CommentAnchor,
	type MrComment,
} from "./glab-comments";
import { ForgeDiscussions } from "./forge-provider";
import { type MrComment, excludeHandledThreads } from "./glab-comments";

export function parseForgeDiscussions(input: unknown): MrComment[] {
	const result = ForgeDiscussions.parse(input);
	return result.discussions.flatMap((discussion) => {
		if (discussion.resolved) return [];
		return discussion.notes
			.filter((note) => !note.system && !note.resolved)
			.map((note) => ({
				id: note.id,
				discussionId: discussion.id,
				author: note.author,
				body: note.body,
				...(note.anchor ? { anchor: note.anchor } : {}),
			}));
	});
}

export interface ScriptedOutdatedComment {
	commentId: string;
	classification: "outdated";
	reasoning: string;
}

export interface ScopedComments {
	inScope: MrComment[];
	outdated: ScriptedOutdatedComment[];
}

function lineCount(contents: string): number {
	if (contents.length === 0) return 0;
	const lines = contents.split("\n");
	return contents.endsWith("\n") ? lines.length - 1 : lines.length;
}

const ACK_BODIES = new Set([
	"lgtm",
	"looks good",
	"looks good to me",
	"+1",
	"thanks",
	"thank you",
	"approved",
	"ship it",
	"nice",
	"nice work",
	"sgtm",
	"ditto",
	"done",
	"fixed",
	"addressed",
	"agreed",
	"see above",
	"same",
]);

function ackOnly(body: string): boolean {
	const normalised = body
		.trim()
		.replace(/[.!]+$/g, "")
		.trim()
		.toLowerCase();
	return ACK_BODIES.has(normalised);
}

function mentionOnly(body: string): boolean {
	return /^@[A-Za-z0-9._-]+$/.test(body.trim());
}

function urlOnly(body: string): boolean {
	const trimmed = body.trim();
	return (
		/^https?:\/\/\S+$/i.test(trimmed) ||
		/^\[[^\]]*\]\(https?:\/\/[^)]+\)$/i.test(trimmed)
	);
}

function emojiOnly(body: string): boolean {
	const trimmed = body.trim();
	if (trimmed === "") return false;
	const stripped = trimmed
		.replace(/:[a-z0-9_+-]+:/gi, "")
		.replace(/\p{Extended_Pictographic}/gu, "")
		.replace(/[\uFE0F\u200D\u20E3]/g, "")
		.replace(/\s+/g, "");
	return stripped === "";
}

function appliedSuggestion(body: string, contents: string): boolean {
	const trimmed = body.trim();
	const match = /^```suggestion[^\n]*\n([\s\S]*?)^```$/m.exec(trimmed);
	if (!match || match[0] !== trimmed) return false;
	const suggestion = (match[1] ?? "").replace(/\n$/, "");
	if (suggestion.trim() === "") return false;
	return contents.includes(suggestion);
}

export function scopeComments(
	comments: MrComment[],
	headFiles: Record<string, string | null>,
): ScopedComments {
	const inScope: MrComment[] = [];
	const outdated: ScriptedOutdatedComment[] = [];
	for (const comment of comments) {
		if (comment.body.trim() === "") {
			outdated.push({
				commentId: String(comment.id),
				classification: "outdated",
				reasoning: "comment body is empty",
			});
			continue;
		}
		if (ackOnly(comment.body)) {
			outdated.push({
				commentId: String(comment.id),
				classification: "outdated",
				reasoning: "comment is only an acknowledgement",
			});
			continue;
		}
		if (mentionOnly(comment.body)) {
			outdated.push({
				commentId: String(comment.id),
				classification: "outdated",
				reasoning: "comment is only a mention",
			});
			continue;
		}
		if (urlOnly(comment.body)) {
			outdated.push({
				commentId: String(comment.id),
				classification: "outdated",
				reasoning: "comment is only a URL",
			});
			continue;
		}
		if (emojiOnly(comment.body)) {
			outdated.push({
				commentId: String(comment.id),
				classification: "outdated",
				reasoning: "comment is only emoji",
			});
			continue;
		}
		const anchor = comment.anchor;
		if (!anchor || anchor.side === "old") {
			inScope.push(comment);
			continue;
		}
		if (!(anchor.path in headFiles)) {
			inScope.push(comment);
			continue;
		}
		const contents = headFiles[anchor.path];
		const id = String(comment.id);
		if (contents === null) {
			outdated.push({
				commentId: id,
				classification: "outdated",
				reasoning: `anchor path ${anchor.path} is missing at the pinned head`,
			});
			continue;
		}
		if (typeof contents !== "string") {
			throw new Error(
				`head-files.json value for ${anchor.path} must be a string or null`,
			);
		}
		const lines = lineCount(contents);
		if (anchor.line > lines) {
			outdated.push({
				commentId: id,
				classification: "outdated",
				reasoning: `anchor line ${anchor.line} is past the end of ${anchor.path} (${lines} lines)`,
			});
			continue;
		}
		if (appliedSuggestion(comment.body, contents)) {
			outdated.push({
				commentId: id,
				classification: "outdated",
				reasoning: `suggestion is already present in ${anchor.path}`,
			});
			continue;
		}
		inScope.push(comment);
	}
	return { inScope, outdated };
}

const USAGE = [
	"usage: forge-comments.ts",
	"       forge-comments.ts scope <comments.json> <head-files.json>",
].join("\n");

if (import.meta.main) {
	const [command, commentsPath, filesPath] = process.argv.slice(2);
	try {
		if (command === "scope") {
			if (!commentsPath || !filesPath) {
				console.error(USAGE);
				process.exit(2);
			}
			const comments = JSON.parse(
				await Bun.file(commentsPath).text(),
			) as MrComment[];
			if (!Array.isArray(comments)) {
				throw new Error("comments.json must be an array");
			}
			const headFiles = JSON.parse(await Bun.file(filesPath).text()) as Record<
				string,
				string | null
			>;
			if (
				headFiles === null ||
				typeof headFiles !== "object" ||
				Array.isArray(headFiles)
			) {
				throw new Error(
					"head-files.json must be an object of path to contents or null",
				);
			}
			console.log(JSON.stringify(scopeComments(comments, headFiles), null, 2));
			process.exit(0);
		}
		if (command) {
			console.error(USAGE);
			process.exit(2);
		}
		const input = await new Response(Bun.stdin.stream()).text();
		const authors = new Set(
			(process.env.DELIVERY_FACTORY_AUTHORS ?? "factory,delivery-bot")
				.split(",")
				.map((author) => author.trim())
				.filter(Boolean),
		);
		const comments = excludeHandledThreads(
			parseForgeDiscussions(JSON.parse(input) as unknown),
			authors,
		);
		console.log(JSON.stringify(comments));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
