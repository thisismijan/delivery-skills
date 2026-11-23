import { expect, test } from "bun:test";
import { scoreFrontierAnswer } from "./frontier-eval-score";

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

test("a complete, correct answer passes every check with no critical miss", () => {
	const score = scoreFrontierAnswer(JSON.stringify(perfect), "model-a");
	expect(score.checks.every((check) => check.passed)).toBe(true);
	expect(score).toMatchObject({
		utility: 1,
		criticalMisses: 0,
		selectedWorkerModel: "model-a",
	});
	expect(
		scoreFrontierAnswer(`\`\`\`json\n${JSON.stringify(perfect)}\n\`\`\``, "m")
			.utility,
	).toBe(1);
});

test("missing a planted gap or a real bug is a critical miss; confirming a false one is not", () => {
	const weak = structuredClone(perfect);
	weak.approach.gaps = [
		weak.approach.gaps[1] as (typeof weak.approach.gaps)[number],
	];
	const decisions = weak.adjudication.decisions;
	(decisions[0] as { verdict: string }).verdict = "rejected";
	(decisions[2] as { verdict: string }).verdict = "confirmed";
	const score = scoreFrontierAnswer(JSON.stringify(weak), "model-b");
	expect(score.criticalMisses).toBe(2);
	const failed = score.checks
		.filter((check) => !check.passed)
		.map((check) => check.id);
	expect(failed).toEqual([
		"approach-cites-multi-process-server",
		"adjudication-confirms-C1",
		"adjudication-rejects-C3",
		"adjudication-confirmed-evidence-cites-fees",
	]);
});

test("an answer outside the contract fails every check but keeps a positive utility", () => {
	const score = scoreFrontierAnswer("I think the approach is fine.", "model-c");
	expect(score.checks.some((check) => check.passed)).toBe(false);
	expect(score.utility).toBe(0.01);
	expect(score.criticalMisses).toBe(4);
});
