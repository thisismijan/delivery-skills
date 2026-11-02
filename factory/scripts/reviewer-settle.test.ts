import { describe, expect, test } from "bun:test";
import {
	normalizeDiscussions,
	reviewEventsFromSystemNotes,
} from "../../providers/gitlab/gitlab-forge";
import { loadConfig } from "./config";
import replays from "./fixtures/reviewer-settle-replays.json";
import type {
	ForgeApprovals,
	ForgeDiscussions,
	ForgeReviewEvent,
} from "./forge-provider";
import {
	type SettleInput,
	decideSettle,
	parseQuietHours,
	settleTime,
} from "./reviewer-settle";

const HEAD = "a".repeat(40);
const identity = {
	version: 1 as const,
	provider: "gitlab",
	ref: "12",
	headRevision: HEAD,
};
const OPERATORS = ["operator", "factory", "delivery-bot"];

function discussions(
	threads: Array<{
		id: string;
		notes: Array<{ author: string; at: string; body?: string }>;
	}>,
	events: ForgeReviewEvent[] | undefined,
): ForgeDiscussions {
	return {
		...identity,
		discussions: threads.map((thread) => ({
			id: thread.id,
			resolved: false,
			notes: thread.notes.map((note, index) => ({
				id: `${thread.id}-${index}`,
				author: note.author,
				body: note.body ?? "Please handle the empty list.",
				system: false,
				resolved: false,
				createdAt: note.at,
			})),
		})),
		...(events ? { events } : {}),
	};
}

function approvals(approvedBy: string[] | undefined): ForgeApprovals {
	return {
		...identity,
		approval: approvedBy
			? { available: true, approvedBy, rulesMet: approvedBy.length > 0 }
			: { available: false },
	};
}

const ready = (at: string, actor = "operator"): ForgeReviewEvent => ({
	kind: "ready",
	actor,
	at,
});

function settle(
	overrides: Partial<SettleInput>,
): ReturnType<typeof decideSettle> {
	return decideSettle({
		discussions: discussions([], [ready("2026-10-22T10:00:00Z")]),
		approvals: approvals([]),
		operators: OPERATORS,
		now: new Date("2026-10-22T10:05:00Z"),
		windowMinutes: 30,
		...overrides,
	});
}

describe("settle window and quiet hours", () => {
	test("quiet hours parse strictly", () => {
		expect(parseQuietHours(undefined, "UTC")).toBeUndefined();
		expect(parseQuietHours("19:00-08:45", "Europe/London")).toEqual({
			start: 19 * 60,
			end: 8 * 60 + 45,
			timeZone: "Europe/London",
		});
		for (const bad of ["7pm-9am", "25:00-08:00", "08:00-08:00", "19:00"]) {
			expect(() => parseQuietHours(bad, "UTC")).toThrow();
		}
		expect(() => parseQuietHours("19:00-08:45", "Mars/Base")).toThrow(
			/time zone/,
		);
	});

	test("quiet minutes do not count toward the window", () => {
		const start = new Date("2026-10-22T17:50:00Z");
		expect(settleTime(start, 30).toISOString()).toBe(
			"2026-10-22T18:20:00.000Z",
		);
		const quiet = parseQuietHours("19:00-08:45", "Europe/London");
		expect(settleTime(start, 30, quiet).toISOString()).toBe(
			"2026-10-23T08:05:00.000Z",
		);
	});

	test("config reads the window, quiet hours, and zone, and fails closed on bad values", () => {
		expect(loadConfig({})).toMatchObject({
			reviewSettleMinutes: 30,
			reviewTimeZone: "UTC",
		});
		expect(
			loadConfig({
				REVIEW_QUIET_HOURS: "19:00-08:45",
				REVIEW_TIMEZONE: "Europe/London",
			}),
		).toMatchObject({
			reviewQuietHours: "19:00-08:45",
			reviewTimeZone: "Europe/London",
		});
		expect(() => loadConfig({ REVIEW_QUIET_HOURS: "late" })).toThrow();
		expect(() => loadConfig({ REVIEW_TIMEZONE: "Nowhere/Here" })).toThrow();
		expect(() => loadConfig({ REVIEW_SETTLE_MINUTES: "0" })).toThrow();
		expect(
			loadConfig({ DELIVERY_FACTORY_AUTHORS: "operator, factory" })
				.factoryAuthors,
		).toEqual(["operator", "factory"]);
	});
});

describe("deciding whether reviewers have settled", () => {
	test("missing history, approvals, or note times go to the operator", () => {
		expect(settle({ discussions: discussions([], undefined) }).decision).toBe(
			"ask",
		);
		expect(settle({ approvals: approvals(undefined) }).decision).toBe("ask");
		const untimed = discussions([], [ready("2026-10-22T10:00:00Z")]);
		untimed.discussions.push({
			id: "d",
			resolved: false,
			notes: [
				{
					id: "x",
					author: "reviewer-bot",
					body: "b",
					system: false,
					resolved: false,
				},
			],
		});
		expect(settle({ discussions: untimed }).decision).toBe("ask");
		expect(
			settle({ discussions: discussions([], []) }).reasons.join(" "),
		).toMatch(/does not show when it last left draft/);
		expect(
			settle({
				discussions: discussions(
					[],
					[
						ready("2026-10-22T10:00:00Z"),
						{ kind: "draft", actor: "operator", at: "2026-10-22T10:02:00Z" },
					],
				),
			}).decision,
		).toBe("ask");
	});

	test("a reviewer comment with no reply holds the queue; an acknowledgement does not", () => {
		const threads = [
			{
				id: "d1",
				notes: [{ author: "reviewer-bot", at: "2026-10-22T09:00:00Z" }],
			},
		];
		expect(
			settle({
				discussions: discussions(threads, [ready("2026-10-22T08:00:00Z")]),
				now: new Date("2026-10-22T12:00:00Z"),
			}),
		).toMatchObject({ decision: "unanswered", commentIds: ["d1-0"] });
		expect(
			settle({
				discussions: discussions(
					[
						{
							id: "d1",
							notes: [
								{
									author: "reviewer-bot",
									at: "2026-10-22T09:00:00Z",
									body: "LGTM",
								},
							],
						},
					],
					[ready("2026-10-22T08:00:00Z")],
				),
				now: new Date("2026-10-22T12:00:00Z"),
			}).decision,
		).toBe("settled");
	});

	test("a commenter who approved after the last reply settles it at once", () => {
		const threads = [
			{
				id: "d1",
				notes: [
					{ author: "reviewer-bot", at: "2026-10-22T10:01:00Z" },
					{ author: "operator", at: "2026-10-22T10:03:00Z", body: "Fixed." },
				],
			},
		];
		const events = [
			ready("2026-10-22T10:00:00Z"),
			{
				kind: "approved" as const,
				actor: "reviewer-bot",
				at: "2026-10-22T10:04:00Z",
			},
		];
		expect(
			settle({
				discussions: discussions(threads, events),
				approvals: approvals(["reviewer-bot"]),
			}),
		).toMatchObject({
			decision: "settled",
			reasons: [expect.stringMatching(/approved the current head/)],
		});
		expect(
			settle({
				discussions: discussions(threads, events),
				approvals: approvals([]),
			}).decision,
		).toBe("wait");
		const early = [
			ready("2026-10-22T10:00:00Z"),
			{
				kind: "approved" as const,
				actor: "reviewer-bot",
				at: "2026-10-22T10:02:00Z",
			},
		];
		expect(
			settle({
				discussions: discussions(threads, early),
				approvals: approvals(["reviewer-bot"]),
			}).decision,
		).toBe("wait");
	});

	test("with no approval, the window runs from the latest of ready, push, and comment", () => {
		const events = [
			ready("2026-10-22T10:00:00Z"),
			{
				kind: "pushed" as const,
				actor: "operator",
				at: "2026-10-22T10:20:00Z",
			},
		];
		expect(
			settle({
				discussions: discussions([], events),
				now: new Date("2026-10-22T10:35:00Z"),
			}),
		).toMatchObject({ decision: "wait", until: "2026-10-22T10:50:00.000Z" });
		expect(
			settle({
				discussions: discussions([], events),
				now: new Date("2026-10-22T10:50:00Z"),
			}).decision,
		).toBe("settled");
	});
});

type RawDiscussion = { id: string; resolved: boolean; notes: unknown[] };

function replayAt(mr: string): { queuedAt: Date; input: SettleInput } {
	const raw = (replays as Record<string, RawDiscussion[]>)[mr] ?? [];
	const events = (reviewEventsFromSystemNotes(raw) ?? []) as ForgeReviewEvent[];
	const queued = events.find((event) => event.kind === "queued");
	if (!queued) throw new Error(`!${mr} has no queue event`);
	const queuedAt = new Date(queued.at);
	const approvedBy = [...new Set(events.map((event) => event.actor))].filter(
		(actor) => {
			const last = events
				.filter(
					(event) =>
						event.actor === actor &&
						(event.kind === "approved" || event.kind === "unapproved") &&
						Date.parse(event.at) <= queuedAt.getTime(),
				)
				.at(-1);
			return last?.kind === "approved";
		},
	);
	return {
		queuedAt,
		input: {
			discussions: {
				...identity,
				discussions: normalizeDiscussions(
					raw,
				) as ForgeDiscussions["discussions"],
				events,
			},
			approvals: approvals(approvedBy),
			operators: OPERATORS,
			now: queuedAt,
			windowMinutes: 30,
		},
	};
}

describe("replaying the MDF-3212 run", () => {
	test("every change queued before its reviewers settled is held back at the moment it was queued", () => {
		for (const mr of [
			"976",
			"978",
			"987",
			"989",
			"995",
			"1000",
			"1012",
			"1001",
			"1032",
		]) {
			const { input } = replayAt(mr);
			const expected = ["978", "987"].includes(mr) ? "unanswered" : "wait";
			expect({ mr, decision: decideSettle(input).decision }).toEqual({
				mr,
				decision: expected,
			});
		}
	});

	test("the changes whose reviewer approved after the last reply would still have queued", () => {
		for (const mr of ["980", "985"]) {
			expect(decideSettle(replayAt(mr).input)).toMatchObject({
				decision: "settled",
				reasons: [expect.stringMatching(/approved the current head/)],
			});
		}
	});
});
