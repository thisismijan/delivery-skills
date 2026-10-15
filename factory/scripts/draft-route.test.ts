import { expect, test } from "bun:test";
import { routeAfterAssessment, routeAfterFeasibility } from "./draft-route";
import type { AssessmentVerdict, FeasibilityVerdict } from "./verdicts";

const good: AssessmentVerdict = {
	quality: "good",
	gaps: [],
	derivedAcceptanceCriteria: ["AC1"],
	confidence: "high",
};
const vague: AssessmentVerdict = {
	quality: "needs_clarification",
	gaps: ["no acceptance criteria"],
	derivedAcceptanceCriteria: [],
	confidence: "low",
};
const bad: AssessmentVerdict = {
	quality: "reject",
	gaps: ["out of scope"],
	derivedAcceptanceCriteria: [],
	confidence: "high",
};

test("good assessment -> continue (null)", () => {
	expect(routeAfterAssessment(good)).toBeNull();
});
test("needs_clarification -> clarify", () => {
	expect(routeAfterAssessment(vague)?.decision).toBe("clarify");
});
test("reject -> reject", () => {
	expect(routeAfterAssessment(bad)?.decision).toBe("reject");
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
