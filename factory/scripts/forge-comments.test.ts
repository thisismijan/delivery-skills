import { expect, test } from "bun:test";
import { parseForgeDiscussions, scopeComments } from "./forge-comments";
import { AUDIT_PREFIX, excludeHandledThreads } from "./glab-comments";
import { parseClassificationVerdict } from "./verdicts";

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

test("flattening keeps optional anchors", () => {
	const parsed = parseForgeDiscussions({
		...discussions(),
		discussions: [
			{
				id: "thread-3",
				resolved: false,
				notes: [
					{
						id: "note-3",
						author: "reviewer",
						body: "This line is gone.",
						system: false,
						resolved: false,
						anchor: { path: "src/gone.ts", line: 4, side: "new" },
					},
				],
			},
		],
	});
	expect(parsed[0]?.anchor).toEqual({
		path: "src/gone.ts",
		line: 4,
		side: "new",
	});
});

test("a missing head file or past-EOF new-side line is outdated", () => {
	const comments = [
		{
			id: "kept",
			discussionId: "t1",
			author: "reviewer",
			body: "general note",
		},
		{
			id: "missing",
			discussionId: "t2",
			author: "reviewer",
			body: "file gone",
			anchor: { path: "src/gone.ts", line: 1, side: "new" as const },
		},
		{
			id: "past-eof",
			discussionId: "t3",
			author: "reviewer",
			body: "line gone",
			anchor: { path: "src/keep.ts", line: 9, side: "new" as const },
		},
		{
			id: "present",
			discussionId: "t4",
			author: "reviewer",
			body: "still here",
			anchor: { path: "src/keep.ts", line: 1, side: "new" as const },
		},
		{
			id: "unknown-path",
			discussionId: "t5",
			author: "reviewer",
			body: "did not look up",
			anchor: { path: "src/unchecked.ts", line: 1, side: "new" as const },
		},
		{
			id: "old-side",
			discussionId: "t6",
			author: "reviewer",
			body: "on the old side",
			anchor: { path: "src/gone.ts", line: 1, side: "old" as const },
		},
	];
	const scoped = scopeComments(comments, {
		"src/gone.ts": null,
		"src/keep.ts": "still here\n",
	});
	expect(scoped.inScope.map((comment) => comment.id)).toEqual([
		"kept",
		"present",
		"unknown-path",
		"old-side",
	]);
	expect(parseClassificationVerdict(JSON.stringify(scoped.outdated))).toEqual([
		{
			commentId: "missing",
			classification: "outdated",
			reasoning: "anchor path src/gone.ts is missing at the pinned head",
		},
		{
			commentId: "past-eof",
			classification: "outdated",
			reasoning: "anchor line 9 is past the end of src/keep.ts (1 lines)",
		},
	]);
});

test("resolved discussions and resolved notes are dropped before scope", () => {
	const parsed = parseForgeDiscussions({
		version: 1,
		provider: "sample-forge",
		ref: "change-1",
		headRevision: "abc123",
		discussions: [
			{
				id: "open-thread",
				resolved: false,
				notes: [
					{
						id: "open-note",
						author: "reviewer",
						body: "Please add a test.",
						system: false,
						resolved: false,
					},
					{
						id: "resolved-note",
						author: "reviewer",
						body: "Already done.",
						system: false,
						resolved: true,
					},
				],
			},
			{
				id: "resolved-thread",
				resolved: true,
				notes: [
					{
						id: "old-note",
						author: "reviewer",
						body: "Please rename this.",
						system: false,
						resolved: false,
					},
				],
			},
		],
	});
	expect(parsed.map((comment) => comment.id)).toEqual(["open-note"]);
});

test("an empty or whitespace-only body is outdated", () => {
	const scoped = scopeComments(
		[
			{
				id: "empty",
				discussionId: "t1",
				author: "reviewer",
				body: "   \n",
			},
			{
				id: "kept",
				discussionId: "t2",
				author: "reviewer",
				body: "Please add a test.",
			},
		],
		{},
	);
	expect(scoped.inScope.map((comment) => comment.id)).toEqual(["kept"]);
	expect(parseClassificationVerdict(JSON.stringify(scoped.outdated))).toEqual([
		{
			commentId: "empty",
			classification: "outdated",
			reasoning: "comment body is empty",
		},
	]);
});

test("an acknowledgement-only body is outdated", () => {
	const scoped = scopeComments(
		[
			{
				id: "ack",
				discussionId: "t1",
				author: "reviewer",
				body: "LGTM!",
			},
			{
				id: "thanks",
				discussionId: "t2",
				author: "reviewer",
				body: "thanks",
			},
			{
				id: "done",
				discussionId: "t3",
				author: "reviewer",
				body: "Done.",
			},
			{
				id: "kept",
				discussionId: "t4",
				author: "reviewer",
				body: "LGTM, but please add a test.",
			},
		],
		{},
	);
	expect(scoped.inScope.map((comment) => comment.id)).toEqual(["kept"]);
	expect(parseClassificationVerdict(JSON.stringify(scoped.outdated))).toEqual([
		{
			commentId: "ack",
			classification: "outdated",
			reasoning: "comment is only an acknowledgement",
		},
		{
			commentId: "thanks",
			classification: "outdated",
			reasoning: "comment is only an acknowledgement",
		},
		{
			commentId: "done",
			classification: "outdated",
			reasoning: "comment is only an acknowledgement",
		},
	]);
});

test("a mention-only body is outdated", () => {
	const scoped = scopeComments(
		[
			{
				id: "ping",
				discussionId: "t1",
				author: "reviewer",
				body: "@owner",
			},
			{
				id: "kept",
				discussionId: "t2",
				author: "reviewer",
				body: "@owner please add a test.",
			},
		],
		{},
	);
	expect(scoped.inScope.map((comment) => comment.id)).toEqual(["kept"]);
	expect(parseClassificationVerdict(JSON.stringify(scoped.outdated))).toEqual([
		{
			commentId: "ping",
			classification: "outdated",
			reasoning: "comment is only a mention",
		},
	]);
});

test("an applied suggestion-only comment is outdated", () => {
	const scoped = scopeComments(
		[
			{
				id: "applied",
				discussionId: "t1",
				author: "reviewer",
				body: "```suggestion\nexport const n = 2;\n```",
				anchor: { path: "src/keep.ts", line: 1, side: "new" },
			},
			{
				id: "unapplied",
				discussionId: "t2",
				author: "reviewer",
				body: "```suggestion\nexport const n = 3;\n```",
				anchor: { path: "src/keep.ts", line: 1, side: "new" },
			},
			{
				id: "prose",
				discussionId: "t3",
				author: "reviewer",
				body: "Please also rename this.\n```suggestion\nexport const n = 2;\n```",
				anchor: { path: "src/keep.ts", line: 1, side: "new" },
			},
		],
		{ "src/keep.ts": "export const n = 2;\n" },
	);
	expect(scoped.inScope.map((comment) => comment.id)).toEqual([
		"unapplied",
		"prose",
	]);
	expect(parseClassificationVerdict(JSON.stringify(scoped.outdated))).toEqual([
		{
			commentId: "applied",
			classification: "outdated",
			reasoning: "suggestion is already present in src/keep.ts",
		},
	]);
});

test("an empty comment list stays empty", () => {
	expect(scopeComments([], { "src/a.ts": "x\n" })).toEqual({
		inScope: [],
		outdated: [],
	});
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
