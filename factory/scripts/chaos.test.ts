import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRoute } from "./classify-route";
import { loadConfig } from "./config";
import { EscalateError, assertOrEscalate } from "./escalate";
import { findChange } from "./find-change";
import { groomOutputDir } from "./groom-paths";
import { routeReview } from "./review-route";
import { evaluateGate } from "./test-gate";
import {
	type ReviewVerdict,
	parseClassificationVerdict,
	parseReviewVerdict,
} from "./verdicts";
import { verifyChangeArtifacts } from "./verify-change";
import { verifyTicket } from "./verify-ticket";

// Each case feeds a guard bad or contradictory input and asserts that it
// refuses, escalates or throws. None of them may ever proceed.

function verdict(changes: Partial<ReviewVerdict> = {}): ReviewVerdict {
	return {
		satisfied: "changes_requested",
		specFaithful: false,
		testsMeaningful: false,
		codeMatchesSpec: false,
		readyForMain: true,
		findings: ["x"],
		shouldEscalate: false,
		reasoning: "",
		...changes,
	};
}

const allGood: Partial<ReviewVerdict> = {
	satisfied: "yes",
	specFaithful: true,
	testsMeaningful: true,
	codeMatchesSpec: true,
	readyForMain: true,
	findings: [],
};

describe("gates and inputs that must not pass", () => {
	test("a review verdict that is not JSON throws", () => {
		const parse = () => parseReviewVerdict("{not json");
		expect(parse).toThrow();
	});

	test("a red gate whose tests passed is not satisfied", () => {
		const green = {
			passed: true,
			exitCode: 0,
			output: "",
			timedOut: false,
			executedExpectedTests: true,
		};
		expect(evaluateGate(green, "red").ok).toBe(false);
	});

	test("a change folder that does not exist is not ok", async () => {
		const report = await verifyChangeArtifacts("/nonexistent-change-dir-xyz");
		expect(report.ok).toBe(false);
	});

	test("a change that plans implementation before tests is not ok", async () => {
		const dir = await mkdtemp(join(tmpdir(), "factory-chaos-"));
		try {
			await mkdir(join(dir, "specs"));
			const files = {
				"specs/spec.md": "# Spec",
				"proposal.md": "# Proposal",
				"design.md": "# Design",
				"tasks.md": "1. Implement the feature\n2. Write tests",
			};
			for (const [name, text] of Object.entries(files)) {
				await writeFile(join(dir, name), text);
			}
			expect((await verifyChangeArtifacts(dir)).ok).toBe(false);
		} finally {
			await rm(dir, { recursive: true });
		}
	});

	test("a key matching two changes resolves to no change", () => {
		expect(findChange("XY-1", ["xy-1-a", "xy-1-b"]).match).toBeNull();
	});

	test("a zero fix-attempt budget does not load", () => {
		const load = () => loadConfig({ MAX_FIX_ATTEMPTS: "0" });
		expect(load).toThrow();
	});

	test("assertOrEscalate escalates on a missing value", () => {
		expect(() => assertOrEscalate(undefined, "no value given")).toThrow(
			EscalateError,
		);
	});
});

describe("review routing never approves an unready verdict", () => {
	test.each<[string, Partial<ReviewVerdict>]>([
		["changes requested", {}],
		["a rejection", { satisfied: "reject" }],
		["an escalated yes", { satisfied: "yes", shouldEscalate: true }],
	])("%s on the first of two attempts", (_label, changes) => {
		expect(routeReview(verdict(changes), 1, 2).action).not.toBe("approve");
	});

	// Parsing would refuse this verdict; routing has to refuse it on its own
	// too, in case a caller builds one by hand.
	test("satisfied yes with readyForMain false is never approved", () => {
		const contradictory = verdict({
			...allGood,
			readyForMain: false,
			findings: ["the auth check can be bypassed"],
			reasoning: "says yes but also says not ready for main",
		});
		expect(routeReview(contradictory, 1, 2).action).not.toBe("approve");
		expect(routeReview(contradictory, 2, 2).action).not.toBe("approve");
		const escalated = { ...contradictory, shouldEscalate: true };
		expect(routeReview(escalated, 1, 2).action).not.toBe("approve");
	});
});

describe("re-review on the cumulative holdout path", () => {
	test("changes still requested at the last attempt escalates", () => {
		const stuck = verdict({
			findings: ["still broken"],
			reasoning: "needs more work",
		});
		const routed = routeReview(stuck, 2, 2);
		expect(routed.action).not.toBe("approve");
		expect(routed.action).toBe("escalate");
	});

	test("a rejection is not approved", () => {
		const rejected = verdict({
			satisfied: "reject",
			testsMeaningful: true,
			findings: ["fundamentally wrong approach"],
			reasoning: "rejected",
		});
		expect(routeReview(rejected, 1, 2).action).not.toBe("approve");
	});

	test("a yes flagged for escalation is not approved", () => {
		const flagged = verdict({
			...allGood,
			shouldEscalate: true,
			reasoning: "satisfied but flagged",
		});
		expect(routeReview(flagged, 1, 2).action).not.toBe("approve");
	});

	test("a verdict that is not JSON throws", () => {
		const parse = () => parseReviewVerdict("{not valid json");
		expect(parse).toThrow();
	});

	test("an unknown satisfied value throws", () => {
		const maybe = {
			...allGood,
			satisfied: "maybe",
			shouldEscalate: false,
			reasoning: "ok",
		};
		expect(() => parseReviewVerdict(JSON.stringify(maybe))).toThrow();
	});
});

describe("comment classification never reaches an action", () => {
	test.each([
		["text that is not JSON", "{bad json"],
		["an empty string", ""],
		[
			"a single object instead of a list",
			JSON.stringify({
				commentId: "c-1",
				classification: "bug",
				reasoning: "x",
			}),
		],
		["null", JSON.stringify(null)],
		[
			"an unknown classification",
			JSON.stringify([
				{ commentId: "c-2", classification: "wontfix", reasoning: "y" },
			]),
		],
	])("parsing %s throws", (_label, text) => {
		expect(() => parseClassificationVerdict(text)).toThrow();
	});

	test.each(["wontfix", ""])(
		"routing the classification %p throws",
		(value) => {
			expect(() => classifyRoute(value)).toThrow();
		},
	);
});

interface TicketParts {
	stories?: string[];
	criteria?: string;
}

function ticket(parts: TicketParts = {}): string {
	const stories = parts.stories ?? [
		"- As an analyst I want a CSV export so that I can chart the numbers.",
	];
	const criteria =
		parts.criteria ??
		"- [ ] Given saved rows, When the analyst exports, Then a CSV file is offered";
	return [
		"# Ticket",
		"## Context",
		"Analysts copy numbers out by hand today.",
		"## User stories",
		...stories,
		"## What to build",
		"An export action.",
		"## Acceptance criteria",
		criteria,
		"## Out of scope",
		"Imports.",
		"## Blocked by",
		"Nothing.",
		"",
	].join("\n\n");
}

describe("groom never accepts a malformed ticket as final", () => {
	test("the well-formed baseline does verify", async () => {
		expect((await verifyTicket(ticket())).ok).toBe(true);
	});

	test.each<[string, TicketParts, RegExp]>([
		[
			"no acceptance criteria",
			{ criteria: "Prose about the behaviour, but not a single checkbox." },
			/^Missing acceptance criteria/m,
		],
		[
			"two user stories",
			{
				stories: [
					"- As an analyst I want a CSV export so that I can chart it.",
					"- As an admin I want an audit trail so that I can trace exports.",
				],
			},
			/Too many user stories/,
		],
		[
			"a criterion that is not Given/When/Then",
			{ criteria: "- [ ] The export button is visible" },
			/Given\/When\/Then/,
		],
		[
			"four acceptance criteria",
			{
				criteria: [
					"- [ ] Given rows, When exported, Then a file downloads",
					"- [ ] Given an export, When it ends, Then an audit event is kept",
					"- [ ] Given an export, When it fails, Then an error is shown",
					"- [ ] Given alerts on, When an export ends, Then an email goes out",
				].join("\n"),
			},
			/Too many acceptance criteria/,
		],
	])("a ticket with %s", async (_label, parts, problem) => {
		const result = await verifyTicket(ticket(parts));
		expect(result.ok).toBe(false);
		expect(result.missing.join("\n")).toMatch(problem);
	});
});

describe("groom output never leaves .delivery/grooming/", () => {
	const ROOT = ".delivery/grooming/";

	test.each([
		"normal grooming title",
		"../../../root",
		"/etc/passwd",
		"/absolute/path/injection",
		"..\\system",
		"normal title",
		"another normal title",
		"  spaces and stuff  ",
		"title with / slashes",
	])("the title %p stays under the grooming root", (title) => {
		expect(groomOutputDir(title).startsWith(ROOT)).toBe(true);
	});

	test("a ../ title is stripped of every traversal sequence", () => {
		const dir = groomOutputDir("../../../etc/passwd");
		expect(dir.startsWith(ROOT)).toBe(true);
		expect(dir).not.toContain("../");
		expect(dir).not.toContain("..");
	});

	test("a backslash title keeps no backslash", () => {
		const dir = groomOutputDir("..\\..\\windows\\system32");
		expect(dir.startsWith(ROOT)).toBe(true);
		expect(dir).not.toContain("\\");
	});

	test("a title mixing separators keeps no ../", () => {
		const dir = groomOutputDir("../foo/../../bar");
		expect(dir.startsWith(ROOT)).toBe(true);
		expect(dir).not.toContain("../");
	});
});
