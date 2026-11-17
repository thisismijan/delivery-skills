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

function assessment(
	overrides: Partial<AssessmentVerdict> = {},
): AssessmentVerdict {
	return {
		quality: "good",
		scopeFit: "atomic",
		splitRecommendation: [],
		gaps: [],
		derivedAcceptanceCriteria: ["Saving twice keeps one record"],
		confidence: "high",
		...overrides,
	};
}

function feasibility(
	overrides: Partial<FeasibilityVerdict> = {},
): FeasibilityVerdict {
	return {
		feasible: "yes",
		approachSketch: "reuse the existing upsert",
		affectedAreas: [],
		contractsTouched: [],
		risks: [],
		complexitySignal: "low",
		...overrides,
	};
}

const script = join(import.meta.dir, "draft-route.ts");
function runCommand(...args: string[]) {
	const result = Bun.spawnSync(["bun", script, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

describe("routing after the ticket assessment", () => {
	test("a good atomic ticket returns null so drafting continues", () => {
		expect(routeAfterAssessment(assessment())).toBeNull();
	});

	test.each([
		["no", []],
		["four", ["a", "b", "c", "d"]],
	])(
		"a good ticket with %s acceptance criteria asks for clarification",
		(_label, criteria) => {
			expect(
				routeAfterAssessment(
					assessment({ derivedAcceptanceCriteria: criteria as string[] }),
				),
			).toMatchObject({
				decision: "clarify",
				state: "CLARIFICATION_REQUESTED",
			});
		},
	);

	test("a ticket that needs clarification asks for it and names the gaps", () => {
		const routing = routeAfterAssessment(
			assessment({
				quality: "needs_clarification",
				gaps: ["no acceptance criteria"],
				derivedAcceptanceCriteria: [],
				confidence: "low",
			}),
		);
		expect(routing?.decision).toBe("clarify");
		expect(routing?.reason).toContain("no acceptance criteria");
	});

	test("a rejected ticket is rejected with its gaps", () => {
		const routing = routeAfterAssessment(
			assessment({
				quality: "reject",
				gaps: ["out of scope"],
				derivedAcceptanceCriteria: [],
			}),
		);
		expect(routing).toMatchObject({ decision: "reject", state: "REJECTED" });
		expect(routing?.reason).toContain("out of scope");
	});

	test("an oversized ticket needs a split even when it is otherwise good", () => {
		const routing = routeAfterAssessment(
			assessment({
				scopeFit: "too_large",
				splitRecommendation: [
					"Publish the read endpoint",
					"Show the data on the dashboard",
				],
			}),
		);
		expect(routing).toMatchObject({
			decision: "clarify",
			state: "SPLIT_REQUIRED",
		});
		expect(routing?.reason).toContain("Publish the read endpoint");
		expect(routing?.reason).toContain("Show the data on the dashboard");
	});

	test("an oversized ticket with no proposed split still stops and asks for atomic tickets", () => {
		const routing = routeAfterAssessment(
			assessment({ scopeFit: "too_large", splitRecommendation: [] }),
		);
		expect(routing?.decision).toBe("clarify");
		expect(routing?.state).toBe("SPLIT_REQUIRED");
		expect(routing?.reason).toContain("atomic");
	});
});

describe("routing after the feasibility check", () => {
	test("feasible work proceeds with the approach sketch as its reason", () => {
		expect(routeAfterFeasibility(feasibility())).toEqual({
			decision: "proceed",
			state: "FEASIBLE",
			reason: "reuse the existing upsert",
		});
	});

	test.each(["no", "needs_human"] as const)(
		"a %s answer escalates",
		(feasible) => {
			const routing = routeAfterFeasibility(
				feasibility({ feasible, approachSketch: "", complexitySignal: "high" }),
			);
			expect(routing).toMatchObject({
				decision: "escalate",
				state: "ESCALATED",
			});
			expect(routing.reason).not.toMatch(/feasible=|needs_human/);
		},
	);

	test("an escalation names the risks the analyst found", () => {
		const routing = routeAfterFeasibility(
			feasibility({ feasible: "no", risks: ["changes the login flow"] }),
		);
		expect(routing.reason).toContain("changes the login flow");
	});
});

describe("routing the approach challenge", () => {
	const gap = {
		case: "a call made through a method reference",
		evidence: "src/A.java:12",
	};
	const rethink = {
		verdict: "rethink",
		gaps: [gap],
		rethink: {
			problem: "Text matching cannot find every call.",
			alternative: "fail closed",
		},
		reasoning: "r",
	};
	const parse = (fields: Record<string, unknown>) =>
		parseApproachChallengeVerdict(
			JSON.stringify({ gaps: [], rethink: null, reasoning: "r", ...fields }),
		);

	test("a sound approach proceeds with no gaps", () => {
		expect(routeApproachChallenge(parse({ verdict: "sound" }), 1)).toEqual({
			action: "proceed",
			reason: "r",
			gaps: [],
		});
	});

	test("gaps come back as scenarios to add", () => {
		expect(
			routeApproachChallenge(parse({ verdict: "gaps", gaps: [gap] }), 1),
		).toMatchObject({ action: "add-scenarios", gaps: [gap] });
	});

	test("the first rethink revises and the last one escalates", () => {
		expect(routeApproachChallenge(parse(rethink), 1)).toMatchObject({
			action: "revise",
			gaps: [gap],
			reason: expect.stringContaining("Alternative: fail closed"),
		});
		expect(
			routeApproachChallenge(parse(rethink), MAX_APPROACH_CHALLENGES),
		).toMatchObject({
			action: "escalate",
			reason: expect.stringContaining("still cannot cover"),
		});
	});

	test.each([
		["sound with a gap", { verdict: "sound", gaps: [gap] }],
		["gaps with none listed", { verdict: "gaps" }],
		[
			"gaps with a rethink",
			{
				verdict: "gaps",
				gaps: [gap],
				rethink: { problem: "p", alternative: "a" },
			},
		],
		["rethink without one", { verdict: "rethink", gaps: [gap] }],
		["an unknown verdict", { verdict: "unsure" }],
		["an extra key", { verdict: "sound", extra: 1 }],
	])("%s is refused", (_label, fields) => {
		expect(() => parse(fields)).toThrow();
	});

	test.each([0, MAX_APPROACH_CHALLENGES + 1])(
		"attempt %d is outside the allowed range",
		(attempt) => {
			expect(() =>
				routeApproachChallenge(parse({ verdict: "sound" }), attempt),
			).toThrow();
		},
	);
});

describe("draft-route command", () => {
	test("approach exits 0 on a revise, 3 on an escalation, and 1 on a malformed verdict", () => {
		const rethink = JSON.stringify({
			verdict: "rethink",
			gaps: [{ case: "c", evidence: "e" }],
			rethink: { problem: "p", alternative: "a" },
			reasoning: "r",
		});
		expect(runCommand("approach", rethink, "1").exitCode).toBe(0);
		expect(runCommand("approach", rethink, "2").exitCode).toBe(3);
		expect(
			runCommand("approach", JSON.stringify({ verdict: "sound" }), "1")
				.exitCode,
		).toBe(1);
	});

	test("a good assessment prints a proceed decision", () => {
		const result = runCommand("assessment", JSON.stringify(assessment()));
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			decision: "proceed",
			state: "ASSESSED_OK",
		});
	});

	test("an escalating feasibility verdict is printed and exits 0", () => {
		const result = runCommand(
			"feasibility",
			JSON.stringify(feasibility({ feasible: "no" })),
		);
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout).decision).toBe("escalate");
	});

	test("an unknown mode prints the usage and exits 2", () => {
		expect(runCommand("verify", "{}").exitCode).toBe(2);
	});
});
