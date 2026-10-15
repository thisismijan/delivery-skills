import { expect, test } from "bun:test";
import { routeReview } from "./review-route";
import type { ReviewVerdict } from "./verdicts";

const base: ReviewVerdict = {
	satisfied: "yes",
	specFaithful: true,
	testsMeaningful: true,
	codeMatchesSpec: true,
	readyForMain: true,
	findings: [],
	shouldEscalate: false,
	reasoning: "all good",
};

test("satisfied yes -> approve (the factory never merges; a human does)", () => {
	expect(routeReview(base, 1, 2).action).toBe("approve");
});

test("reject -> escalate", () => {
	expect(routeReview({ ...base, satisfied: "reject" }, 1, 2).action).toBe(
		"escalate",
	);
});

test("changes_requested under the ceiling -> fix", () => {
	expect(
		routeReview(
			{ ...base, satisfied: "changes_requested", findings: ["x"] },
			1,
			2,
		).action,
	).toBe("fix");
});

test("changes_requested at the ceiling -> escalate", () => {
	expect(
		routeReview(
			{ ...base, satisfied: "changes_requested", findings: ["x"] },
			2,
			2,
		).action,
	).toBe("escalate");
});

test("shouldEscalate overrides even a 'yes' -> escalate (never approves when flagged)", () => {
	expect(routeReview({ ...base, shouldEscalate: true }, 1, 2).action).toBe(
		"escalate",
	);
});

// ---------------------------------------------------------------------------
// SMAI-1745: readyForMain defensive guard - a false code-readiness dimension
// can never reach "approve", even when satisfied: "yes".
// ---------------------------------------------------------------------------

test("readyForMain: false with attempts remaining routes to fix and carries findings into the reason", () => {
	const result = routeReview(
		{
			...base,
			satisfied: "yes",
			readyForMain: false,
			findings: ["swallowed error in the catch block"],
		},
		1,
		2,
	);
	expect(result.action).toBe("fix");
	expect(result.reason).toContain("swallowed error in the catch block");
});

test("readyForMain: false at the attempt ceiling routes to escalate", () => {
	const result = routeReview(
		{ ...base, satisfied: "yes", readyForMain: false, findings: ["N+1 query"] },
		2,
		2,
	);
	expect(result.action).toBe("escalate");
});

test("readyForMain: false with shouldEscalate set routes to escalate", () => {
	const result = routeReview(
		{
			...base,
			satisfied: "yes",
			readyForMain: false,
			shouldEscalate: true,
			findings: ["security hole"],
		},
		1,
		2,
	);
	expect(result.action).toBe("escalate");
});

test("readyForMain: false with satisfied: 'yes' can never route to approve, regardless of attempt count (defensive guard)", () => {
	expect(
		routeReview({ ...base, satisfied: "yes", readyForMain: false }, 1, 2)
			.action,
	).not.toBe("approve");
	expect(
		routeReview({ ...base, satisfied: "yes", readyForMain: false }, 2, 2)
			.action,
	).not.toBe("approve");
});
