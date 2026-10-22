import { expect, test } from "bun:test";
import {
	parseAuthorList,
	parseForgeDiscussions,
	reviewBotThreads,
	scopeAuthors,
} from "./forge-comments";
import { AUDIT_PREFIX, excludeHandledThreads } from "./glab-comments";

function discussions() {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "change-1",
		headRevision: "abc123",
		discussions: [
			{
				id: "thread-1",
				resolved: false,
				notes: [
					{
						id: "note-1",
						author: "reviewer",
						body: "Please add a test.",
						system: false,
						resolved: false,
					},
					{
						id: "event-1",
						author: "forge",
						body: "changed a label",
						system: true,
						resolved: false,
					},
				],
			},
			{
				id: "thread-2",
				resolved: false,
				notes: [
					{
						id: "note-2",
						author: "reviewer",
						body: "Explain this branch.",
						system: false,
						resolved: false,
					},
					{
						id: "reply-2",
						author: "factory",
						body: `${AUDIT_PREFIX} already handled`,
						system: false,
						resolved: false,
					},
				],
			},
		],
	};
}

test("normalized discussions flatten non-system notes and exclude handled threads", () => {
	const parsed = parseForgeDiscussions(discussions());
	expect(parsed.map((comment) => comment.id)).toEqual([
		"note-1",
		"note-2",
		"reply-2",
	]);
	expect(excludeHandledThreads(parsed).map((comment) => comment.id)).toEqual([
		"note-1",
	]);
});

test("malformed normalized discussions fail closed", () => {
	expect(() =>
		parseForgeDiscussions({ ...discussions(), headRevision: undefined }),
	).toThrow();
	expect(() =>
		parseForgeDiscussions({
			...discussions(),
			discussions: [{ id: "thread-1", notes: [] }],
		}),
	).toThrow();
});

// ---------------------------------------------------------------------------
// Review bots: automated reviewer identities that comment only after a change
// is posted. Their threads must stay in scope and be answered before queueing.
// ---------------------------------------------------------------------------

const bot = "review-bot";

function botDiscussions() {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "change-1",
		headRevision: "abc123",
		discussions: [
			{
				id: "bot-open",
				resolved: false,
				notes: [
					{
						id: "b1",
						author: bot,
						body: "Name this set.",
						system: false,
						resolved: false,
					},
				],
			},
			{
				id: "bot-answered",
				resolved: false,
				notes: [
					{
						id: "b2",
						author: bot,
						body: "Narrow this catch.",
						system: false,
						resolved: false,
					},
					{
						id: "r2",
						author: "operator",
						body: `${AUDIT_PREFIX} fixed in abc`,
						system: false,
						resolved: false,
					},
				],
			},
			{
				id: "bot-followed-up",
				resolved: false,
				notes: [
					{
						id: "b3",
						author: bot,
						body: "Extract a helper.",
						system: false,
						resolved: false,
					},
					{
						id: "r3",
						author: "operator",
						body: `${AUDIT_PREFIX} disputed`,
						system: false,
						resolved: false,
					},
					{
						id: "b3b",
						author: bot,
						body: "Still duplicated.",
						system: false,
						resolved: false,
					},
				],
			},
			{
				id: "human",
				resolved: false,
				notes: [
					{
						id: "h1",
						author: "reviewer",
						body: "Why?",
						system: false,
						resolved: false,
					},
					{
						id: "b4",
						author: bot,
						body: "Agreed.",
						system: false,
						resolved: false,
					},
				],
			},
		],
	};
}

test("parseAuthorList trims, drops blanks, and falls back only when unset", () => {
	expect([...parseAuthorList(" a , b,,", "x")]).toEqual(["a", "b"]);
	expect([...parseAuthorList(undefined, "factory,delivery-bot")]).toEqual([
		"factory",
		"delivery-bot",
	]);
	expect([...parseAuthorList("", "factory")]).toEqual([]);
});

test("review-bot identities are never treated as factory authors", () => {
	const authors = scopeAuthors({
		DELIVERY_FACTORY_AUTHORS: `operator,${bot}`,
		DELIVERY_REVIEW_BOTS: ` ${bot} `,
	});
	expect([...authors.factory]).toEqual(["operator"]);
	expect([...authors.reviewBots]).toEqual([bot]);
	const defaults = scopeAuthors({});
	expect([...defaults.factory]).toEqual(["factory", "delivery-bot"]);
	expect([...defaults.reviewBots]).toEqual([]);
});

test("review-bot threads stay in address-comments scope until the operator has replied", () => {
	const parsed = parseForgeDiscussions(botDiscussions());
	const authors = scopeAuthors({
		DELIVERY_FACTORY_AUTHORS: `operator,${bot}`,
		DELIVERY_REVIEW_BOTS: bot,
	});
	const scoped = excludeHandledThreads(parsed, authors.factory).map(
		(c) => c.id,
	);
	expect(scoped).toContain("b1");
	expect(scoped).toContain("b3b");
	expect(scoped).not.toContain("b2");
});

test("unanswered review-bot threads are bot-started with no reply after the bot's last note", () => {
	const status = reviewBotThreads(
		parseForgeDiscussions(botDiscussions()),
		new Set([bot]),
	);
	expect(status.configured).toBe(true);
	expect(status.botHasCommented).toBe(true);
	expect(status.unanswered.map((thread) => thread.discussionId)).toEqual([
		"bot-open",
		"bot-followed-up",
	]);
	expect(status.unanswered.map((thread) => thread.noteId)).toEqual([
		"b1",
		"b3b",
	]);
});

test("review-bot status reports an empty configuration and a bot that has not commented", () => {
	const parsed = parseForgeDiscussions(discussions());
	expect(reviewBotThreads(parsed, new Set())).toEqual({
		configured: false,
		botHasCommented: false,
		unanswered: [],
	});
	expect(reviewBotThreads(parsed, new Set([bot]))).toEqual({
		configured: true,
		botHasCommented: false,
		unanswered: [],
	});
});

test("the review-bots command reads normalized discussions and the configured identities", async () => {
	const proc = Bun.spawn(
		["bun", `${import.meta.dir}/forge-comments.ts`, "review-bots"],
		{
			stdin: new Blob([JSON.stringify(botDiscussions())]),
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, DELIVERY_REVIEW_BOTS: bot },
		},
	);
	const [out, code] = await Promise.all([
		new Response(proc.stdout).text(),
		proc.exited,
	]);
	expect(code).toBe(0);
	const status = JSON.parse(out) as { unanswered: { discussionId: string }[] };
	expect(status.unanswered.map((t) => t.discussionId)).toEqual([
		"bot-open",
		"bot-followed-up",
	]);
});
