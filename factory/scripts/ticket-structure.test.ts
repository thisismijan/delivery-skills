import { expect, test } from "bun:test";
import { inspectTicketStructure } from "./ticket-structure";
import { parseAssessmentVerdict } from "./verdicts";
import { SIZE_WARN_LINES } from "./verify-ticket";
import { WorkItem } from "./work-item-provider";

function item(
	body: string,
	title = "Export dashboard data",
	blockedBy: string[] = [],
): WorkItem {
	return WorkItem.parse({
		version: 1,
		provider: "sample",
		ref: "KEY-1",
		type: "story",
		title,
		body,
		blockedBy,
		notes: [],
	});
}

const validBody = `# Export dashboard data

## Context

Operators need a CSV of the current dashboard.

## User stories

- As an operator I want to export dashboard rows so that I can analyse them offline.

## What to build

Add an export control that downloads the visible rows as CSV.

## Acceptance criteria

- [ ] Given the dashboard is open, When the operator exports, Then a CSV file downloads
- [ ] Given an export completes, When the file is opened, Then it contains the visible rows

## Out of scope

PDF export.

## Blocked by

Nothing.
`;

test("a complete ticket with no open questions skips the assessor as good", async () => {
	const result = await inspectTicketStructure(item(validBody));
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.quality).toBe("good");
		expect(result.verdict.scopeFit).toBe("atomic");
		expect(result.verdict.gaps).toEqual([]);
		expect(result.verdict.derivedAcceptanceCriteria).toEqual([
			"Given the dashboard is open, When the operator exports, Then a CSV file downloads",
			"Given an export completes, When the file is opened, Then it contains the visible rows",
		]);
		expect(parseAssessmentVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});

test("a size warning skips the assessor as too large", async () => {
	const body = validBody.replace(
		"Operators need a CSV of the current dashboard.",
		["Operators need a CSV of the current dashboard.", ...Array(SIZE_WARN_LINES).fill("More context.")].join(
			"\n",
		),
	);
	const result = await inspectTicketStructure(item(body));
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.quality).toBe("needs_clarification");
		expect(result.verdict.scopeFit).toBe("too_large");
		expect(result.verdict.splitRecommendation).toHaveLength(1);
		expect(result.verdict.gaps.join(" ")).toMatch(/Draft is large/);
		expect(parseAssessmentVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});

test("a question in what to build still uses the assessor", async () => {
	const body = validBody.replace(
		"Add an export control that downloads the visible rows as CSV.",
		"Add an export control? Confirm the file format.",
	);
	expect(await inspectTicketStructure(item(body))).toEqual({
		skipAssessor: false,
	});
});

test("a URL query string does not count as an open question", async () => {
	const body = validBody.replace(
		"Add an export control that downloads the visible rows as CSV.",
		"Call https://example.test/export?format=csv and keep `GET /rows?limit=10`.",
	);
	const result = await inspectTicketStructure(item(body));
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.quality).toBe("good");
	}
});

test("optional syntax does not count as an open question", async () => {
	const body = validBody.replace(
		"Add an export control that downloads the visible rows as CSV.",
		"Accept timeout?: number, read user?.id, and fall back with ?? none.",
	);
	const result = await inspectTicketStructure(item(body));
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.quality).toBe("good");
	}
});

test("missing sections skip the assessor with those gaps", async () => {
	const result = await inspectTicketStructure(item("TBD"));
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.quality).toBe("needs_clarification");
		expect(result.verdict.scopeFit).toBe("atomic");
		expect(result.verdict.splitRecommendation).toEqual([]);
		expect(result.verdict.confidence).toBe("high");
		expect(result.verdict.gaps.join(" ")).toMatch(/Missing required section/);
		expect(parseAssessmentVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});

test("recorded blockers skip the assessor even when the body is valid", async () => {
	const result = await inspectTicketStructure(
		item(validBody, "Export dashboard data", ["KEY-2"]),
	);
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.quality).toBe("needs_clarification");
		expect(result.verdict.scopeFit).toBe("atomic");
		expect(result.verdict.gaps.join(" ")).toMatch(/blocked by KEY-2/i);
		expect(parseAssessmentVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});

test("too many user stories skip the assessor as too large", async () => {
	const body = validBody.replace(
		"- As an operator I want to export dashboard rows so that I can analyse them offline.",
		[
			"- As an operator I want to export dashboard rows so that I can analyse them offline.",
			"- As an operator I want email alerts so that I know when export fails.",
		].join("\n"),
	);
	const result = await inspectTicketStructure(item(body));
	expect(result.skipAssessor).toBe(true);
	if (result.skipAssessor) {
		expect(result.verdict.scopeFit).toBe("too_large");
		expect(result.verdict.splitRecommendation).toHaveLength(1);
		expect(result.verdict.gaps.join(" ")).toMatch(/Too many user stories/);
		expect(parseAssessmentVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});
