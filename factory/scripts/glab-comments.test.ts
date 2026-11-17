import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	AUDIT_PREFIX,
	type MrComment,
	excludeHandledThreads,
	excludeHoldoutNote,
	parseMrComments,
} from "./glab-comments";

type Author = { name?: string; username?: string };

function note(id: number, author: Author, body: string, system = false) {
	return { id, author, body, system };
}

function thread(id: string, ...notes: ReturnType<typeof note>[]) {
	return { id, individual_note: notes.length === 1, notes };
}

const alice = { name: "Alice Smith", username: "alice" };
const bob = { name: "Bob Jones", username: "bob" };

// Two human threads, a system event that must disappear, and a factory audit
// note, in the shape `glab api .../discussions` returns.
const discussions = JSON.stringify([
	thread(
		"abc123def456",
		note(101, alice, "Reads correctly to me."),
		note(104, bob, "Agreed, ship it."),
	),
	thread("ffee0011", note(102, bob, "What happens when this call errors?")),
	thread(
		"sys0099",
		note(
			103,
			{ name: "GitLab", username: "gitlab" },
			"changed the description",
			true,
		),
	),
	thread(
		"aud0077",
		note(
			105,
			{ name: "delivery-bot", username: "delivery-bot" },
			`${AUDIT_PREFIX} review\n\nHoldout review complete. Satisfied: yes.`,
		),
	),
]);

const ids = (comments: MrComment[]) => comments.map((comment) => comment.id);

function comment(
	id: number,
	discussionId: string,
	author: string,
	body: string,
): MrComment {
	return { id, discussionId, author, body };
}

test("the audit prefix is the one audit.ts writes", () => {
	expect(AUDIT_PREFIX).toBe("**delivery** ·");
});

describe("parseMrComments on a single payload", () => {
	const parsed = parseMrComments(discussions);

	test("keeps every human note in order and drops system notes", () => {
		expect(ids(parsed)).toEqual([101, 104, 102, 105]);
	});

	test("gives every entry a typed id, thread, author and body", () => {
		for (const entry of parsed) {
			expect(["string", "number"]).toContain(typeof entry.id);
			expect(typeof entry.discussionId).toBe("string");
			expect(typeof entry.author).toBe("string");
			expect(typeof entry.body).toBe("string");
		}
	});

	test("records the thread each note came from", () => {
		const threadOf = new Map(
			parsed.map((entry) => [entry.id, entry.discussionId]),
		);
		expect(threadOf.get(101)).toBe("abc123def456");
		expect(threadOf.get(104)).toBe("abc123def456");
		expect(threadOf.get(102)).toBe("ffee0011");
	});

	test("copies bodies exactly and uses the author's display name", () => {
		expect(parsed[0]).toMatchObject({
			author: "Alice Smith",
			body: "Reads correctly to me.",
		});
		expect(parsed[2]).toMatchObject({
			author: "Bob Jones",
			body: "What happens when this call errors?",
		});
	});

	test("leaves the audit note in place for the filters to decide", () => {
		expect(parsed.some((entry) => entry.body.startsWith(AUDIT_PREFIX))).toBe(
			true,
		);
	});

	test("uses the username when an author has no name", () => {
		const payload = JSON.stringify([
			thread("d1", note(1, { username: "carol" }, "LGTM")),
		]);
		const [only] = parseMrComments(payload);
		expect(only?.author).toBe("carol");
	});

	test("a lone note in a lone thread comes back as one entry", () => {
		const payload = JSON.stringify([
			thread("solo", note(1, { name: "Carol" }, "LGTM")),
		]);
		const only = parseMrComments(payload);
		expect(only).toHaveLength(1);
		expect(only[0]).toMatchObject({ discussionId: "solo", body: "LGTM" });
	});

	test.each([
		["an empty list", []],
		[
			"a thread without a notes array",
			[{ id: "empty", individual_note: true }],
		],
	])("returns nothing for %s", (_label, value) => {
		expect(parseMrComments(JSON.stringify(value))).toEqual([]);
	});
});

describe("parseMrComments on paginated output", () => {
	const first = [thread("p1", note(1, { name: "A" }, "one"))];
	const second = [thread("p2", note(2, { name: "B" }, "two"))];

	test("joins pages printed back to back", () => {
		const parsed = parseMrComments(
			JSON.stringify(first) + JSON.stringify(second),
		);
		expect(ids(parsed)).toEqual([1, 2]);
		expect(parsed.map((entry) => entry.discussionId)).toEqual(["p1", "p2"]);
	});

	test("allows whitespace between pages", () => {
		const text = `${JSON.stringify(first)}\n  ${JSON.stringify(second)}`;
		expect(ids(parseMrComments(text))).toEqual([1, 2]);
	});

	test("does not split a page at a `][` inside a string", () => {
		const tricky = [
			thread("d", note(9, { name: "A" }, "array literal ][ here")),
		];
		const parsed = parseMrComments(
			JSON.stringify(tricky) + JSON.stringify(second),
		);
		expect(ids(parsed)).toEqual([9, 2]);
		expect(parsed[0]?.body).toBe("array literal ][ here");
	});

	test.each([
		["text after the last page", `${JSON.stringify(first)} oops`],
		["text that is not JSON", "{not json"],
		["an empty string", ""],
		["an object", JSON.stringify({ id: "d1", notes: [] })],
		["null", JSON.stringify(null)],
		["a bare string", JSON.stringify("just a string")],
	])("throws on %s", (_label, text) => {
		expect(() => parseMrComments(text)).toThrow();
	});
});

describe("excludeHoldoutNote", () => {
	test("removes the factory's audit note and keeps the rest in order", () => {
		const kept = excludeHoldoutNote(parseMrComments(discussions));
		expect(kept.some((entry) => entry.body.startsWith(AUDIT_PREFIX))).toBe(
			false,
		);
		expect(ids(kept)).toEqual([101, 104, 102]);
	});

	test("keeps everything when no note is an audit note", () => {
		const notes = [
			comment(1, "a", "Alice", "Nice work!"),
			comment(2, "b", "Bob", "Please add a test."),
		];
		expect(excludeHoldoutNote(notes)).toHaveLength(2);
	});

	test("returns nothing when every note is an audit note", () => {
		const notes = [
			comment(1, "a", "bot", `${AUDIT_PREFIX} review\n\nAll good.`),
			comment(2, "b", "bot", `${AUDIT_PREFIX} action\n\nFixed bug.`),
		];
		expect(excludeHoldoutNote(notes)).toHaveLength(0);
	});

	test("leaves its input untouched", () => {
		const parsed = parseMrComments(discussions);
		const length = parsed.length;
		excludeHoldoutNote(parsed);
		expect(parsed).toHaveLength(length);
	});

	test.each([
		["mentions the prefix mid-body", `See also: ${AUDIT_PREFIX} note above.`],
		["uses a different separator", "**delivery**: different separator"],
		["drops the bold markers", "delivery · no bold markers"],
	])("keeps a note that only %s", (_label, body) => {
		expect(excludeHoldoutNote([comment(1, "a", "bot", body)])).toHaveLength(1);
	});
});

describe("excludeHandledThreads", () => {
	test("drops a thread the factory already answered, with its original note", () => {
		const notes = [
			comment(1, "handled", "Alice", "Please add a boundary test."),
			comment(
				2,
				"handled",
				"factory",
				`${AUDIT_PREFIX} address-comments\n\nAdded in abc123.`,
			),
			comment(3, "new", "Bob", "What happens on timeout?"),
		];
		expect(ids(excludeHandledThreads(notes))).toEqual([3]);
	});

	test("keeps a thread with no audit reply as it is", () => {
		const notes = [
			comment(1, "open", "Alice", "First"),
			comment(2, "open", "Bob", "Follow-up"),
		];
		expect(excludeHandledThreads(notes)).toEqual(notes);
	});

	test("ignores an audit prefix written by someone who is not the factory", () => {
		const notes = [
			comment(1, "open", "Alice", "Please fix this"),
			comment(
				2,
				"open",
				"Alice",
				`${AUDIT_PREFIX} address-comments\n\nnot really the factory`,
			),
		];
		expect(ids(excludeHandledThreads(notes, new Set(["factory"])))).toEqual([
			1,
		]);
	});

	test("keeps a human note posted after the factory's reply", () => {
		const notes = [
			comment(1, "thread", "Alice", "Original"),
			comment(
				2,
				"thread",
				"factory",
				`${AUDIT_PREFIX} address-comments\n\nfixed`,
			),
			comment(3, "thread", "Alice", "Still broken"),
		];
		expect(ids(excludeHandledThreads(notes, new Set(["factory"])))).toEqual([
			3,
		]);
	});
});

describe("the command line", () => {
	async function pipe(stdin: string, env: Record<string, string> = {}) {
		const child = Bun.spawn(
			["bun", join(import.meta.dir, "glab-comments.ts")],
			{
				stdin: new Blob([stdin]),
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, ...env },
			},
		);
		const [stdout, code] = await Promise.all([
			new Response(child.stdout).text(),
			child.exited,
		]);
		return { stdout, code };
	}

	test("prints the notes still to handle", async () => {
		const run = await pipe(discussions, {
			DELIVERY_FACTORY_AUTHORS: "delivery-bot",
		});
		expect(run.code).toBe(0);
		expect(ids(JSON.parse(run.stdout))).toEqual([101, 104, 102]);
	});

	test("exits 1 on input that is not a discussions list", async () => {
		expect((await pipe("{}")).code).toBe(1);
	});
});
