import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { helpText, isHelpRequest } from "./cli-help";
import { JudgeSelfTest, judgeSelfTestProblem } from "./judge-self-test";

// Scores one run of a frontier fixture under `factory/evaluations/frontier`: an approach challenge
// with planted gaps and an adjudication of review candidates, some real and some false. The
// checks are hidden from the model under test; each fixture's answer key lives only here.
//
// Whether a gap finds a planted problem is decided by a judge model against the rubric below
// (`frontier-judge.ts`), never by keywords: the same flaw is described in too many ways. The
// adjudication and the output contract are checked deterministically.

export const FRONTIER_EVAL_USAGE =
	"frontier-eval-score.ts <answer.json> <result.json> <model> <fixture> --self-test <self-test.json> [--judgement <judgement.json>]";

export const FRONTIER_FIXTURES = ["rate-limit", "webhook", "renewals"] as const;
export type FrontierFixture = (typeof FRONTIER_FIXTURES)[number];

const Gap = z.object({ case: z.string(), evidence: z.string() }).strict();
type Gap = z.infer<typeof Gap>;

export const FrontierAnswer = z
	.object({
		approach: z
			.object({
				verdict: z.enum(["sound", "gaps", "rethink"]),
				gaps: z.array(Gap),
				rethink: z
					.object({ problem: z.string(), alternative: z.string() })
					.strict()
					.nullable(),
				reasoning: z.string(),
			})
			.strict(),
		adjudication: z
			.object({
				decisions: z.array(
					z
						.object({
							id: z.string(),
							verdict: z.enum(["confirmed", "rejected"]),
							evidence: z.string(),
						})
						.strict(),
				),
			})
			.strict(),
	})
	.strict();
export type FrontierAnswer = z.infer<typeof FrontierAnswer>;

export interface RubricItem {
	id: string;
	counts: string;
	doesNotCount: string;
}

// A fixture's answer key: the planted gaps (missing one is a critical miss), findings that would
// be false alarms, and which review candidates are real.
export interface AnswerKey {
	gaps: readonly RubricItem[];
	falseAlarms: readonly RubricItem[];
	real: readonly string[];
	notReal: readonly string[];
	file: string;
	evidenceCheck: string;
}

export const FRONTIER_KEYS: Record<FrontierFixture, AnswerKey> = {
	"rate-limit": {
		gaps: [
			{
				id: "approach-cites-multi-process-server",
				counts:
					"A gap says the server runs several worker processes (forked or clustered), so each process keeps its own in-memory counter and a client gets more than the limit.",
				doesNotCount:
					"Counters lost on restart, or memory growth, without several processes each holding a counter.",
			},
			{
				id: "approach-names-anonymous-clients",
				counts:
					"A gap says anonymous or unauthenticated clients have no user id, so a limit keyed by user id cannot limit them separately: they share one key, bypass the limit, or crash the lookup.",
				doesNotCount:
					"Spoofed or rotated tokens for signed-in users, without clients that have no user id.",
			},
		],
		falseAlarms: [],
		real: ["C1", "C2"],
		notReal: ["C3", "C4"],
		file: "src/fees.ts",
		evidenceCheck: "adjudication-confirmed-evidence-cites-fees",
	},
	webhook: {
		gaps: [
			{
				id: "approach-finds-concurrent-duplicate-race",
				counts:
					"A gap's situation is two deliveries of the same event being processed at overlapping times, so both pass the processed-id check before either records the id and the handler runs twice. The consequence may be implied when the situation is named.",
				doesNotCount:
					"Duplicate deliveries handled one after another, a record lost when the process crashes or restarts, or a failed handler left unrecorded, without processing that overlaps.",
			},
			{
				id: "approach-finds-unsigned-event-id-header",
				counts:
					"A gap says the de-duplication key comes from the X-Event-Id header and that the signature does not cover that header, or describes changing or forging it on a validly signed body.",
				doesNotCount:
					"Only that the header can be missing or empty, or that unrelated deliveries can share an empty key, without saying it is unsigned or forgeable.",
			},
			{
				id: "approach-finds-refund-event-name-mismatch",
				counts:
					"A gap says the provider sends charge.refunded while the refund handler is registered as refund.created, so refunds never reach it.",
				doesNotCount:
					"Refunds or unhandled event types in general, or citing the provider's event list for a different problem.",
			},
		],
		falseAlarms: [
			{
				id: "approach-raises-no-multi-process-false-alarm",
				counts:
					"A gap's situation depends on several processes, instances, or replicas, for example the in-memory set not being shared between them.",
				doesNotCount:
					"Concurrency among the queue's jobs inside the one process.",
			},
		],
		real: ["C3", "C5"],
		notReal: ["C1", "C2", "C4"],
		file: "src/ledger.ts",
		evidenceCheck: "adjudication-confirmed-evidence-cites-ledger",
	},
	renewals: {
		gaps: [
			{
				id: "approach-finds-month-end-overflow",
				counts:
					"A gap says addMonths overflows from the 29th to 31st into the following month (for example 31 January becomes 3 March), so the short month's last day is skipped or the renewal day drifts.",
				doesNotCount:
					"Month ends or leap years named as an edge case without saying the date rolls over, or time-zone concerns.",
			},
			{
				id: "approach-finds-requires-action-renewed",
				counts:
					"A gap says a requires_action result, where no money has moved, is treated like success because the design only checks for declined, so renewsAt moves on and the subscription renews unpaid.",
				doesNotCount:
					"Only that no authentication email is sent, or that requires_action is unhandled, without saying the subscription renews or renewsAt moves on.",
			},
			{
				id: "approach-finds-retry-reuses-idempotency-key",
				counts:
					"A gap says the next night's retry of a declined charge sends the same idempotency key, because renewsAt is unchanged, so the gateway returns the stored decline without trying the card for up to seven days.",
				doesNotCount:
					"Only that nightly retries ignore the 24-hour wait, or retry limits in general, without the repeated key returning the stored response.",
			},
			{
				id: "approach-finds-resumed-stale-renewal",
				counts:
					"A gap says resume leaves renewsAt in the past, so the nightly job charges a resumed subscription for the paused months, one month per night or all at once, because it renews from renewsAt rather than from the day it runs.",
				doesNotCount:
					"Paused subscriptions being skipped, or pausing in general, without a resumed subscription being charged for the paused time.",
			},
		],
		falseAlarms: [
			{
				id: "approach-raises-no-replica-double-run",
				counts:
					"A gap's situation is several replicas, or overlapping scheduler runs, running the renewals job more than once a night and charging a customer twice.",
				doesNotCount:
					"Noting that the job_runs claim makes the job run once a day.",
			},
			{
				id: "approach-raises-no-crash-double-charge",
				counts:
					"A gap's situation is a crash or failure between the charge and the save that leads to the customer being charged twice when the job runs again.",
				doesNotCount:
					"Noting that the repeated idempotency key prevents a second charge, or a crash causing a different problem, such as a lost decline count.",
			},
		],
		real: ["C1", "C4", "C6"],
		notReal: ["C2", "C3", "C5"],
		file: "src/proration.ts",
		evidenceCheck: "adjudication-confirmed-evidence-cites-proration",
	},
};

export function rubricIds(fixture: FrontierFixture): string[] {
	const key = FRONTIER_KEYS[fixture];
	return [...key.gaps, ...key.falseAlarms].map((item) => item.id);
}

// A judge's decision on each rubric item for one answer. `answerId` ties it to the exact answer
// text it judged; `gap` is the index of the gap that meets the item.
export const Judgement = z
	.object({
		answerId: z.string(),
		items: z.array(
			z
				.object({
					id: z.string(),
					met: z.boolean(),
					gap: z.number().int().nonnegative().nullable(),
					reason: z.string(),
				})
				.strict(),
		),
	})
	.strict();
export type Judgement = z.infer<typeof Judgement>;

export function answerId(raw: string): string {
	return createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

export function stripFences(raw: string): string {
	const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return fenced?.[1] ?? raw.trim();
}

export function parseFrontierAnswer(raw: string): FrontierAnswer | null {
	try {
		return FrontierAnswer.parse(JSON.parse(stripFences(raw)));
	} catch {
		return null;
	}
}

// Why a judgement cannot be used for this answer, or undefined when it can.
export function judgementProblem(
	raw: string,
	fixture: FrontierFixture,
	judgement: Judgement,
): string | undefined {
	const expectedId = answerId(raw);
	if (judgement.answerId !== expectedId) {
		return `the judgement is for answer ${judgement.answerId}, not this answer (${expectedId})`;
	}
	const ids = judgement.items.map((item) => item.id);
	const wanted = rubricIds(fixture);
	if (
		ids.length !== wanted.length ||
		new Set(ids).size !== ids.length ||
		wanted.some((id) => !ids.includes(id))
	) {
		return `the judgement must decide each rubric item once: ${wanted.join(", ")}; it decided ${ids.join(", ") || "none"}`;
	}
	const gapCount = parseFrontierAnswer(raw)?.approach.gaps.length ?? 0;
	for (const item of judgement.items) {
		if (item.met && (item.gap === null || item.gap >= gapCount)) {
			return `${item.id} is met but names gap ${item.gap}, and the answer has ${gapCount} gaps`;
		}
		if (!item.met && item.gap !== null) {
			return `${item.id} is not met but names gap ${item.gap}`;
		}
	}
	return undefined;
}

export interface FrontierCheck {
	id: string;
	hidden: boolean;
	passed: boolean;
}

export interface FrontierScore {
	utility: number;
	criticalMisses: number;
	repairAttempts: number;
	checks: FrontierCheck[];
	selectedWorkerModel: string;
}

export function scoreFrontierAnswer(
	raw: string,
	model: string,
	fixture: FrontierFixture,
	judgement?: Judgement,
): FrontierScore {
	const key = FRONTIER_KEYS[fixture];
	const parsed = parseFrontierAnswer(raw);
	const gaps = parsed?.approach.gaps ?? [];
	if (gaps.length > 0 && !judgement) {
		throw new Error(
			"this answer lists gaps, so scoring it needs a judgement (frontier-judge.ts prompt)",
		);
	}
	if (judgement) {
		const problem = judgementProblem(raw, fixture, judgement);
		if (problem) throw new Error(problem);
	}
	const met = (id: string) =>
		gaps.length > 0 &&
		(judgement?.items.find((item) => item.id === id)?.met ?? false);
	const checks: FrontierCheck[] = [
		{ id: "output-contract", hidden: false, passed: parsed !== null },
		{
			id: "approach-not-sound",
			hidden: true,
			passed: parsed !== null && parsed.approach.verdict !== "sound",
		},
	];
	let criticalMisses = 0;
	for (const planted of key.gaps) {
		const found = met(planted.id);
		checks.push({ id: planted.id, hidden: true, passed: found });
		if (!found) criticalMisses += 1;
	}
	for (const alarm of key.falseAlarms) {
		checks.push({
			id: alarm.id,
			hidden: true,
			passed: parsed !== null && !met(alarm.id),
		});
	}
	const decisions = new Map(
		(parsed?.adjudication.decisions ?? []).map((decision) => [
			decision.id,
			decision,
		]),
	);
	for (const id of key.real) {
		const passed = decisions.get(id)?.verdict === "confirmed";
		checks.push({ id: `adjudication-confirms-${id}`, hidden: true, passed });
		if (!passed) criticalMisses += 1;
	}
	for (const id of key.notReal) {
		checks.push({
			id: `adjudication-rejects-${id}`,
			hidden: true,
			passed: decisions.get(id)?.verdict === "rejected",
		});
	}
	checks.push({
		id: key.evidenceCheck,
		hidden: true,
		passed: key.real.every(
			(id) =>
				decisions.get(id)?.verdict === "confirmed" &&
				(decisions.get(id)?.evidence ?? "").includes(key.file),
		),
	});
	const passedCount = checks.filter((check) => check.passed).length;
	return {
		utility: Math.max(passedCount / checks.length, 0.01),
		criticalMisses,
		repairAttempts: 0,
		checks,
		selectedWorkerModel: model,
	};
}

// Why a self-test cannot vouch for scores on this fixture, or undefined when it can.
export function selfTestProblem(
	fixture: FrontierFixture,
	selfTest: JudgeSelfTest,
): string | undefined {
	const prefix = `${fixture}:`;
	if (
		!selfTest.goodReference.startsWith(prefix) ||
		!selfTest.badReference.startsWith(prefix)
	) {
		return `the self-test was run on ${selfTest.goodReference} and ${selfTest.badReference}, not on the ${fixture} calibration`;
	}
	return judgeSelfTestProblem({ scoredBy: "judge", selfTest });
}

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (isHelpRequest(args)) {
		console.log(
			helpText({
				usage: [FRONTIER_EVAL_USAGE],
				inputs: { judgement: Judgement, "self-test": JudgeSelfTest },
				notes: [
					"The judgement comes from `frontier-judge.ts prompt`; the self-test from `frontier-judge.ts self-test`.",
					"An answer with no gaps, or outside the output contract, needs no judgement.",
				],
			}),
		);
		process.exit(0);
	}
	const [answerPath, resultPath, model, fixtureArg] = args;
	const fixture = fixtureArg as FrontierFixture;
	const selfTestPath = option(args, "--self-test");
	const judgementPath = option(args, "--judgement");
	if (
		!answerPath ||
		!resultPath ||
		!model ||
		!FRONTIER_FIXTURES.includes(fixture) ||
		!selfTestPath
	) {
		console.error(`usage: ${FRONTIER_EVAL_USAGE}`);
		process.exit(2);
	}
	const selfTest = JudgeSelfTest.parse(
		JSON.parse(await readFile(selfTestPath, "utf8")),
	);
	const refused = selfTestProblem(fixture, selfTest);
	if (refused) {
		console.error(refused);
		process.exit(1);
	}
	const raw = await readFile(answerPath, "utf8");
	const judgement = judgementPath
		? Judgement.parse(
				JSON.parse(stripFences(await readFile(judgementPath, "utf8"))),
			)
		: undefined;
	let score: FrontierScore;
	try {
		score = scoreFrontierAnswer(raw, model, fixture, judgement);
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
	await writeFile(
		resultPath,
		`${JSON.stringify({ ...score, scoring: { scoredBy: "judge", selfTest } }, null, 2)}\n`,
	);
	console.log(
		JSON.stringify({
			utility: score.utility,
			criticalMisses: score.criticalMisses,
		}),
	);
}
