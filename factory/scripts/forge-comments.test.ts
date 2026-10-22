import { expect, test } from "bun:test";
import { parseForgeDiscussions } from "./forge-comments";
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
