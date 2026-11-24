import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	FRONTIER_KEYS,
	type FrontierFixture,
	type Judgement,
	answerId,
	rubricIds,
	scoreFrontierAnswer,
	selfTestProblem,
} from "./frontier-eval-score";

// A judgement that meets exactly the listed rubric items, each by the first gap.
function judged(
	raw: string,
	fixture: FrontierFixture,
	met: readonly string[],
): Judgement {
	return {
		answerId: answerId(raw),
		items: rubricIds(fixture).map((id) => ({
			id,
			met: met.includes(id),
			gap: met.includes(id) ? 0 : null,
			reason: "test",
		})),
	};
}

const planted = (fixture: FrontierFixture) =>
	FRONTIER_KEYS[fixture].gaps.map((item) => item.id);

const perfect = {
	approach: {
		verdict: "rethink",
		gaps: [
			{
				case: "The server forks four worker processes, so each keeps its own counter",
				evidence: "src/server.ts:9",
			},
			{
				case: "Anonymous clients have no user id to key the limit by",
				evidence: "src/auth.ts:13",
			},
		],
		rethink: { problem: "Per-process memory", alternative: "A shared store" },
		reasoning: "In-process counters cannot limit a multi-process server.",
	},
	adjudication: {
		decisions: [
			{ id: "C1", verdict: "confirmed", evidence: "src/fees.ts:12" },
			{ id: "C2", verdict: "confirmed", evidence: "src/fees.ts:22" },
			{ id: "C3", verdict: "rejected", evidence: "src/fees.ts:5" },
			{ id: "C4", verdict: "rejected", evidence: "src/fees.ts:17" },
		],
	},
};

test("a complete, correct answer that the judge says finds every planted gap passes every check", () => {
	const raw = JSON.stringify(perfect);
	const score = scoreFrontierAnswer(
		raw,
		"model-a",
		"rate-limit",
		judged(raw, "rate-limit", planted("rate-limit")),
	);
	expect(score.checks.every((check) => check.passed)).toBe(true);
	expect(score).toMatchObject({
		utility: 1,
		criticalMisses: 0,
		selectedWorkerModel: "model-a",
	});
	const fenced = `\`\`\`json\n${raw}\n\`\`\``;
	expect(
		scoreFrontierAnswer(
			fenced,
			"m",
			"rate-limit",
			judged(fenced, "rate-limit", planted("rate-limit")),
		).utility,
	).toBe(1);
});

test("a planted gap the judge says was missed, or a rejected real bug, is a critical miss; confirming a false one is not", () => {
	const weak = structuredClone(perfect);
	const decisions = weak.adjudication.decisions;
	(decisions[0] as { verdict: string }).verdict = "rejected";
	(decisions[2] as { verdict: string }).verdict = "confirmed";
	const raw = JSON.stringify(weak);
	const score = scoreFrontierAnswer(
		raw,
		"model-b",
		"rate-limit",
		judged(raw, "rate-limit", ["approach-names-anonymous-clients"]),
	);
	expect(score.criticalMisses).toBe(2);
	expect(
		score.checks.filter((check) => !check.passed).map((check) => check.id),
	).toEqual([
		"approach-cites-multi-process-server",
		"adjudication-confirms-C1",
		"adjudication-rejects-C3",
		"adjudication-confirmed-evidence-cites-fees",
	]);
});

test("an answer outside the contract needs no judge, fails every check, and keeps a positive utility", () => {
	const score = scoreFrontierAnswer(
		"I think the approach is fine.",
		"model-c",
		"rate-limit",
	);
	expect(score.checks.some((check) => check.passed)).toBe(false);
	expect(score.utility).toBe(0.01);
	expect(score.criticalMisses).toBe(4);
});

test("an answer with gaps cannot be scored without a judgement", () => {
	expect(() =>
		scoreFrontierAnswer(JSON.stringify(perfect), "m", "rate-limit"),
	).toThrow("needs a judgement");
});

test("a judgement is refused unless it is for this answer and decides each rubric item once, coherently", () => {
	const raw = JSON.stringify(perfect);
	const good = judged(raw, "rate-limit", planted("rate-limit"));
	const score = (judgement: Judgement) => () =>
		scoreFrontierAnswer(raw, "m", "rate-limit", judgement);
	expect(score({ ...good, answerId: answerId(`${raw} `) })).toThrow(
		"not this answer",
	);
	expect(score({ ...good, items: good.items.slice(1) })).toThrow(
		"each rubric item once",
	);
	expect(
		score({ ...good, items: [...good.items, good.items[0] as never] }),
	).toThrow("each rubric item once");
	expect(
		score({
			...good,
			items: good.items.map((item) => ({ ...item, gap: 2 })),
		}),
	).toThrow("names gap 2, and the answer has 2 gaps");
	expect(
		score({
			...good,
			items: good.items.map((item) => ({ ...item, met: false })),
		}),
	).toThrow("is not met but names gap 0");
});

const webhookPerfect = {
	approach: {
		verdict: "rethink",
		gaps: [
			{
				case: "Two deliveries of one event run at the same time; both pass the set check before either records the id",
				evidence: "src/queue.ts:8",
			},
			{
				case: "The dedupe key is the X-Event-Id header, which the signature does not cover",
				evidence: "src/signature.ts:5",
			},
			{
				case: "The provider sends charge.refunded, but only refund.created has a handler",
				evidence: "docs/provider-events.md:13",
			},
		],
		rethink: {
			problem: "Check then act",
			alternative: "Insert first with a unique key",
		},
		reasoning: "The set check races and trusts an unsigned id.",
	},
	adjudication: {
		decisions: [
			{ id: "C1", verdict: "rejected", evidence: "src/ledger.ts:31" },
			{ id: "C2", verdict: "rejected", evidence: "src/ledger.ts:36" },
			{ id: "C3", verdict: "confirmed", evidence: "src/ledger.ts:44" },
			{ id: "C4", verdict: "rejected", evidence: "src/ledger.ts:35" },
			{ id: "C5", verdict: "confirmed", evidence: "src/ledger.ts:49" },
		],
	},
};

test("the webhook fixture scores three planted gaps, the decoy, and five candidates", () => {
	const raw = JSON.stringify(webhookPerfect);
	const score = scoreFrontierAnswer(
		raw,
		"m",
		"webhook",
		judged(raw, "webhook", planted("webhook")),
	);
	expect(score.checks.every((check) => check.passed)).toBe(true);
	expect(score.checks).toHaveLength(12);
	const raised = scoreFrontierAnswer(
		raw,
		"m",
		"webhook",
		judged(raw, "webhook", [
			...planted("webhook"),
			"approach-raises-no-multi-process-false-alarm",
		]),
	);
	expect(raised.criticalMisses).toBe(0);
	expect(
		raised.checks.find(
			(check) => check.id === "approach-raises-no-multi-process-false-alarm",
		)?.passed,
	).toBe(false);
});

test("the renewals fixture scores four planted gaps, two decoys, and six candidates", () => {
	const answer = {
		approach: {
			verdict: "gaps",
			gaps: [{ case: "something", evidence: "src/dates.ts:11" }],
			rethink: null,
			reasoning: "r",
		},
		adjudication: {
			decisions: ["C1", "C2", "C3", "C4", "C5", "C6"].map((id) => ({
				id,
				verdict: ["C1", "C4", "C6"].includes(id) ? "confirmed" : "rejected",
				evidence: `src/proration.ts:${id.slice(1)}`,
			})),
		},
	};
	const raw = JSON.stringify(answer);
	const all = scoreFrontierAnswer(
		raw,
		"m",
		"renewals",
		judged(raw, "renewals", planted("renewals")),
	);
	expect(all.checks).toHaveLength(15);
	expect(all.utility).toBe(1);
	const nothing = scoreFrontierAnswer(
		raw,
		"m",
		"renewals",
		judged(raw, "renewals", [
			"approach-raises-no-replica-double-run",
			"approach-raises-no-crash-double-charge",
		]),
	);
	expect(nothing.criticalMisses).toBe(4);
	expect(
		nothing.checks.filter((check) => !check.passed).map((check) => check.id),
	).toEqual([
		...planted("renewals"),
		"approach-raises-no-replica-double-run",
		"approach-raises-no-crash-double-charge",
	]);
});

test("a self-test vouches only for its own fixture, and only when it ranked good above bad", () => {
	const selfTest = {
		model: "judge",
		goodReference: "renewals:good",
		badReference: "renewals:bad",
		goodScore: 1,
		badScore: 0.3,
	};
	expect(selfTestProblem("renewals", selfTest)).toBeUndefined();
	expect(selfTestProblem("webhook", selfTest)).toContain(
		"not on the webhook calibration",
	);
	expect(selfTestProblem("renewals", { ...selfTest, badScore: 1 })).toContain(
		"scored the known-bad reference",
	);
});

const script = join(import.meta.dir, "frontier-eval-score.ts");

test("the command refuses to score without a self-test and records the judge's self-test with the score", async () => {
	const dir = await mkdtemp(join(tmpdir(), "frontier-score-"));
	const raw = JSON.stringify(perfect);
	await writeFile(join(dir, "answer.json"), raw);
	await writeFile(
		join(dir, "judgement.json"),
		JSON.stringify(judged(raw, "rate-limit", planted("rate-limit"))),
	);
	const selfTest = {
		model: "judge-model",
		goodReference: "rate-limit:good",
		badReference: "rate-limit:bad",
		goodScore: 1,
		badScore: 0.5,
	};
	await writeFile(join(dir, "self-test.json"), JSON.stringify(selfTest));
	const run = (...extra: string[]) =>
		Bun.spawnSync(
			[
				"bun",
				script,
				join(dir, "answer.json"),
				join(dir, "result.json"),
				"model-a",
				"rate-limit",
				...extra,
			],
			{ env: process.env },
		);
	expect(run().exitCode).toBe(2);
	const missing = run("--self-test", join(dir, "self-test.json"));
	expect(missing.exitCode).toBe(1);
	expect(missing.stderr.toString()).toContain("needs a judgement");
	const scored = run(
		"--self-test",
		join(dir, "self-test.json"),
		"--judgement",
		join(dir, "judgement.json"),
	);
	expect(scored.exitCode).toBe(0);
	const result = JSON.parse(await readFile(join(dir, "result.json"), "utf8"));
	expect(result.utility).toBe(1);
	expect(result.scoring).toEqual({ scoredBy: "judge", selfTest });
});

// The answer key says these behaviours hold. Run the fixture's own code, in the deployment's
// time zone, so an edit to the fixture cannot silently invalidate the key.
test("the renewals fixture's code behaves as its answer key says", () => {
	const fixture = join(
		import.meta.dir,
		"../evaluations/frontier/renewals/fixture/src",
	);
	const probe = `
		const { addMonths, isoDay } = await import(${JSON.stringify(join(fixture, "dates.ts"))});
		const p = await import(${JSON.stringify(join(fixture, "proration.ts"))});
		const march = p.periodBounds(2026, 3);
		console.log(JSON.stringify({
			afterJan31: isoDay(addMonths(new Date("2026-01-31T00:00:00Z"), 1)),
			marchDays: p.daysBetween(march.start, march.end),
			day08: p.parseDayOfMonth("08"),
			refundOrder: p.refundOrder([250, 1000, 5]),
			capped: p.capped({ description: "", amount: "900", cap: "1000" }),
			emptyCredit: p.totalCredit([]),
			zeroPeriod: (() => { try { p.prorate(100, 1, 0); return "returned"; } catch { return "throws"; } })(),
		}));
	`;
	const result = Bun.spawnSync(["bun", "-e", probe], {
		env: { ...process.env, TZ: "Europe/London" },
	});
	expect(result.exitCode).toBe(0);
	expect(JSON.parse(result.stdout.toString())).toEqual({
		afterJan31: "2026-03-03",
		marchDays: 30,
		day08: 8,
		refundOrder: [1000, 250, 5],
		capped: "1000",
		emptyCredit: 0,
		zeroPeriod: "throws",
	});
});
