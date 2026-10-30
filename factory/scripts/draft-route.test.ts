import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	MAX_APPROACH_CHALLENGES,
	routeAfterAssessment,
	routeAfterFeasibility,
	routeApproachChallenge,
} from "./draft-route";
import {
	type AssessmentVerdict,
	type FeasibilityVerdict,
	parseApproachChallengeVerdict,
} from "./verdicts";

const good: AssessmentVerdict = {
	quality: "good",
	scopeFit: "atomic",
	splitRecommendation: [],
	gaps: [],
	derivedAcceptanceCriteria: ["AC1"],
	confidence: "high",
};
const vague: AssessmentVerdict = {
	quality: "needs_clarification",
	scopeFit: "atomic",
	splitRecommendation: [],
	gaps: ["no acceptance criteria"],
	derivedAcceptanceCriteria: [],
	confidence: "low",
};
const bad: AssessmentVerdict = {
	quality: "reject",
	scopeFit: "atomic",
	splitRecommendation: [],
	gaps: ["out of scope"],
	derivedAcceptanceCriteria: [],
	confidence: "high",
};

test("good assessment -> continue (null)", () => {
	expect(routeAfterAssessment(good)).toBeNull();
});
test("good assessment with no acceptance criteria fails closed", () => {
	expect(
		routeAfterAssessment({ ...good, derivedAcceptanceCriteria: [] })?.decision,
	).toBe("clarify");
});
test("needs_clarification -> clarify", () => {
	expect(routeAfterAssessment(vague)?.decision).toBe("clarify");
});
test("reject -> reject", () => {
	expect(routeAfterAssessment(bad)?.decision).toBe("reject");
});

test("oversized ticket -> split required even when other quality fields are good", () => {
	const oversized: AssessmentVerdict = {
		...good,
		scopeFit: "too_large",
		splitRecommendation: [
			"Expose the read contract",
			"Render the contract in the dashboard",
		],
	};
	const result = routeAfterAssessment(oversized);
	expect(result?.decision).toBe("clarify");
	expect(result?.state).toBe("SPLIT_REQUIRED");
	expect(result?.reason).toContain("Expose the read contract");
});

test("oversized ticket without a split proposal still fails closed", () => {
	const result = routeAfterAssessment({
		...good,
		scopeFit: "too_large",
		splitRecommendation: [],
	});
	expect(result?.decision).toBe("clarify");
	expect(result?.reason).toContain("atomic");
});

const feasible: FeasibilityVerdict = {
	feasible: "yes",
	approachSketch: "do X",
	affectedAreas: [],
	contractsTouched: [],
	risks: [],
	complexitySignal: "low",
};
const infeasible: FeasibilityVerdict = {
	feasible: "no",
	approachSketch: "",
	affectedAreas: [],
	contractsTouched: [],
	risks: ["touches auth"],
	complexitySignal: "high",
};
const needsHuman: FeasibilityVerdict = {
	feasible: "needs_human",
	approachSketch: "",
	affectedAreas: [],
	contractsTouched: [],
	risks: [],
	complexitySignal: "high",
};

test("feasible yes -> proceed", () => {
	expect(routeAfterFeasibility(feasible).decision).toBe("proceed");
});
test("infeasible no -> escalate", () => {
	expect(routeAfterFeasibility(infeasible).decision).toBe("escalate");
});
test("needs_human -> escalate", () => {
	expect(routeAfterFeasibility(needsHuman).decision).toBe("escalate");
});

describe("approach challenge routing", () => {
	const gap = {
		case: "a call written as a method reference",
		evidence: "src/A.java:12",
	};
	const verdict = (value: Record<string, unknown>) =>
		parseApproachChallengeVerdict(
			JSON.stringify({ gaps: [], rethink: null, reasoning: "r", ...value }),
		);

	test("sound proceeds, gaps become scenarios, and one rethink revises", () => {
		expect(routeApproachChallenge(verdict({ verdict: "sound" }), 1)).toEqual({
			action: "proceed",
			reason: "r",
			gaps: [],
		});
		expect(
			routeApproachChallenge(verdict({ verdict: "gaps", gaps: [gap] }), 1),
		).toMatchObject({ action: "add-scenarios", gaps: [gap] });
		const rethink = verdict({
			verdict: "rethink",
			gaps: [gap],
			rethink: {
				problem: "matching cannot be complete",
				alternative: "fail closed",
			},
		});
		expect(routeApproachChallenge(rethink, 1)).toMatchObject({
			action: "revise",
			reason: expect.stringContaining("Alternative: fail closed"),
		});
		expect(
			routeApproachChallenge(rethink, MAX_APPROACH_CHALLENGES),
		).toMatchObject({
			action: "escalate",
			reason: expect.stringContaining("still cannot cover"),
		});
	});

	test("a contradictory verdict or an out-of-range attempt fails closed", () => {
		expect(() => verdict({ verdict: "sound", gaps: [gap] })).toThrow();
		expect(() => verdict({ verdict: "gaps" })).toThrow();
		expect(() =>
			verdict({
				verdict: "gaps",
				gaps: [gap],
				rethink: { problem: "p", alternative: "a" },
			}),
		).toThrow();
		expect(() => verdict({ verdict: "rethink", gaps: [gap] })).toThrow();
		expect(() => verdict({ verdict: "unsure" })).toThrow();
		expect(() => verdict({ verdict: "sound", extra: 1 })).toThrow();
		expect(() =>
			routeApproachChallenge(verdict({ verdict: "sound" }), 0),
		).toThrow();
		expect(() =>
			routeApproachChallenge(
				verdict({ verdict: "sound" }),
				MAX_APPROACH_CHALLENGES + 1,
			),
		).toThrow();
	});

	test("the command exits 3 on escalate and 1 on a malformed verdict", () => {
		const script = join(import.meta.dir, "draft-route.ts");
		const run = (value: unknown, attempt: string) =>
			Bun.spawnSync(
				["bun", script, "approach", JSON.stringify(value), attempt],
				{
					stdout: "pipe",
					stderr: "pipe",
				},
			).exitCode;
		const rethink = {
			verdict: "rethink",
			gaps: [gap],
			rethink: { problem: "p", alternative: "a" },
			reasoning: "r",
		};
		expect(run(rethink, "1")).toBe(0);
		expect(run(rethink, "2")).toBe(3);
		expect(run({ verdict: "sound" }, "1")).toBe(1);
	});
});
