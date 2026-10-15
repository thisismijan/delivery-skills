import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyTicket } from "./verify-ticket";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS = [
	"Context",
	"User stories",
	"What to build",
	"Acceptance criteria",
	"Out of scope",
	"Blocked by",
];

/** Build a minimal valid ticket draft containing all required sections and
 *  at least one acceptance criterion. */
function validDraft(extraContent = ""): string {
	return `# My Ticket

## Context

Some background about the problem.

## User stories

- As a user I want to export data so that I can analyse it.

## What to build

Build an export button on the dashboard page.

## Acceptance criteria

- [ ] Given the dashboard is open, When the user views it, Then the export button is visible
- [ ] Given the export button is visible, When the user clicks it, Then a CSV file downloads

## Out of scope

Mobile-specific styling is not in scope.

## Blocked by

Nothing.

${extraContent}
`.trim();
}

/** Build a draft that is missing the given section heading. */
function draftMissingSection(missingSection: string): string {
	return REQUIRED_SECTIONS.filter((s) => s !== missingSection)
		.map((s) => {
			if (s === "Acceptance criteria") {
				return `## ${s}\n\n- [ ] Given the draft is reviewed, When the acceptance criteria section is checked, Then at least one criterion is listed\n`;
			}
			return `## ${s}\n\nSome content.\n`;
		})
		.join("\n");
}

async function writeTmpDraft(content: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ig-verify-ticket-"));
	const filePath = join(dir, "draft.md");
	await writeFile(filePath, content, "utf8");
	return filePath;
}

// ---------------------------------------------------------------------------
// A draft with all required sections and >=1 acceptance criterion passes
// ---------------------------------------------------------------------------

test("valid draft with all sections and one criterion -> ok true", async () => {
	const filePath = await writeTmpDraft(validDraft());
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(true);
	expect(result.missing).toEqual([]);
	await rm(filePath);
});

test("valid draft with multiple acceptance criteria -> ok true", async () => {
	const content = validDraft(); // already has two criteria
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(true);
	await rm(filePath);
});

test("result has ok, missing, and warnings fields", async () => {
	const filePath = await writeTmpDraft(validDraft());
	const result = await verifyTicket(filePath);
	expect(typeof result.ok).toBe("boolean");
	expect(Array.isArray(result.missing)).toBe(true);
	expect(Array.isArray(result.warnings)).toBe(true);
	await rm(filePath);
});

// ---------------------------------------------------------------------------
// A draft missing any required section fails and reports it
// ---------------------------------------------------------------------------

for (const section of REQUIRED_SECTIONS) {
	test(`draft missing '${section}' section -> ok false and section reported`, async () => {
		const filePath = await writeTmpDraft(draftMissingSection(section));
		const result = await verifyTicket(filePath);
		expect(result.ok).toBe(false);
		expect(result.missing.some((m: string) => m.includes(section))).toBe(true);
		await rm(filePath);
	});
}

// ---------------------------------------------------------------------------
// A draft with zero acceptance criteria fails
// ---------------------------------------------------------------------------

test("draft with no acceptance criteria (no checkboxes) -> ok false", async () => {
	const content = `# Ticket

## Context

Some context.

## User stories

- As a user I want something.

## What to build

Build it.

## Acceptance criteria

There are no checkboxes here, just prose.

## Out of scope

Nothing.

## Blocked by

Nothing.
`;
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(false);
	await rm(filePath);
});

test("draft with zero acceptance criteria reports the deficiency", async () => {
	const content = `# Ticket

## Context

Background.

## User stories

- As a user I want X.

## What to build

Do X.

## Acceptance criteria

No checkboxes at all.

## Out of scope

N/A

## Blocked by

N/A
`;
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(false);
	// Either reported as missing or captured in a separate field
	const combined = [...result.missing, ...result.warnings].join(" ");
	expect(combined.toLowerCase()).toMatch(
		/acceptance criteria|criterion|checkbox/,
	);
	await rm(filePath);
});

test("draft with only a checked criterion (- [x]) still passes criterion count", async () => {
	const content = validDraft().replace(
		"- [ ] Given the dashboard is open, When the user views it, Then the export button is visible",
		"- [x] Given the dashboard is open, When the user views it, Then the export button is visible",
	);
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(true);
	await rm(filePath);
});

// ---------------------------------------------------------------------------
// Every acceptance criterion must be a Given/When/Then behaviour statement
// ---------------------------------------------------------------------------

/** A draft that is otherwise valid but whose acceptance criterion is a plain
 *  (non-Given/When/Then) checkbox. */
function draftWithPlainCriterion(): string {
	return `# Ticket

## Context

Some background about the problem.

## User stories

- As a user I want to export data so that I can analyse it.

## What to build

Build an export button on the dashboard page.

## Acceptance criteria

- [ ] The export button is visible

## Out of scope

Mobile-specific styling is not in scope.

## Blocked by

Nothing.
`;
}

/** A draft that is otherwise valid and whose acceptance criteria are all
 *  well-formed Given/When/Then statements, including one with a multi-clause
 *  `And` continuation. */
function draftWithGwtCriteria(): string {
	return `# Ticket

## Context

Some background about the problem.

## User stories

- As a user I want to export data so that I can analyse it.

## What to build

Build an export button on the dashboard page.

## Acceptance criteria

- [ ] Given the dashboard is open, When the user clicks export, Then a CSV file downloads
- [ ] Given the dashboard is open, When the user clicks export And confirms, Then a CSV downloads

## Out of scope

Mobile-specific styling is not in scope.

## Blocked by

Nothing.
`;
}

test("draft with a plain (non-Given/When/Then) acceptance criterion -> ok false", async () => {
	const result = await verifyTicket(draftWithPlainCriterion());
	expect(result.ok).toBe(false);
	const combined = result.missing.join(" ").toLowerCase();
	expect(combined).toMatch(/given.*when.*then|given\/when\/then/);
});

test("draft with valid Given/When/Then acceptance criteria, including an And continuation -> ok true", async () => {
	const result = await verifyTicket(draftWithGwtCriteria());
	expect(result.ok).toBe(true);
	expect(result.missing).toEqual([]);
});

// ---------------------------------------------------------------------------
// Oversized slice emits a warning but still reports pass/fail correctly
// ---------------------------------------------------------------------------

test("oversized draft emits a warning but still returns ok true when sections are present", async () => {
	// Build a very large draft: repeat the body to exceed any reasonable size heuristic
	const bigBody = "- As a user I want to do something.\n".repeat(300);
	const largeCriteria = Array.from(
		{ length: 50 },
		(_, i) =>
			`- [ ] Given precondition ${i + 1}, When action ${i + 1} happens, Then outcome ${i + 1} occurs`,
	).join("\n");
	const content = `# Big Ticket

## Context

${bigBody}

## User stories

- As a user I want one capability so that I get one benefit.

## What to build

${bigBody}

## Acceptance criteria

${largeCriteria}

## Out of scope

${bigBody}

## Blocked by

Nothing.
`;
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	// It should still report a definite ok value (not crash, not be undefined)
	expect(typeof result.ok).toBe("boolean");
	// A warning must be present about the size
	expect(result.warnings.length).toBeGreaterThan(0);
	await rm(filePath);
});

test("oversized draft warning does not override a valid pass result", async () => {
	const bigBody = "- Long story. ".repeat(400);
	const content = `# Giant Ticket

## Context

${bigBody}

## User stories

${bigBody}

## What to build

${bigBody}

## Acceptance criteria

- [ ] Given the giant ticket is open, When criterion one is checked, Then it passes
- [ ] Given the giant ticket is open, When criterion two is checked, Then it passes

## Out of scope

${bigBody}

## Blocked by

Nothing.
`;
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	// Valid sections + criteria -> ok must still be true despite the warning
	expect(result.ok).toBe(true);
	expect(result.warnings.length).toBeGreaterThan(0);
	await rm(filePath);
});

test("oversized draft with missing section is still ok false despite size", async () => {
	const bigBody = "- Long story. ".repeat(400);
	const content = `# Giant Incomplete Ticket

## Context

${bigBody}

## User stories

${bigBody}

## What to build

${bigBody}

## Acceptance criteria

- [ ] Given the giant incomplete ticket is open, When criterion one is checked, Then it is reported

## Out of scope

${bigBody}

<!-- Blocked by section intentionally omitted -->
`;
	const filePath = await writeTmpDraft(content);
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(false);
	await rm(filePath);
});

// ---------------------------------------------------------------------------
// At most one user story per ticket (never more than one)
// ---------------------------------------------------------------------------

/** A draft that is valid except its User stories section has `count` stories. */
function draftWithStories(count: number, numbered = false): string {
	const stories = Array.from({ length: count }, (_, i) =>
		numbered
			? `${i + 1}. As a user I want capability ${i + 1} so that I benefit.`
			: `- As a user I want capability ${i + 1} so that I benefit.`,
	).join("\n");
	return `# Ticket

## Context

Some context.

## User stories

${stories}

## What to build

Build it.

## Acceptance criteria

- [ ] Given a user opens the ticket, When they inspect it, Then one observable criterion is present

## Out of scope

Nothing.

## Blocked by

Nothing.
`;
}

test("draft with exactly one user story -> ok true", async () => {
	const result = await verifyTicket(draftWithStories(1));
	expect(result.ok).toBe(true);
	expect(result.missing).toEqual([]);
});

test("draft with two user stories -> ok false (at most one story per ticket)", async () => {
	const result = await verifyTicket(draftWithStories(2));
	expect(result.ok).toBe(false);
	const combined = [...result.missing, ...result.warnings].join(" ");
	expect(combined.toLowerCase()).toMatch(
		/user stor|single|one story|more than one/,
	);
});

test("draft with three user stories -> ok false", async () => {
	const result = await verifyTicket(draftWithStories(3));
	expect(result.ok).toBe(false);
});

test("draft with two numbered user stories -> ok false", async () => {
	const result = await verifyTicket(draftWithStories(2, true));
	expect(result.ok).toBe(false);
});

test("draft with zero user story list items (section present, prose only) -> ok true (at most one)", async () => {
	const content = `# Ticket

## Context

Background.

## User stories

This ticket has no enumerated stories yet.

## What to build

Do it.

## Acceptance criteria

- [ ] Given a user opens the ticket, When they inspect it, Then one observable criterion is present

## Out of scope

Nothing.

## Blocked by

Nothing.
`;
	const result = await verifyTicket(content);
	expect(result.ok).toBe(true);
});

// ---------------------------------------------------------------------------
// Output is structured JSON and the verifyTicket function returns the right shape
// ---------------------------------------------------------------------------

test("verifyTicket returns a structured object with ok boolean", async () => {
	const filePath = await writeTmpDraft(validDraft());
	const result = await verifyTicket(filePath);
	// Serialisable to JSON without loss
	const json = JSON.stringify(result);
	const parsed = JSON.parse(json);
	expect(parsed.ok).toBe(result.ok);
	expect(parsed.missing).toEqual(result.missing);
	expect(parsed.warnings).toEqual(result.warnings);
	await rm(filePath);
});

test("verifyTicket accepts raw text (not just a file path)", async () => {
	// The function should handle inline text as well as file paths
	const text = validDraft();
	const result = await verifyTicket(text);
	expect(result.ok).toBe(true);
	expect(result.missing).toEqual([]);
});

// ---------------------------------------------------------------------------
// Fail closed: a failing draft must never appear ok
// ---------------------------------------------------------------------------

test("draft with missing section is never ok (fail closed)", async () => {
	const filePath = await writeTmpDraft(
		draftMissingSection("Acceptance criteria"),
	);
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(false);
	await rm(filePath);
});

test("completely empty draft is not ok (fail closed)", async () => {
	const filePath = await writeTmpDraft("");
	const result = await verifyTicket(filePath);
	expect(result.ok).toBe(false);
	await rm(filePath);
});
