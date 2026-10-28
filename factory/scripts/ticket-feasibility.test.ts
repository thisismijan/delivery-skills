import { expect, test } from "bun:test";
import { inspectTicketFeasibility } from "./ticket-feasibility";
import { parseFeasibilityVerdict } from "./verdicts";
import { WorkItem } from "./work-item-provider";

function item(body: string): WorkItem {
	return WorkItem.parse({
		version: 1,
		provider: "sample",
		ref: "KEY-1",
		type: "story",
		title: "Export dashboard data",
		body,
		blockedBy: [],
		notes: [],
	});
}

const ordinary = `# Export dashboard data

## Context

Operators need a CSV of the current dashboard.

## User stories

- As an operator I want to export dashboard rows so that I can analyse them offline.

## What to build

Add an export control that downloads the visible rows as CSV.

## Acceptance criteria

- [ ] Given the dashboard is open, When the operator exports, Then a CSV file downloads

## Out of scope

Authentication changes.

## Blocked by

Nothing.
`;

test("a complete ticket with no questions skips the analyst as feasible", async () => {
	const result = await inspectTicketFeasibility(item(ordinary));
	expect(result.skipAnalyst).toBe(true);
	if (result.skipAnalyst) {
		expect(result.verdict.feasible).toBe("yes");
		expect(result.verdict.complexitySignal).toBe("medium");
		expect(result.verdict.approachSketch).toMatch(/export control/i);
		expect(parseFeasibilityVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});

test("authentication in what to build skips the analyst", async () => {
	const body = ordinary.replace(
		"Add an export control that downloads the visible rows as CSV.",
		"Add authentication for the export control.",
	);
	const result = await inspectTicketFeasibility(item(body));
	expect(result.skipAnalyst).toBe(true);
	if (result.skipAnalyst) {
		expect(result.verdict.feasible).toBe("needs_human");
		expect(result.verdict.complexitySignal).toBe("high");
		expect(parseFeasibilityVerdict(JSON.stringify(result.verdict))).toEqual(
			result.verdict,
		);
	}
});

test("a mention only in out of scope is not treated as sensitive", async () => {
	const result = await inspectTicketFeasibility(item(ordinary));
	expect(result.skipAnalyst).toBe(true);
	if (result.skipAnalyst) {
		expect(result.verdict.feasible).toBe("yes");
	}
});

test("a data migration in acceptance criteria skips the analyst", async () => {
	const body = ordinary.replace(
		"Then a CSV file downloads",
		"Then a data migration rewrites the rows",
	);
	const result = await inspectTicketFeasibility(item(body));
	expect(result.skipAnalyst).toBe(true);
	if (result.skipAnalyst) {
		expect(result.verdict.feasible).toBe("needs_human");
	}
});

test("a question in what to build still uses the analyst", async () => {
	const body = ordinary.replace(
		"Add an export control that downloads the visible rows as CSV.",
		"Add an export control? Confirm the file format.",
	);
	expect(await inspectTicketFeasibility(item(body))).toEqual({
		skipAnalyst: false,
	});
});

test("a URL query string does not count as an open question", async () => {
	const body = ordinary.replace(
		"Add an export control that downloads the visible rows as CSV.",
		"Call https://example.test/export?format=csv and keep `GET /rows?limit=10`.",
	);
	const result = await inspectTicketFeasibility(item(body));
	expect(result.skipAnalyst).toBe(true);
	if (result.skipAnalyst) {
		expect(result.verdict.feasible).toBe("yes");
	}
});
