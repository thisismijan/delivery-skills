import { expect, test } from "bun:test";
import { formatReviewSummary } from "./review-summary";
import type { ReviewVerdict } from "./verdicts";

const satisfied: ReviewVerdict = {
	satisfied: "yes",
	specFaithful: true,
	testsMeaningful: true,
	codeMatchesSpec: true,
	readyForMain: true,
	findings: [],
	shouldEscalate: false,
	reasoning: "All good.",
};

test("renders a satisfied verdict in plain language with Yes/No, never raw field names", () => {
	const out = formatReviewSummary(satisfied);
	expect(out).toBe(
		[
			"Holdout review - Satisfied",
			"",
			"Spec is faithful to the ticket: Yes",
			"Tests are meaningful: Yes",
			"Code matches the spec: Yes",
			"Code is ready for main: Yes",
			"",
			"No outstanding findings.",
		].join("\n"),
	);
});

test("never leaks the internal field names", () => {
	const out = formatReviewSummary(satisfied);
	for (const leak of [
		"specFaithful",
		"testsMeaningful",
		"codeMatchesSpec",
		"satisfied=",
		"shouldEscalate",
	]) {
		expect(out).not.toContain(leak);
	}
});

test("maps changes_requested to a human heading and No flags", () => {
	const out = formatReviewSummary({
		...satisfied,
		satisfied: "changes_requested",
		testsMeaningful: false,
		findings: ["Add a test for the empty-input case"],
	});
	expect(out).toContain("Holdout review - Changes requested");
	expect(out).toContain("Tests are meaningful: No");
	expect(out).toContain("Outstanding findings:");
	expect(out).toContain("- Add a test for the empty-input case");
});

test("maps reject to a human heading", () => {
	expect(formatReviewSummary({ ...satisfied, satisfied: "reject" })).toContain(
		"Holdout review - Rejected",
	);
});

// ---------------------------------------------------------------------------
// SMAI-1745: readyForMain code-readiness line
// ---------------------------------------------------------------------------

test("renders a plain-language readiness line with 'Yes' and no raw field name", () => {
	const out = formatReviewSummary({ ...satisfied, readyForMain: true });
	expect(out).toContain("Code is ready for main: Yes");
	expect(out).not.toContain("readyForMain");
});

test("renders a plain-language readiness line with 'No' when readyForMain is false", () => {
	const out = formatReviewSummary({
		...satisfied,
		satisfied: "changes_requested",
		readyForMain: false,
		findings: ["Fix the N+1 query in the fetch loop"],
	});
	expect(out).toContain("Code is ready for main: No");
	expect(out).not.toContain("readyForMain");
});

test("sanitizes em dashes inside findings", () => {
	const out = formatReviewSummary({
		...satisfied,
		satisfied: "changes_requested",
		findings: ["Missing guard — fix it"],
	});
	expect(out).toContain("- Missing guard - fix it");
	expect(out).not.toContain("—");
});
