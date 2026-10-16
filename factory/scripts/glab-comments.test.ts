import { expect, test } from "bun:test";
import {
	excludeHandledThreads,
	excludeHoldoutNote,
	parseMrComments,
} from "./glab-comments";

// ---------------------------------------------------------------------------
// glab-comments — pure parsing/filtering unit tests. No glab process is
// spawned. All tests operate over sample in-memory payloads.
//
// Contract pinned for the implementer (scripts/glab-comments.ts must export):
//
//   export interface MrComment {
//     id:           string | number;   // note id from glab JSON
//     discussionId: string;            // parent thread id, for replying
//     author:       string;            // display name or username of the author
//     body:         string;            // full comment body text
//   }
//
//   export function parseMrComments(rawJson: string): MrComment[]
//     -- Parses the JSON payload returned by
//        `glab api projects/:fullpath/merge_requests/<iid>/discussions --paginate`:
//        an array of DISCUSSIONS, each { id, notes: [ { id, author, body, system } ] }.
//     -- Flattens to one MrComment per note, carrying the parent discussion id
//        so a reply can be posted to that thread.
//     -- Drops GitLab system notes (system: true — auto-generated events).
//     -- Fail-closed: throws on unparseable / non-JSON / non-array input.
//
//   export function excludeHoldoutNote(comments: MrComment[]): MrComment[]
//     -- Filters OUT any comment whose body starts with the audit prefix
//        "**delivery** ·" (the prefix produced by scripts/audit.ts auditComment).
//     -- Returns a new array; does not mutate the input.
// ---------------------------------------------------------------------------

const AUDIT_PREFIX = "**delivery** ·";

// A realistic discussions payload: a multi-note thread, two individual notes,
// one GitLab system note (must be dropped), and the factory's own audit note.
const sampleDiscussionsPayload = JSON.stringify([
	{
		id: "abc123def456",
		individual_note: false,
		notes: [
			{
				id: 101,
				author: { name: "Alice Smith", username: "alice" },
				body: "This looks good to me.",
				system: false,
			},
			{
				id: 104,
				author: { name: "Bob Jones", username: "bob" },
				body: "Agreed, ship it.",
				system: false,
			},
		],
	},
	{
		id: "ffee0011",
		individual_note: true,
		notes: [
			{
				id: 102,
				author: { name: "Bob Jones", username: "bob" },
				body: "Can you clarify the error handling here?",
				system: false,
			},
		],
	},
	{
		id: "sys0099",
		individual_note: true,
		notes: [
			{
				id: 103,
				author: { name: "GitLab", username: "gitlab" },
				body: "changed the description",
				system: true,
			},
		],
	},
	{
		id: "aud0077",
		individual_note: true,
		notes: [
			{
				id: 105,
				author: { name: "delivery-bot", username: "delivery-bot" },
				body: `${AUDIT_PREFIX} review\n\nHoldout review complete. Satisfied: yes.`,
				system: false,
			},
		],
	},
]);

// ---------------------------------------------------------------------------
// parseMrComments — flattening discussions into notes
// ---------------------------------------------------------------------------

test("parseMrComments: flattens each discussion's notes, dropping system notes", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	// 101, 104, 102, 105 kept; system note 103 dropped.
	expect(comments.map((c) => c.id)).toEqual([101, 104, 102, 105]);
});

test("parseMrComments: each entry has id, discussionId, author, and body", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	for (const c of comments) {
		expect(typeof c.id === "string" || typeof c.id === "number").toBe(true);
		expect(typeof c.discussionId).toBe("string");
		expect(typeof c.author).toBe("string");
		expect(typeof c.body).toBe("string");
	}
});

test("parseMrComments: carries the parent discussion id onto each note", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	const byId = new Map(comments.map((c) => [c.id, c.discussionId]));
	expect(byId.get(101)).toBe("abc123def456");
	expect(byId.get(104)).toBe("abc123def456");
	expect(byId.get(102)).toBe("ffee0011");
});

test("parseMrComments: preserves the body text verbatim", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	expect(comments[0]?.body).toBe("This looks good to me.");
	expect(comments[2]?.body).toBe("Can you clarify the error handling here?");
});

test("parseMrComments: normalizes author from nested author.name", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	expect(comments[0]?.author).toBe("Alice Smith");
	expect(comments[2]?.author).toBe("Bob Jones");
});

test("parseMrComments: falls back to author.username when name is absent", () => {
	const payload = JSON.stringify([
		{
			id: "d1",
			notes: [
				{ id: 1, author: { username: "carol" }, body: "LGTM", system: false },
			],
		},
	]);
	expect(parseMrComments(payload)[0]?.author).toBe("carol");
});

test("parseMrComments: preserves the audit-prefixed holdout note (filtering is excludeHoldoutNote's job)", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	expect(comments.some((c) => c.body.startsWith(AUDIT_PREFIX))).toBe(true);
});

test("parseMrComments: returns empty array for an empty discussions payload", () => {
	expect(parseMrComments(JSON.stringify([]))).toEqual([]);
});

test("parseMrComments: handles a single discussion with a single note", () => {
	const single = JSON.stringify([
		{
			id: "solo",
			notes: [
				{ id: 1, author: { name: "Carol" }, body: "LGTM", system: false },
			],
		},
	]);
	const result = parseMrComments(single);
	expect(result.length).toBe(1);
	expect(result[0]?.discussionId).toBe("solo");
	expect(result[0]?.body).toBe("LGTM");
});

test("parseMrComments: tolerates a discussion with no notes array", () => {
	const payload = JSON.stringify([{ id: "empty", individual_note: true }]);
	expect(parseMrComments(payload)).toEqual([]);
});

// ---------------------------------------------------------------------------
// parseMrComments — glab `--paginate` output (one array PER PAGE, concatenated
// as adjacent `][`, which is NOT a single valid JSON document).
// ---------------------------------------------------------------------------

const pageOne = [
	{
		id: "p1",
		notes: [{ id: 1, author: { name: "A" }, body: "one", system: false }],
	},
];
const pageTwo = [
	{
		id: "p2",
		notes: [{ id: 2, author: { name: "B" }, body: "two", system: false }],
	},
];

test("parseMrComments: flattens notes across concatenated pages", () => {
	const paginated = JSON.stringify(pageOne) + JSON.stringify(pageTwo);
	const comments = parseMrComments(paginated);
	expect(comments.map((c) => c.id)).toEqual([1, 2]);
	expect(comments.map((c) => c.discussionId)).toEqual(["p1", "p2"]);
});

test("parseMrComments: tolerates whitespace between concatenated pages", () => {
	const paginated = `${JSON.stringify(pageOne)}\n  ${JSON.stringify(pageTwo)}`;
	expect(parseMrComments(paginated).map((c) => c.id)).toEqual([1, 2]);
});

test("parseMrComments: page boundary detection is string-aware (a body containing '][' does not split a page)", () => {
	const tricky = [
		{
			id: "d",
			notes: [
				{
					id: 9,
					author: { name: "A" },
					body: "array literal ][ here",
					system: false,
				},
			],
		},
	];
	const comments = parseMrComments(
		JSON.stringify(tricky) + JSON.stringify(pageTwo),
	);
	expect(comments.map((c) => c.id)).toEqual([9, 2]);
	expect(comments[0]?.body).toBe("array literal ][ here");
});

// ---------------------------------------------------------------------------
// parseMrComments — fail-closed cases
// ---------------------------------------------------------------------------

test("parseMrComments: fail closed — throws on trailing garbage after a valid array", () => {
	expect(() => parseMrComments(`${JSON.stringify(pageOne)} oops`)).toThrow();
});

test("parseMrComments: fail closed — throws on invalid JSON", () => {
	expect(() => parseMrComments("{not json")).toThrow();
});

test("parseMrComments: fail closed — throws on empty string", () => {
	expect(() => parseMrComments("")).toThrow();
});

test("parseMrComments: fail closed — throws when top-level value is not an array (object)", () => {
	const notArray = JSON.stringify({ id: "d1", notes: [] });
	expect(() => parseMrComments(notArray)).toThrow();
});

test("parseMrComments: fail closed — throws when top-level value is null", () => {
	expect(() => parseMrComments(JSON.stringify(null))).toThrow();
});

test("parseMrComments: fail closed — throws when top-level value is a plain string", () => {
	expect(() => parseMrComments(JSON.stringify("just a string"))).toThrow();
});

// ---------------------------------------------------------------------------
// excludeHoldoutNote — filtering
//
// Spec: any comment whose body STARTS WITH the audit prefix "**delivery** ·"
// is the factory's own note and must be excluded. All other comments
// (human, bot, etc.) are kept.
// ---------------------------------------------------------------------------

test("excludeHoldoutNote: drops comments whose body starts with the audit prefix", () => {
	const filtered = excludeHoldoutNote(
		parseMrComments(sampleDiscussionsPayload),
	);
	expect(filtered.some((c) => c.body.startsWith(AUDIT_PREFIX))).toBe(false);
});

test("excludeHoldoutNote: keeps all non-audit-prefixed comments", () => {
	const filtered = excludeHoldoutNote(
		parseMrComments(sampleDiscussionsPayload),
	);
	// Notes kept after system-note drop: 101, 104, 102, 105; the audit note 105 removed -> 3.
	expect(filtered.map((c) => c.id)).toEqual([101, 104, 102]);
});

test("excludeHoldoutNote: returns all comments when none carry the audit prefix", () => {
	const noAudit = [
		{ id: 1, discussionId: "a", author: "Alice", body: "Nice work!" },
		{ id: 2, discussionId: "b", author: "Bob", body: "Please add a test." },
	];
	expect(excludeHoldoutNote(noAudit).length).toBe(2);
});

test("excludeHoldoutNote: returns empty array when all comments carry the audit prefix", () => {
	const allAudit = [
		{
			id: 1,
			discussionId: "a",
			author: "bot",
			body: `${AUDIT_PREFIX} review\n\nAll good.`,
		},
		{
			id: 2,
			discussionId: "b",
			author: "bot",
			body: `${AUDIT_PREFIX} action\n\nFixed bug.`,
		},
	];
	expect(excludeHoldoutNote(allAudit).length).toBe(0);
});

test("excludeHoldoutNote: does not mutate the input array", () => {
	const comments = parseMrComments(sampleDiscussionsPayload);
	const before = comments.length;
	excludeHoldoutNote(comments);
	expect(comments.length).toBe(before);
});

test("excludeHoldoutNote: a body that CONTAINS but does not START WITH the prefix is kept", () => {
	const partial = [
		{
			id: 10,
			discussionId: "a",
			author: "human",
			body: `See also: ${AUDIT_PREFIX} note above.`,
		},
	];
	expect(excludeHoldoutNote(partial).length).toBe(1);
});

test("excludeHoldoutNote: prefix match is exact — a close-but-different prefix is kept", () => {
	const notExact = [
		{
			id: 20,
			discussionId: "a",
			author: "bot",
			body: "**delivery**: different separator",
		},
		{
			id: 21,
			discussionId: "b",
			author: "bot",
			body: "delivery · no bold markers",
		},
	];
	expect(excludeHoldoutNote(notExact).length).toBe(2);
});

test("excludeHandledThreads: drops the original comment when its thread already has an audit reply", () => {
	const comments = [
		{
			id: 1,
			discussionId: "handled",
			author: "Alice",
			body: "Please add a boundary test.",
		},
		{
			id: 2,
			discussionId: "handled",
			author: "factory",
			body: `${AUDIT_PREFIX} address-comments\n\nAdded in abc123.`,
		},
		{
			id: 3,
			discussionId: "new",
			author: "Bob",
			body: "What happens on timeout?",
		},
	];

	expect(excludeHandledThreads(comments).map((comment) => comment.id)).toEqual([
		3,
	]);
});

test("excludeHandledThreads: keeps every note in a thread with no audit reply", () => {
	const comments = [
		{ id: 1, discussionId: "open", author: "Alice", body: "First" },
		{ id: 2, discussionId: "open", author: "Bob", body: "Follow-up" },
	];
	expect(excludeHandledThreads(comments)).toEqual(comments);
});

test("excludeHandledThreads: a human cannot spoof the audit prefix", () => {
	const comments = [
		{ id: 1, discussionId: "open", author: "Alice", body: "Please fix this" },
		{
			id: 2,
			discussionId: "open",
			author: "Alice",
			body: `${AUDIT_PREFIX} address-comments\n\nnot really the factory`,
		},
	];
	expect(
		excludeHandledThreads(comments, new Set(["factory"])).map(
			(comment) => comment.id,
		),
	).toEqual([1]);
});

test("excludeHandledThreads: keeps human follow-ups after an authenticated reply", () => {
	const comments = [
		{ id: 1, discussionId: "thread", author: "Alice", body: "Original" },
		{
			id: 2,
			discussionId: "thread",
			author: "factory",
			body: `${AUDIT_PREFIX} address-comments\n\nfixed`,
		},
		{ id: 3, discussionId: "thread", author: "Alice", body: "Still broken" },
	];
	expect(
		excludeHandledThreads(comments, new Set(["factory"])).map(
			(comment) => comment.id,
		),
	).toEqual([3]);
});
