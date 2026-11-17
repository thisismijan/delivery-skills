import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { formatReviewSummary } from "./review-summary";
import type { ReviewVerdict } from "./verdicts";

const QUESTION = {
	spec: "Spec is faithful to the ticket",
	tests: "Tests are meaningful",
	code: "Code matches the spec",
	ready: "Code is ready for main",
};

function verdict(overrides: Partial<ReviewVerdict> = {}): ReviewVerdict {
	return {
		satisfied: "yes",
		specFaithful: true,
		testsMeaningful: true,
		codeMatchesSpec: true,
		readyForMain: true,
		findings: [],
		shouldEscalate: false,
		reasoning: "Nothing left to change.",
		...overrides,
	};
}

const FIELD_NAMES = [
	"specFaithful",
	"testsMeaningful",
	"codeMatchesSpec",
	"readyForMain",
	"shouldEscalate",
	"satisfied=",
];

describe("formatReviewSummary", () => {
	test("a satisfied review renders as a heading, four Yes answers, and no findings", () => {
		const expected = [
			"Holdout review - Satisfied",
			"",
			`${QUESTION.spec}: Yes`,
			`${QUESTION.tests}: Yes`,
			`${QUESTION.code}: Yes`,
			`${QUESTION.ready}: Yes`,
			"",
			"No outstanding findings.",
		];
		expect(formatReviewSummary(verdict()).split("\n")).toEqual(expected);
	});

	test.each([
		["satisfied", verdict()],
		[
			"failing",
			verdict({ satisfied: "changes_requested", readyForMain: false }),
		],
	])("a %s summary prints no verdict field name", (_label, input) => {
		const summary = formatReviewSummary(input);
		for (const name of FIELD_NAMES) expect(summary).not.toContain(name);
	});

	test("requested changes get their own heading, a No answer, and a bullet per finding", () => {
		const summary = formatReviewSummary(
			verdict({
				satisfied: "changes_requested",
				testsMeaningful: false,
				findings: ["Cover the empty list", "Name the constant"],
			}),
		);
		expect(summary).toContain("Holdout review - Changes requested");
		expect(summary).toContain(`${QUESTION.tests}: No`);
		expect(summary).toContain("Outstanding findings:");
		expect(summary).toContain("- Cover the empty list\n- Name the constant");
		expect(summary).not.toContain("No outstanding findings.");
	});

	test("a rejection gets its own heading", () => {
		expect(formatReviewSummary(verdict({ satisfied: "reject" }))).toContain(
			"Holdout review - Rejected",
		);
	});

	test("the code-readiness answer follows the dimension both ways", () => {
		expect(formatReviewSummary(verdict())).toContain(`${QUESTION.ready}: Yes`);
		expect(
			formatReviewSummary(
				verdict({
					satisfied: "changes_requested",
					readyForMain: false,
					findings: ["The loop issues one query per row"],
				}),
			),
		).toContain(`${QUESTION.ready}: No`);
	});

	test("an em dash in a finding is replaced before it reaches a person", () => {
		const summary = formatReviewSummary(
			verdict({
				satisfied: "changes_requested",
				findings: ["Guard the input \u2014 it can be null"],
			}),
		);
		expect(summary).toContain("- Guard the input - it can be null");
		expect(summary).not.toContain("\u2014");
	});
});

describe("review-summary command", () => {
	const script = join(import.meta.dir, "review-summary.ts");
	const rejected = JSON.stringify(verdict({ satisfied: "reject" }));

	test("renders a verdict given as an argument or on stdin", () => {
		const fromArgument = Bun.spawnSync(["bun", script, rejected], {
			stdout: "pipe",
		});
		const fromStdin = Bun.spawnSync(["bun", script], {
			stdin: new TextEncoder().encode(rejected),
			stdout: "pipe",
		});
		for (const result of [fromArgument, fromStdin]) {
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("Holdout review - Rejected");
		}
	});

	test("a malformed verdict exits 1", () => {
		const result = Bun.spawnSync(["bun", script, "{oops"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(1);
	});
});
