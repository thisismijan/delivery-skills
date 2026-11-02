import { readFileSync } from "node:fs";
import { loadConfig } from "./config";
import { needsNoAnswer } from "./forge-comments";
import type { ForgeApprovals, ForgeDiscussions } from "./forge-provider";
import { type QuietHours, parseQuietHours, settleTime } from "./quiet-hours";

export { type QuietHours, parseQuietHours, settleTime };

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const REVIEWER_SETTLE_INVOCATION =
	"scripts/reviewer-settle.ts <change.json> <discussions.json> <approvals.json>";

export interface SettleInput {
	discussions: ForgeDiscussions;
	approvals: ForgeApprovals;
	operators: readonly string[];
	now: Date;
	windowMinutes: number;
	quietHours?: QuietHours;
}

export type SettleDecision =
	| { decision: "settled"; reasons: string[] }
	| { decision: "wait"; until: string; reasons: string[] }
	| { decision: "unanswered"; commentIds: string[]; reasons: string[] }
	| { decision: "ask"; reasons: string[] };

function time(value: string): number {
	return Date.parse(value);
}

function latest(values: number[]): number | undefined {
	return values.length === 0 ? undefined : Math.max(...values);
}

function stamp(ms: number): string {
	return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function decideSettle(input: SettleInput): SettleDecision {
	const now = input.now.getTime();
	const operators = new Set(input.operators);
	const events = input.discussions.events;
	if (!events) {
		return {
			decision: "ask",
			reasons: [
				"The forge did not report when the change left draft or who approved it, so delivery cannot tell whether reviewers have settled.",
			],
		};
	}
	if (!input.approvals.approval.available) {
		return {
			decision: "ask",
			reasons: [
				"The forge did not report approvals, so delivery cannot tell whether reviewers have settled.",
			],
		};
	}
	const notes = input.discussions.discussions.flatMap((discussion) =>
		discussion.notes
			.filter((note) => !note.system)
			.map((note) => ({ ...note, discussionId: discussion.id })),
	);
	if (notes.some((note) => !note.createdAt)) {
		return {
			decision: "ask",
			reasons: [
				"The forge did not report when every comment was written, so delivery cannot tell whether reviewers have settled.",
			],
		};
	}
	const visible = notes.filter((note) => time(note.createdAt ?? "") <= now);
	const happened = events.filter((event) => time(event.at) <= now);

	const lastReady = latest(
		happened.filter((event) => event.kind === "ready").map((e) => time(e.at)),
	);
	const lastDraft = latest(
		happened.filter((event) => event.kind === "draft").map((e) => time(e.at)),
	);
	if (lastReady === undefined || (lastDraft ?? 0) > lastReady) {
		return {
			decision: "ask",
			reasons: [
				"The change's history does not show when it last left draft, so delivery cannot tell how long reviewers have had.",
			],
		};
	}

	const unanswered: string[] = [];
	for (const discussion of input.discussions.discussions) {
		if (discussion.resolved) continue;
		const thread = visible.filter(
			(note) => note.discussionId === discussion.id,
		);
		const last = thread.at(-1);
		if (last && !operators.has(last.author) && !needsNoAnswer(last.body)) {
			unanswered.push(last.id);
		}
	}
	if (unanswered.length > 0) {
		return {
			decision: "unanswered",
			commentIds: unanswered,
			reasons: [
				`${unanswered.length} reviewer comment${unanswered.length === 1 ? " has" : "s have"} no reply yet; answer ${unanswered.length === 1 ? "it" : "them"} before the change is queued.`,
			],
		};
	}

	const reviewerNotes = visible.filter((note) => !operators.has(note.author));
	const commenters = [...new Set(reviewerNotes.map((note) => note.author))];
	const lastReply =
		latest(
			visible
				.filter((note) => operators.has(note.author))
				.map((note) => time(note.createdAt ?? "")),
		) ?? 0;
	const approvedNow = new Set(input.approvals.approval.approvedBy);
	const approvedAfterReply = (reviewer: string): boolean => {
		const theirs = happened.filter((event) => event.actor === reviewer);
		const approved = latest(
			theirs.filter((e) => e.kind === "approved").map((e) => time(e.at)),
		);
		const withdrawn = latest(
			theirs.filter((e) => e.kind === "unapproved").map((e) => time(e.at)),
		);
		const lastNote =
			latest(
				reviewerNotes
					.filter((note) => note.author === reviewer)
					.map((note) => time(note.createdAt ?? "")),
			) ?? 0;
		return (
			approvedNow.has(reviewer) &&
			approved !== undefined &&
			approved > Math.max(lastReply, lastNote) &&
			(withdrawn === undefined || withdrawn < approved)
		);
	};
	if (commenters.length > 0 && commenters.every(approvedAfterReply)) {
		return {
			decision: "settled",
			reasons: [
				"Every reviewer who commented approved the current head after the last reply.",
			],
		};
	}

	const lastPush = latest(
		happened.filter((event) => event.kind === "pushed").map((e) => time(e.at)),
	);
	const lastNote = latest(visible.map((note) => time(note.createdAt ?? "")));
	const start = Math.max(lastReady, lastPush ?? 0, lastNote ?? 0);
	const until = settleTime(
		new Date(start),
		input.windowMinutes,
		input.quietHours,
	).getTime();
	const because =
		start === lastReady
			? `the change left draft at ${stamp(start)}`
			: start === lastPush
				? `the last push was at ${stamp(start)}`
				: `the last comment was at ${stamp(start)}`;
	if (now >= until) {
		return {
			decision: "settled",
			reasons: [
				`No new comment for ${input.windowMinutes} reviewing minutes since ${because}.`,
			],
		};
	}
	return {
		decision: "wait",
		until: new Date(until).toISOString(),
		reasons: [
			`Waiting for reviewers until ${stamp(until)}: ${because}, and reviewers get ${input.windowMinutes} reviewing minutes${input.quietHours ? " outside quiet hours" : ""}.`,
		],
	};
}

if (import.meta.main) {
	const [changePath, discussionsPath, approvalsPath] = process.argv.slice(2);
	if (!changePath || !discussionsPath || !approvalsPath) {
		console.error(`usage: ${REVIEWER_SETTLE_INVOCATION}`);
		process.exit(2);
	}
	try {
		const schemas = await import("./forge-provider");
		const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
		const change = schemas.ForgeChange.parse(read(changePath));
		const discussions = schemas.ForgeDiscussions.parse(read(discussionsPath));
		const approvals = schemas.ForgeApprovals.parse(read(approvalsPath));
		if (
			discussions.headRevision !== change.revisions.head ||
			approvals.headRevision !== change.revisions.head
		) {
			throw new Error(
				"The change moved between reads; read it again before deciding.",
			);
		}
		const config = loadConfig();
		const decision = decideSettle({
			discussions,
			approvals,
			operators: [change.author, ...config.factoryAuthors],
			now: new Date(),
			windowMinutes: config.reviewSettleMinutes,
			quietHours: parseQuietHours(
				config.reviewQuietHours,
				config.reviewTimeZone,
			),
		});
		console.log(JSON.stringify(decision, null, 2));
		process.exit(
			decision.decision === "settled"
				? 0
				: decision.decision === "wait"
					? 3
					: 1,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
