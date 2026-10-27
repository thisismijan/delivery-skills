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
