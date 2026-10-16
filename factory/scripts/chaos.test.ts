import { expect, test } from "bun:test";
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
import { parseClassificationVerdict, parseReviewVerdict } from "./verdicts";
import { verifyChangeArtifacts } from "./verify-change";
import { verifyTicket } from "./verify-ticket";

test("malformed verdict never parses (fail closed)", () => {
	expect(() => parseReviewVerdict("{not json")).toThrow();
});

test("a passing red gate is never satisfied", () => {
	expect(
		evaluateGate(
			{
				passed: true,
				exitCode: 0,
				output: "",
				timedOut: false,
				executedExpectedTests: true,
			},
			"red",
		).ok,
	).toBe(false);
});

test("an empty change dir is never ok", async () => {
	expect((await verifyChangeArtifacts("/nonexistent-change-dir-xyz")).ok).toBe(
		false,
	);
});

test("implementation-first tasks are never accepted as a valid change", async () => {
	const dir = await mkdtemp(join(tmpdir(), "factory-chaos-"));
	await writeFile(join(dir, "proposal.md"), "# Proposal");
	await writeFile(join(dir, "design.md"), "# Design");
	await mkdir(join(dir, "specs"));
	await writeFile(join(dir, "specs", "spec.md"), "# Spec");
	await writeFile(
		join(dir, "tasks.md"),
		"1. Implement the feature\n2. Write tests",
	);
	expect((await verifyChangeArtifacts(dir)).ok).toBe(false);
	await rm(dir, { recursive: true });
});

test("ambiguous change never yields a single match", () => {
	expect(findChange("XY-1", ["xy-1-a", "xy-1-b"]).match).toBeNull();
});

test("invalid config never loads", () => {
	expect(() => loadConfig({ MAX_FIX_ATTEMPTS: "0" })).toThrow();
});

test("a non-yes / escalated verdict never routes to approve", () => {
	const base = {
		satisfied: "changes_requested" as const,
		specFaithful: false,
		testsMeaningful: false,
		codeMatchesSpec: false,
		readyForMain: true,
		findings: ["x"],
		shouldEscalate: false,
		reasoning: "",
	};
	expect(routeReview(base, 1, 2).action).not.toBe("approve");
	expect(routeReview({ ...base, satisfied: "reject" }, 1, 2).action).not.toBe(
		"approve",
	);
	expect(
		routeReview({ ...base, satisfied: "yes", shouldEscalate: true }, 1, 2)
			.action,
	).not.toBe("approve");
});

test("assertOrEscalate fails closed on falsy input", () => {
	expect(() => assertOrEscalate(undefined, "missing")).toThrow(EscalateError);
});

// ---------------------------------------------------------------------------
// SMAI-1745: readyForMain standing guarantee
//
// A verdict with readyForMain: false must never yield "approve", even when
// every other field is internally inconsistent (satisfied: "yes").
// ---------------------------------------------------------------------------

test("a readyForMain: false verdict never yields approve, even with satisfied: 'yes' (defensive guard)", () => {
	const inconsistent = {
		satisfied: "yes" as const,
		specFaithful: true,
		testsMeaningful: true,
		codeMatchesSpec: true,
		readyForMain: false,
		findings: ["security hole in the auth check"],
		shouldEscalate: false,
		reasoning: "inconsistent verdict: satisfied yes but not ready for main",
	};
	expect(routeReview(inconsistent, 1, 2).action).not.toBe("approve");
	expect(routeReview(inconsistent, 2, 2).action).not.toBe("approve");
	expect(
		routeReview({ ...inconsistent, shouldEscalate: true }, 1, 2).action,
	).not.toBe("approve");
});

// ---------------------------------------------------------------------------
// SMAI-1443: ClassificationVerdict fail-closed chaos cases
//
// Bad ClassificationVerdict input must NEVER yield an action/proceed outcome.
// All cases below must throw (fail closed) before any routing can occur.
// ---------------------------------------------------------------------------

test("malformed ClassificationVerdict (bad JSON) never yields action — parsing throws", () => {
	expect(() => parseClassificationVerdict("{bad json")).toThrow();
});

test("empty string ClassificationVerdict never yields action — parsing throws", () => {
	expect(() => parseClassificationVerdict("")).toThrow();
});

test("non-array ClassificationVerdict (object at top-level) never yields action — parsing throws", () => {
	const notAnArray = {
		commentId: "c-1",
		classification: "bug",
		reasoning: "x",
	};
	expect(() =>
		parseClassificationVerdict(JSON.stringify(notAnArray)),
	).toThrow();
});

test("null ClassificationVerdict never yields action — parsing throws", () => {
	expect(() => parseClassificationVerdict(JSON.stringify(null))).toThrow();
});

test("unknown enum in ClassificationVerdict never yields action — parsing throws", () => {
	const badEnum = [
		{ commentId: "c-1", classification: "wontfix", reasoning: "x" },
	];
	expect(() => parseClassificationVerdict(JSON.stringify(badEnum))).toThrow();
});

test("unknown classification never routes to an action group — classifyRoute throws", () => {
	expect(() => classifyRoute("wontfix")).toThrow();
	expect(() => classifyRoute("")).toThrow();
	// Confirm neither valid action groups nor silent defaults are returned
});

// ---------------------------------------------------------------------------
// SMAI-1443: Re-review ReviewVerdict fail-closed chaos cases
//
// A non-approve or malformed re-review verdict must never yield ready-mark or
// proceed. These mirror the existing review-route chaos cases but are explicit
// about the re-review (cumulative holdout) path.
// ---------------------------------------------------------------------------

test("re-review: non-approve 'changes_requested' at ceiling never yields approve", () => {
	const base = {
		satisfied: "changes_requested" as const,
		specFaithful: false,
		testsMeaningful: false,
		codeMatchesSpec: false,
		readyForMain: true,
		findings: ["still broken"],
		shouldEscalate: false,
		reasoning: "needs more work",
	};
	// At the ceiling (attempt === maxAttempts) this must escalate, not approve.
	const result = routeReview(base, 2, 2);
	expect(result.action).not.toBe("approve");
	expect(result.action).toBe("escalate");
});

test("re-review: 'reject' verdict never yields approve or ready-mark", () => {
	const rejectVerdict = {
		satisfied: "reject" as const,
		specFaithful: false,
		testsMeaningful: true,
		codeMatchesSpec: false,
		readyForMain: true,
		findings: ["fundamentally wrong approach"],
		shouldEscalate: false,
		reasoning: "rejected",
	};
	expect(routeReview(rejectVerdict, 1, 2).action).not.toBe("approve");
});

test("re-review: shouldEscalate=true on a 'yes' verdict never yields approve", () => {
	const escalatedYes = {
		satisfied: "yes" as const,
		specFaithful: true,
		testsMeaningful: true,
		codeMatchesSpec: true,
		readyForMain: true,
		findings: [],
		shouldEscalate: true,
		reasoning: "satisfied but flagged",
	};
	expect(routeReview(escalatedYes, 1, 2).action).not.toBe("approve");
});

test("re-review: malformed verdict JSON never yields approve — parsing throws", () => {
	expect(() => parseReviewVerdict("{not valid json")).toThrow();
});

test("re-review: verdict with invalid 'satisfied' enum never yields approve — parsing throws", () => {
	const badEnum = {
		satisfied: "maybe",
		specFaithful: true,
		testsMeaningful: true,
		codeMatchesSpec: true,
		findings: [],
		shouldEscalate: false,
		reasoning: "ok",
	};
	expect(() => parseReviewVerdict(JSON.stringify(badEnum))).toThrow();
});

// ---------------------------------------------------------------------------
// SMAI-1444: Groom standing guarantees
//
// 1. A draft with zero acceptance criteria must never verify as a writable
//    final artifact (verifyTicket returns ok false).
// 2. Any resolved output path from groomOutputDir must stay within
//    .delivery/grooming/ — even for adversarial titles containing ../, /, etc.
// ---------------------------------------------------------------------------

test("groom chaos: draft with zero acceptance criteria is never a valid final artifact", async () => {
	// A draft that contains all required sections but has zero checkboxes must
	// always return ok: false — it must never be treated as a writable final.
	const noCheckboxDraft = `# Ticket

## Context

Some background.

## User stories

- As a user I want something.

## What to build

Build it.

## Acceptance criteria

This section has prose but no checkboxes.

## Out of scope

N/A

## Blocked by

N/A
`;
	const result = await verifyTicket(noCheckboxDraft);
	expect(result.ok).toBe(false);
});

test("groom chaos: a draft with more than one user story is never a valid final artifact", async () => {
	// Every other section is valid; only the multiple user stories make it fail.
	const multiStoryDraft = `# Ticket

## Context

Background.

## User stories

- As a user I want capability one so that I benefit.
- As a user I want capability two so that I benefit.

## What to build

Build it.

## Acceptance criteria

- [ ] Given a user opens the ticket, When they inspect it, Then one observable criterion is present

## Out of scope

N/A

## Blocked by

N/A
`;
	const result = await verifyTicket(multiStoryDraft);
	expect(result.ok).toBe(false);
});

// ---------------------------------------------------------------------------
// SMAI-1576: A draft whose acceptance criteria are not Given/When/Then
// behaviour statements must never verify as a valid final artifact, even when
// every other section is otherwise well-formed.
// ---------------------------------------------------------------------------

test("groom chaos: a draft with a non-Given/When/Then acceptance criterion is never a valid final artifact", async () => {
	// Every other section is valid; only the plain (non-GWT) criterion should
	// make this fail.
	const nonGwtCriterionDraft = `# Ticket

## Context

Background.

## User stories

- As a user I want to export data so that I can analyse it.

## What to build

Build it.

## Acceptance criteria

- [ ] The export button is visible

## Out of scope

N/A

## Blocked by

N/A
`;
	const result = await verifyTicket(nonGwtCriterionDraft);
	expect(result.ok).toBe(false);
});

test("groom chaos: a draft with more than three acceptance criteria is never a valid final artifact", async () => {
	const oversizedCriterionSet = `# Ticket

## Context

Background.

## User stories

- As a user I want to export data so that I can analyse it.

## What to build

Build the export outcome.

## Acceptance criteria

- [ ] Given data exists, When export is requested, Then a file downloads
- [ ] Given export is requested, When it completes, Then an audit event is stored
- [ ] Given export is requested, When it fails, Then the user sees an error
- [ ] Given export completes, When alerts are enabled, Then an email is sent

## Out of scope

Imports.

## Blocked by

Nothing.
`;
	expect((await verifyTicket(oversizedCriterionSet)).ok).toBe(false);
});

test("groom chaos: groomOutputDir always stays within .delivery/grooming/ for a normal title", () => {
	const dir = groomOutputDir("normal grooming title");
	expect(dir.startsWith(".delivery/grooming/")).toBe(true);
});

test("groom chaos: adversarial title with ../ never escapes .delivery/grooming/", () => {
	const adversarial = "../../../etc/passwd";
	const dir = groomOutputDir(adversarial);
	// The resolved path must still start under the grooming root
	expect(dir.startsWith(".delivery/grooming/")).toBe(true);
	// It must not contain a path-traversal sequence
	expect(dir).not.toContain("../");
	expect(dir).not.toContain("..");
});

test("groom chaos: adversarial title with leading slash never escapes .delivery/grooming/", () => {
	const adversarial = "/absolute/path/injection";
	const dir = groomOutputDir(adversarial);
	expect(dir.startsWith(".delivery/grooming/")).toBe(true);
});

test("groom chaos: adversarial title with backslash never escapes .delivery/grooming/", () => {
	const adversarial = "..\\..\\windows\\system32";
	const dir = groomOutputDir(adversarial);
	expect(dir.startsWith(".delivery/grooming/")).toBe(true);
	expect(dir).not.toContain("\\");
});

test("groom chaos: adversarial title mixing path separators never escapes .delivery/grooming/", () => {
	const adversarial = "../foo/../../bar";
	const dir = groomOutputDir(adversarial);
	expect(dir.startsWith(".delivery/grooming/")).toBe(true);
	expect(dir).not.toContain("../");
});

test("groom chaos: groomOutputDir output never equals or escapes the parent of .delivery/grooming/", () => {
	const titles = [
		"../../../root",
		"/etc/passwd",
		"..\\system",
		"normal title",
		"another normal title",
		"  spaces and stuff  ",
		"title with / slashes",
	];
	for (const title of titles) {
		const dir = groomOutputDir(title);
		expect(dir.startsWith(".delivery/grooming/")).toBe(true);
	}
});
