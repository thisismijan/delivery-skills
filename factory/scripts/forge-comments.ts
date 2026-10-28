export {
	AUDIT_PREFIX,
	excludeHandledThreads,
	type CommentAnchor,
	type MrComment,
} from "./glab-comments";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
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
	"ack",
]);

function ackOnly(body: string): boolean {
	const tokens = body
		.trim()
		.toLowerCase()
		.split(/[\s,]+/)
		.map((token) => token.replace(/[.!]+$/g, ""))
		.filter(Boolean);
	return tokens.length > 0 && tokens.every((token) => ACK_BODIES.has(token));
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
		.replace(/\uFE0F|\u200D|\u20E3/g, "")
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

export type SuggestionPlan =
	| { apply: "script"; path: string; contents: string }
	| { apply: "model"; reason: string };

export function planSuggestion(
	comment: MrComment,
	contents: string | null,
): SuggestionPlan {
	const anchor = comment.anchor;
	if (!anchor || anchor.side !== "new") {
		return { apply: "model", reason: "comment has no new-side anchor" };
	}
	const match = /^```suggestion(?::-(\d+)\+(\d+))?\n([\s\S]*?)\n?```$/.exec(
		comment.body.trim(),
	);
	if (!match) {
		return { apply: "model", reason: "body is not one suggestion fence" };
	}
	const suggestion = match[3] ?? "";
	if (suggestion.trim() === "") {
		return { apply: "model", reason: "suggestion is empty" };
	}
	if (contents === null) {
		return { apply: "model", reason: `${anchor.path} is missing` };
	}
	const eol = contents.includes("\r\n") ? "\r\n" : "\n";
	const lines = contents.split(eol);
	const trailing = contents.endsWith(eol);
	const count = trailing ? lines.length - 1 : lines.length;
	if (anchor.line < 1 || anchor.line > count) {
		return {
			apply: "model",
			reason: `line ${anchor.line} is outside ${anchor.path}`,
		};
	}
	const before = match[1] === undefined ? 0 : Number(match[1]);
	const after = match[2] === undefined ? 0 : Number(match[2]);
	const startLine = anchor.line - before;
	const endLine = anchor.line + after;
	if (startLine < 1 || endLine > count) {
		return {
			apply: "model",
			reason: `range ${startLine}-${endLine} is outside ${anchor.path}`,
		};
	}
	const replacement = suggestion.split("\n");
	const next = [...lines];
	next.splice(startLine - 1, endLine - startLine + 1, ...replacement);
	if (next.join(eol) === lines.join(eol)) {
		return { apply: "model", reason: "suggestion is already applied" };
	}
	return { apply: "script", path: anchor.path, contents: next.join(eol) };
}

function insideRoot(root: string, path: string): string | null {
	if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) return null;
	const full = resolve(root, path);
	const rel = relative(root, full);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
	return full;
}

export async function applySuggestion(
	comment: MrComment,
	repoRoot: string,
): Promise<
	{ apply: "script"; path: string } | { apply: "model"; reason: string }
> {
	const anchorPath = comment.anchor?.path;
	if (!anchorPath) {
		return { apply: "model", reason: "comment has no new-side anchor" };
	}
	const root = await realpath(repoRoot);
	const full = insideRoot(root, anchorPath);
	if (!full) {
		return {
			apply: "model",
			reason: `${anchorPath} is outside the repository`,
		};
	}
	let contents: string | null = null;
	try {
		const info = await lstat(full);
		if (!info.isFile()) {
			return { apply: "model", reason: `${anchorPath} is not a regular file` };
		}
		if ((await realpath(full)) !== full) {
			return {
				apply: "model",
				reason: `${anchorPath} is outside the repository`,
			};
		}
		contents = await readFile(full, "utf8");
	} catch {
		contents = null;
	}
	const plan = planSuggestion(comment, contents);
	if (plan.apply === "model") return plan;
	await writeFile(full, plan.contents, "utf8");
	return { apply: "script", path: plan.path };
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
	"       forge-comments.ts apply-suggestion <comment.json> <repo-root>",
].join("\n");

if (import.meta.main) {
	const [command, commentsPath, filesPath] = process.argv.slice(2);
	try {
		if (command === "apply-suggestion") {
			if (!commentsPath || !filesPath) {
				console.error(USAGE);
				process.exit(2);
			}
			const comment = JSON.parse(
				await Bun.file(commentsPath).text(),
			) as MrComment;
			if (
				comment === null ||
				typeof comment !== "object" ||
				typeof comment.body !== "string"
			) {
				throw new Error("comment.json must be one comment with a body");
			}
			console.log(
				JSON.stringify(await applySuggestion(comment, filesPath), null, 2),
			);
			process.exit(0);
		}
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
