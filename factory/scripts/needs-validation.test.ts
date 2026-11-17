import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	NEEDS_VALIDATION_ACK_PHRASE,
	NEEDS_VALIDATION_CHECK_INVOCATION,
	NEEDS_VALIDATION_HEADING,
	needsValidationAcknowledgements,
	needsValidationId,
	parseClosedNeedsValidation,
	parseNeedsValidationItems,
	splitNeedsValidation,
} from "./needs-validation";
import { openNeedsValidation } from "./readiness-decision";

setDefaultTimeout(60_000);

const SCRIPT = join(import.meta.dir, "needs-validation.ts");
const IID = "840";
const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);
const TIME = "2026-11-16T09:30:00Z";

type Entry = { path: string; title: string; fact: string; check: string };

const RETRY: Entry = {
	path: "src/retry.ts",
	title: "the retry loop has no upper bound",
	fact: "how many replicas of the service run in production",
	check: "read the replica count for this service in the deploy dashboard",
};
const QUEUE: Entry = {
	path: "src/queue.ts",
	title: "the consumer assumes one partition",
	fact: "how many partitions the orders topic has in production",
	check: "read the partition count for the orders topic in the broker console",
};

function entry(number: number, e: Entry): string {
	return [
		`${number}. **\`${e.path}\` — ${e.title}**`,
		`   **Missing fact:** ${e.fact}.`,
		`   **Owner check:** ${e.check}.`,
	].join("\n");
}

function needsValidation(...entries: Entry[]): string {
	return [
		NEEDS_VALIDATION_HEADING,
		"",
		entries.map((e, index) => entry(index + 1, e)).join("\n\n"),
	].join("\n");
}

function closedEntry(number: number, e: Entry, title: string): string {
	return [
		`${number}. **\`${e.path}\` — closed: ${title}**`,
		`   **Missing fact:** ${e.fact}.`,
	].join("\n");
}

function review(options?: {
	iid?: string;
	head?: string;
	verdict?: string | null;
	findings?: string;
	section?: string;
	afterSection?: string;
	earlier?: string;
	marker?: string | null;
}): string {
	const iid = options?.iid ?? IID;
	const head = options?.head ?? HEAD;
	const lines = [`## Code review max — !${iid}`, "", `**Head:** \`${head}\``];
	if (options?.verdict !== null) {
		lines.push(`**Verdict:** ${options?.verdict ?? "PASS"}`);
	}
	lines.push("");
	if (options?.earlier) {
		lines.push("### Earlier findings", "", options.earlier, "");
	}
	lines.push("### Findings", "", options?.findings ?? "No findings.", "");
	if (options?.section) lines.push(options.section, "");
	if (options?.afterSection) lines.push(options.afterSection, "");
	lines.push("### Verification", "", "- ran the focused tests", "");
	const marker =
		options?.marker === undefined
			? `<!-- code-review-max:mr=${iid} head=${head} -->`
			: options.marker;
	if (marker) lines.push(marker);
	return `${lines.join("\n")}\n`;
}

const LATER_FINDING =
	"### Findings\n\n1. **[Medium] `src/a.ts:8` — missing test**";

function ack(
	itemId: string,
	options?: {
		scope?: string;
		who?: string;
		words?: string;
		time?: string;
	},
): string {
	const scope = options?.scope ?? `!${IID}`;
	const who = options?.who ?? "Sam Rivera";
	const words =
		options?.words ?? "Checked the replica count with the platform team.";
	const time = options?.time ?? TIME;
	return `- ${time} ${scope} — ${NEEDS_VALIDATION_ACK_PHRASE} ${itemId} — ${who} — "${words}"`;
}

function ledger(approvals: string[], extra = ""): string {
	return [
		"# Run",
		"",
		"Generation: 3",
		"",
		"## Decisions",
		"",
		"- 2026-11-16 run — groomed into one ticket — the change is small — https://tracker.example/DS-8",
		"",
		"## Approvals",
		"",
		...approvals,
		"",
		"## Stops",
		"",
		extra,
	].join("\n");
}

function idOf(e: Entry): string {
	return needsValidationId(e.path, e.fact);
}

function itemsOf(markdown: string) {
	return parseNeedsValidationItems(markdown).items;
}

describe("splitNeedsValidation", () => {
	test("takes the section out of the review and leaves the rest", () => {
		const split = splitNeedsValidation(
			review({ section: needsValidation(RETRY) }),
		);
		const inside = split.sections.join("\n");
		expect(inside).toContain(RETRY.fact);
		expect(inside).toContain(RETRY.check);
		expect(split.rest).not.toContain(RETRY.fact);
		expect(split.rest).not.toContain(RETRY.check);
		expect(split.rest).toContain("No findings.");
		expect(split.rest).toContain("### Verification");
		expect(split.rest).toContain("<!-- code-review-max:");
	});

	test("a review with no section has nothing inside and keeps all its text", () => {
		const text = review();
		const split = splitNeedsValidation(text);
		expect(split.sections.join("")).toBe("");
		expect(split.rest).toContain("No findings.");
		expect(split.rest).toContain("<!-- code-review-max:");
	});

	test("the section ends at the next heading", () => {
		const split = splitNeedsValidation(
			review({ section: needsValidation(RETRY) }),
		);
		expect(split.sections.join("\n")).not.toContain("### Verification");
		expect(split.sections.join("\n")).not.toContain("ran the focused tests");
		expect(split.rest).toContain("ran the focused tests");
	});

	test("the section ends at the marker comment", () => {
		const text = `${[
			"**Verdict:** PASS",
			"",
			needsValidation(RETRY),
			`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
		].join("\n")}\n`;
		const split = splitNeedsValidation(text);
		expect(split.sections.join("\n")).not.toContain("<!--");
		expect(split.rest).toContain(
			`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
		);
	});

	test("the heading is matched ignoring case and trailing space", () => {
		const loud = `${NEEDS_VALIDATION_HEADING.toUpperCase()}  `;
		const section = needsValidation(RETRY).replace(
			NEEDS_VALIDATION_HEADING,
			loud,
		);
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("\n")).toContain(RETRY.fact);
		expect(split.rest).not.toContain(RETRY.fact);
	});

	test("an indented heading does not start a section, so its item is read as text", () => {
		const section = needsValidation(RETRY).replace(
			NEEDS_VALIDATION_HEADING,
			`  ${NEEDS_VALIDATION_HEADING}`,
		);
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("\n")).not.toContain(RETRY.fact);
		expect(split.rest).toContain(RETRY.fact);
	});

	test("a heading of another level is not the section, so its text is read as ordinary review text", () => {
		const section = needsValidation(RETRY).replace(
			NEEDS_VALIDATION_HEADING,
			"## Needs validation",
		);
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("")).toBe("");
		expect(split.rest).toContain(RETRY.fact);
	});

	test("a heading quoted inside a fence outside any section does not start one", () => {
		const text = [
			"**Verdict:** BLOCK",
			"",
			"### Findings",
			"",
			"```markdown",
			NEEDS_VALIDATION_HEADING,
			"```",
			"",
			"1. **[High] `src/a.ts:4` — a real defect**",
			"",
			`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
			"",
		].join("\n");
		const split = splitNeedsValidation(text);
		expect(split.sections.join("")).toBe("");
		expect(split.rest).toContain("[High] `src/a.ts:4`");
		expect(split.rest).toContain(NEEDS_VALIDATION_HEADING);
	});

	test("a code block in the section hands the rest of the review to the blocker check", () => {
		const check = [
			`   **Owner check:** ${RETRY.check}:`,
			"   ```sh",
			"   # read the replica count",
			"   kubectl get deploy retry -o jsonpath='{.spec.replicas}'",
			"   ```",
		].join("\n");
		const section = needsValidation(RETRY).replace(
			`   **Owner check:** ${RETRY.check}.`,
			check,
		);
		const split = splitNeedsValidation(
			review({ section, afterSection: LATER_FINDING }),
		);
		expect(split.sections.join("\n")).not.toContain("# read the replica count");
		expect(split.rest).toContain("# read the replica count");
		expect(split.rest).toContain("[Medium] `src/a.ts:8`");
	});

	test("a marker line inside a code block in the section is read as review text", () => {
		const section = [
			needsValidation(RETRY),
			"   ```text",
			"   <!-- not the marker -->",
			"   ```",
		].join("\n");
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("\n")).not.toContain("<!-- not the marker -->");
		expect(split.rest).toContain("<!-- not the marker -->");
	});

	test("a tilde code block in the section hands its heading-looking line to the blocker check", () => {
		const section = [
			needsValidation(RETRY),
			"   ~~~sh",
			"   # a shell comment",
			"   ~~~",
		].join("\n");
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("\n")).not.toContain("# a shell comment");
		expect(split.rest).toContain("# a shell comment");
	});

	test("a fence left open keeps the rest of the review outside the section", () => {
		const text = [
			"**Verdict:** PASS",
			"",
			NEEDS_VALIDATION_HEADING,
			"",
			entry(1, RETRY),
			"   ```sh",
			"   kubectl get deploy retry",
			"",
			"### Findings",
			"",
			"1. **[High] `src/a.ts:4` — a real defect**",
			"",
			`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
			"",
		].join("\n");
		const split = splitNeedsValidation(text);
		expect(split.rest).toContain("```sh");
		expect(split.rest).toContain("### Findings");
		expect(split.rest).toContain("[High] `src/a.ts:4`");
		expect(split.sections.join("\n")).not.toContain("[High] `src/a.ts:4`");
	});

	test("a backtick fence is not closed by a tilde fence", () => {
		const text = [
			"**Verdict:** PASS",
			"",
			NEEDS_VALIDATION_HEADING,
			"",
			entry(1, RETRY),
			"```sh",
			"~~~",
			"",
			"### Findings",
			"1. **[High] `src/a.ts:4` — a real defect**",
			"",
		].join("\n");
		const split = splitNeedsValidation(text);
		expect(split.rest).toContain("[High] `src/a.ts:4`");
	});

	const MISPLACED: Array<[string, string]> = [
		["a bullet", "- [High] src/retry.ts retries without a limit"],
		["a plain paragraph", "[Medium] src/retry.ts retries without a limit"],
		["a quoted line", "> [High] src/retry.ts retries without a limit"],
		["an indented line", "    [bug] src/retry.ts retries without a limit"],
		[
			"a bold numbered entry",
			"2. **[High] `src/retry.ts` — retries without a limit**",
		],
		["a lowercase label", "- [high] src/retry.ts retries without a limit"],
		["a finding tag", "- [approach] src/retry.ts should bound the loop"],
		["a Low label", "[Low] src/retry.ts retries without a limit"],
	];
	for (const [name, line] of MISPLACED) {
		test(`${name} that starts with a label is a finding and stays outside the section`, () => {
			const section = [
				needsValidation(RETRY),
				"",
				line,
				"  and its detail",
			].join("\n");
			const split = splitNeedsValidation(review({ section }));
			expect(split.rest).toContain(line);
			expect(split.rest).toContain("and its detail");
			expect(split.sections.join("\n")).not.toContain(
				"retries without a limit",
			);
			expect(split.sections.join("\n")).toContain(RETRY.fact);
		});
	}

	test("a labelled line directly after an item is still a finding", () => {
		const section = [
			needsValidation(RETRY),
			"- [High] src/retry.ts retries without a limit",
		].join("\n");
		const split = splitNeedsValidation(review({ section }));
		expect(split.rest).toContain(
			"- [High] src/retry.ts retries without a limit",
		);
		expect(split.sections.join("\n")).toContain(RETRY.check);
	});

	test("a severity label in the middle of a line is a finding and stays outside the section", () => {
		const prose: Entry = {
			...RETRY,
			fact: "how many replicas run. If two replicas run, this is a [High] risk",
		};
		const split = splitNeedsValidation(
			review({ section: needsValidation(prose) }),
		);
		expect(split.sections.join("\n")).not.toContain("this is a [High] risk");
		expect(split.rest).toContain("this is a [High] risk");
	});

	test("a labelled line inside an indented fenced block in the section is still a finding", () => {
		const section = [
			needsValidation(RETRY),
			"   ```text",
			"   [High] this is only quoted output",
			"   ```",
		].join("\n");
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("\n")).not.toContain(
			"[High] this is only quoted output",
		);
		expect(split.rest).toContain("[High] this is only quoted output");
	});

	test("a fence opened at column 0 inside the section hands the rest of the review to the blocker check", () => {
		const section = [
			needsValidation(RETRY),
			"```text",
			"plain output",
			"```",
			"",
			"### Findings",
			"",
			"1. **[High] `src/a.ts:4` — a real defect**",
		].join("\n");
		const split = splitNeedsValidation(review({ section }));
		expect(split.sections.join("\n")).not.toContain("plain output");
		expect(split.rest).toContain("### Findings");
		expect(split.rest).toContain("[High] `src/a.ts:4`");
	});

	test("a labelled fence opener leaves the next item readable and reports a problem", () => {
		const section = [
			"1. **`src/a.ts` — first item**",
			"   **Missing fact:** how many replicas run.",
			"   **Owner check:** read the count:",
			"   ```sh [Low]",
			"   kubectl get deploy a",
			"   ```",
			"",
			"2. **`src/b.ts` — second item**",
			"   **Missing fact:** whether the queue is bounded.",
			"   **Owner check:** read the queue config.",
		].join("\n");
		const parsed = parseNeedsValidationItems(
			review({ section: `${NEEDS_VALIDATION_HEADING}\n\n${section}` }),
		);
		expect(parsed.problems.length).toBeGreaterThan(0);
	});

	test.each([
		["a low severity label", "[Low]"],
		["a nit tag", "[nit]"],
		["a bug tag", "[bug]"],
	])(
		"an item whose head carries %s is a problem, not a silent drop",
		(_name, label) => {
			const section = [
				`1. **\`src/retry.ts\` — ${label} retries are unbounded**`,
				"   **Missing fact:** how many replicas run.",
				"   **Owner check:** read the replica count.",
			].join("\n");
			const parsed = parseNeedsValidationItems(
				review({ section: `${NEEDS_VALIDATION_HEADING}\n\n${section}` }),
			);
			expect(
				parsed.problems.some((problem) =>
					/severity label or finding tag/.test(problem),
				),
			).toBe(true);
		},
	);

	test("a labelled fence opener is a finding, even when its info string carries the label", () => {
		const section = [
			needsValidation(RETRY),
			"   ~~~ [High] `src/a.ts:4` — a real defect",
			"   ~~~",
		].join("\n");
		const split = splitNeedsValidation(review({ section }));
		expect(split.rest).toContain("[High] `src/a.ts:4`");
	});
});

describe("parseNeedsValidationItems", () => {
	test("a complete item parses with its path, title, missing fact and owner check", () => {
		const { items, problems } = parseNeedsValidationItems(
			review({ section: needsValidation(RETRY) }),
		);
		expect(problems).toEqual([]);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ path: RETRY.path, title: RETRY.title });
		expect(items[0]?.missingFact).toContain(RETRY.fact);
		expect(items[0]?.ownerCheck).toContain(RETRY.check);
		expect(items[0]?.id).toBe(idOf(RETRY));
	});

	test("a review with no section has no items and no problems", () => {
		expect(parseNeedsValidationItems(review())).toEqual({
			items: [],
			problems: [],
		});
	});

	test("two entries in one section are two items", () => {
		const { items, problems } = parseNeedsValidationItems(
			review({ section: needsValidation(RETRY, QUEUE) }),
		);
		expect(problems).toEqual([]);
		expect(items.map((item) => item.path)).toEqual([RETRY.path, QUEUE.path]);
	});

	test("two entries for one risk are one item", () => {
		const reworded: Entry = { ...RETRY, title: "retries never stop" };
		const { items, problems } = parseNeedsValidationItems(
			review({ section: needsValidation(RETRY, reworded) }),
		);
		expect(problems).toEqual([]);
		expect(items).toHaveLength(1);
		expect(items[0]?.title).toBe(RETRY.title);
	});

	test("lines that continue the missing fact or the owner check belong to the item", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			"   **Missing fact:** how many replicas of the service",
			"   run in production.",
			"   **Owner check:** read the replica count",
			"   in the deploy dashboard.",
		].join("\n");
		const { items, problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toEqual([]);
		expect(items).toHaveLength(1);
		expect(items[0]?.missingFact).toContain("run in production");
		expect(items[0]?.ownerCheck).toContain("in the deploy dashboard");
		expect(items[0]?.id).toBe(idOf(RETRY));
	});

	test("an owner check written as a fenced snippet is a problem", () => {
		const check = [
			`   **Owner check:** ${RETRY.check}:`,
			"   ```sh",
			"   # read the replica count",
			"   ```",
		].join("\n");
		const section = needsValidation(RETRY).replace(
			`   **Owner check:** ${RETRY.check}.`,
			check,
		);
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems.some((problem) => /code block/.test(problem))).toBe(true);
	});

	test("a heading quoted in a fence outside the section yields no item", () => {
		const text = review({
			findings: ["```markdown", needsValidation(RETRY), "```"].join("\n"),
		});
		expect(parseNeedsValidationItems(text)).toEqual({
			items: [],
			problems: [],
		});
	});

	test("an item with no missing fact is a problem that names its title and what is missing", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			`   **Owner check:** ${RETRY.check}.`,
		].join("\n");
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(RETRY.title);
		expect(problems[0]).toMatch(/missing fact/i);
	});

	test("an item with an empty missing fact is a problem", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			"   **Missing fact:**",
			`   **Owner check:** ${RETRY.check}.`,
		].join("\n");
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(RETRY.title);
		expect(problems[0]).toMatch(/missing fact/i);
	});

	test("an item with no owner check is a problem that names its title and what is missing", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			`   **Missing fact:** ${RETRY.fact}.`,
		].join("\n");
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(RETRY.title);
		expect(problems[0]).toMatch(/owner check/i);
	});

	test("an item with an empty owner check is a problem", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			`   **Missing fact:** ${RETRY.fact}.`,
			"   **Owner check:**   ",
		].join("\n");
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/owner check/i);
	});

	test("a numbered entry with no path is a problem", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			"1. **The retry loop has no upper bound**",
			`   **Missing fact:** ${RETRY.fact}.`,
			`   **Owner check:** ${RETRY.check}.`,
		].join("\n");
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join("\n")).toContain("The retry loop has no upper bound");
	});

	test("a plain sentence before the first item is a problem that quotes its first words", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			"Everything here depends on how the service is deployed.",
			"",
			entry(1, RETRY),
		].join("\n");
		const { items, problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("Everything here depends");
		expect(items).toHaveLength(1);
	});

	test("a plain sentence between two items is a problem that quotes its first words", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			entry(1, RETRY),
			"",
			"Separately, the second item is less certain.",
			"",
			entry(2, QUEUE),
		].join("\n");
		const { problems } = parseNeedsValidationItems(review({ section }));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("Separately, the second item");
	});

	test("an unclosed fence in the section is a problem", () => {
		const text = [
			"**Verdict:** PASS",
			"",
			NEEDS_VALIDATION_HEADING,
			"",
			entry(1, RETRY),
			"   ```sh",
			"   kubectl get deploy retry",
			"",
			"### Findings",
			"",
			"1. **[High] `src/a.ts:4` — a real defect**",
			"",
		].join("\n");
		expect(parseNeedsValidationItems(text).problems.length).toBeGreaterThan(0);
	});

	test("the problems are plain sentences without internal field names", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			`   **Missing fact:** ${RETRY.fact}.`,
		].join("\n");
		for (const problem of parseNeedsValidationItems(review({ section }))
			.problems) {
			expect(problem).not.toMatch(/ownerCheck|missingFact|undefined|\[object/);
			expect(problem).not.toMatch(/[—–]/);
		}
	});
});

describe("the needs-validation section is read strictly", () => {
	test.each([
		["## Needs validation"],
		["### Needs validation:"],
		["### Needs validation (2)"],
	])(
		"a heading written as %s is not the section, so its items are unread problems",
		(heading) => {
			const section = needsValidation(RETRY).replace(
				NEEDS_VALIDATION_HEADING,
				heading,
			);
			const { items, problems } = parseNeedsValidationItems(
				review({ section }),
			);
			expect(items).toEqual([]);
			expect(problems.length).toBeGreaterThan(0);
		},
	);

	test("a sub-heading inside the section ends it, so the item after it is an unread problem", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			entry(1, RETRY),
			"",
			"#### Deployment",
			"",
			entry(2, QUEUE),
		].join("\n");
		const { items, problems } = parseNeedsValidationItems(review({ section }));
		expect(items.map((item) => item.path)).toEqual([RETRY.path]);
		expect(problems.length).toBeGreaterThan(0);
	});

	test("an HTML comment inside the section ends it, so the item after it is an unread problem", () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			entry(1, RETRY),
			"",
			"<!-- reviewer note -->",
			"",
			entry(2, QUEUE),
		].join("\n");
		const { items, problems } = parseNeedsValidationItems(review({ section }));
		expect(items.map((item) => item.path)).toEqual([RETRY.path]);
		expect(problems.length).toBeGreaterThan(0);
	});

	test("a code block that is never closed before the section hides it and is a problem", () => {
		const text = review({
			findings: "```sh\nkubectl get deploy",
			section: needsValidation(RETRY),
		});
		const { items, problems } = parseNeedsValidationItems(text);
		expect(items).toEqual([]);
		expect(problems.join("\n")).toMatch(/never closed/);
	});

	test("a complete item under earlier findings without closed in its title is a problem, not an unread item", () => {
		const earlier = [
			`1. **\`${RETRY.path}\` — the retry loop is unbounded**`,
			`   **Missing fact:** ${RETRY.fact}`,
			`   **Owner check:** ${RETRY.check}`,
		].join("\n");
		const text = review({ earlier, section: needsValidation(QUEUE) });
		expect(parseNeedsValidationItems(text).problems.length).toBeGreaterThan(0);
	});

	test("an owner-check line under a closed entry is a problem, not a fact", () => {
		const earlier = [
			`1. **\`${RETRY.path}\` — closed: the retry loop is gone**`,
			`   **Missing fact:** ${RETRY.fact}`,
			`   **Owner check:** ${RETRY.check}`,
		].join("\n");
		const text = review({ earlier, section: needsValidation(QUEUE) });
		expect(parseNeedsValidationItems(text).problems.length).toBeGreaterThan(0);
		const { closed, problems } = parseClosedNeedsValidation(text);
		expect(closed[0]?.id).toBe(idOf(RETRY));
		expect(closed[0]?.missingFact).toBe(RETRY.fact);
		expect(problems.join("\n")).toMatch(/owner-check line in a closed entry/);
	});

	test("a closed entry after an ordinary earlier finding with a closed code block still reads", () => {
		const ordinary = [
			`1. **\`${RETRY.path}\` — the retry loop is unbounded**`,
			"   ```sh",
			"   kubectl get deploy",
			"   ```",
		].join("\n");
		const text = review({
			earlier: `${ordinary}\n${closedEntry(2, QUEUE, "the queue is bounded")}`,
		});
		expect(parseClosedNeedsValidation(text).closed).toHaveLength(1);
		expect(parseClosedNeedsValidation(text).problems).toEqual([]);
		expect(parseNeedsValidationItems(text).problems).toEqual([]);
	});

	test("an ordinary earlier finding with a closed code block is not a problem", () => {
		const earlier = [
			`1. **\`${RETRY.path}\` — the retry loop is unbounded**`,
			"   ```sh",
			"   kubectl get deploy",
			"   ```",
		].join("\n");
		const text = review({ earlier, section: needsValidation(QUEUE) });
		expect(parseClosedNeedsValidation(text).problems).toEqual([]);
		expect(parseNeedsValidationItems(text).problems).toEqual([]);
	});
});

describe("needsValidationId", () => {
	function sha(path: string, fact: string): string {
		return `NV-${createHash("sha256").update(`${path}\n${fact}`).digest("hex").slice(0, 8)}`;
	}

	test("is NV- and the first eight hex characters of the hash of the path and the fact", () => {
		expect(needsValidationId(RETRY.path, RETRY.fact)).toBe(
			sha(RETRY.path, RETRY.fact),
		);
		expect(needsValidationId(RETRY.path, RETRY.fact)).toMatch(
			/^NV-[0-9a-f]{8}$/,
		);
	});

	test("normalises the path by trimming it and dropping a leading ./", () => {
		expect(needsValidationId(`  ./${RETRY.path} `, RETRY.fact)).toBe(
			needsValidationId(RETRY.path, RETRY.fact),
		);
	});

	test("normalises the fact by case, spacing and trailing punctuation", () => {
		const expected = needsValidationId(RETRY.path, RETRY.fact);
		const variants = [
			RETRY.fact.toUpperCase(),
			`  ${RETRY.fact}  `,
			RETRY.fact.replace(/ /g, "   "),
			RETRY.fact.replace(/ /g, "\n"),
			`${RETRY.fact}.`,
			`${RETRY.fact};`,
			`${RETRY.fact}:`,
			`${RETRY.fact}.;:`,
		];
		for (const variant of variants) {
			expect([variant, needsValidationId(RETRY.path, variant)]).toEqual([
				variant,
				expected,
			]);
		}
	});

	test("differs when the path or the words of the fact differ", () => {
		const base = needsValidationId(RETRY.path, RETRY.fact);
		expect(needsValidationId("src/Retry.ts", RETRY.fact)).not.toBe(base);
		expect(needsValidationId("src/other.ts", RETRY.fact)).not.toBe(base);
		expect(needsValidationId(RETRY.path, QUEUE.fact)).not.toBe(base);
		expect(
			needsValidationId(RETRY.path, "how many replicas of the worker run"),
		).not.toBe(base);
	});

	test("the same risk keeps its id after a push with a new title and a new position", () => {
		const earlier = itemsOf(review({ section: needsValidation(RETRY) }));
		const later = itemsOf(
			review({
				head: OTHER_HEAD,
				section: needsValidation(QUEUE, {
					...RETRY,
					title: "retries are unbounded when the service scales out",
				}),
			}),
		);
		const sameRisk = later.find((item) => item.path === RETRY.path);
		expect(earlier).toHaveLength(1);
		expect(sameRisk?.id).toBe(earlier[0]?.id);
	});

	test("a fact reworded beyond normalisation is a different item", () => {
		const reworded: Entry = {
			...RETRY,
			fact: "the number of replicas the service runs in production",
		};
		expect(idOf(reworded)).not.toBe(idOf(RETRY));
	});
});

describe("parseClosedNeedsValidation", () => {
	test("a closed entry is read as a closed item with the id of its path and fact", () => {
		const text = review({
			earlier: closedEntry(1, RETRY, "the retry loop is gone"),
		});
		const { closed, problems } = parseClosedNeedsValidation(text);
		expect(problems).toEqual([]);
		expect(closed).toHaveLength(1);
		expect(closed[0]).toMatchObject({ path: RETRY.path });
		expect(closed[0]?.id).toBe(idOf(RETRY));
	});

	test("a closed entry without a missing fact is a problem", () => {
		const text = review({
			earlier: `1. **\`${RETRY.path}\` — closed: the retry loop is gone**`,
		});
		const { closed, problems } = parseClosedNeedsValidation(text);
		expect(closed).toEqual([]);
		expect(problems.length).toBeGreaterThan(0);
		expect(problems.join("\n")).toContain("the retry loop is gone");
	});

	test("an earlier finding that is not a closed needs-validation item is left alone", () => {
		const text = review({
			earlier: "1. **[High] `src/a.ts:42` — regression** — fixed at this head",
		});
		expect(parseClosedNeedsValidation(text)).toEqual({
			closed: [],
			problems: [],
		});
	});

	test("a severity label under a closed fact is a problem, and the id is the id of the fact alone", () => {
		const text = review({
			earlier: [
				`1. **\`${RETRY.path}\` — closed: the retry loop is gone**`,
				"   **Missing fact:** how many replicas run.",
				"   [High] `src/new.ts:4` — new defect",
			].join("\n"),
		});
		const { closed, problems } = parseClosedNeedsValidation(text);
		expect(
			problems.some((problem) => /severity label or finding tag/.test(problem)),
		).toBe(true);
		expect(closed).toHaveLength(1);
		expect(closed[0]?.missingFact).toBe("how many replicas run.");
		expect(closed[0]?.id).toBe(
			needsValidationId(RETRY.path, "how many replicas run."),
		);
	});

	test("a review with no earlier findings has nothing closed", () => {
		expect(parseClosedNeedsValidation(review())).toEqual({
			closed: [],
			problems: [],
		});
	});

	test("reads two closed entries and ignores items listed under the needs-validation heading", () => {
		const text = review({
			earlier: [
				closedEntry(1, RETRY, "the retry loop is gone"),
				closedEntry(2, QUEUE, "the repository now shows the partition count"),
			].join("\n\n"),
			section: needsValidation({
				path: "src/cache.ts",
				title: "the cache has no expiry",
				fact: "how long the downstream cache keeps entries",
				check: "read the cache expiry setting in the platform console",
			}),
		});
		const { closed } = parseClosedNeedsValidation(text);
		expect(closed.map((item) => item.path)).toEqual([RETRY.path, QUEUE.path]);
	});
});

describe("needsValidationAcknowledgements", () => {
	const id = idOf(RETRY);

	test("a well formed line is one acknowledgement with the merge request, id, who and words", () => {
		const words =
			"Checked the replica count with the platform team, it is one.";
		const acknowledgements = needsValidationAcknowledgements(
			ledger([ack(id, { words })]),
		);
		expect(acknowledgements).toHaveLength(1);
		expect(acknowledgements[0]).toMatchObject({
			iid: IID,
			itemId: id,
			acknowledgedBy: "Sam Rivera",
			words,
		});
	});

	test("an acknowledgement applies to its item in a ledger it is in", () => {
		const items = itemsOf(review({ section: needsValidation(RETRY, QUEUE) }));
		const acknowledgements = needsValidationAcknowledgements(ledger([ack(id)]));
		expect(
			openNeedsValidation(IID, items, acknowledgements).map((item) => item.id),
		).toEqual([idOf(QUEUE)]);
	});

	const WRONG_SCOPE: Array<[string, string]> = [
		["another merge request", ack(id, { scope: "!841" })],
		["a head", ack(id, { scope: `!${IID} at ${HEAD}` })],
		["a ticket key", ack(id, { scope: "DS-8" })],
		["a date with no time", ack(id, { time: "2026-11-16" })],
		["a time that is not UTC", ack(id, { time: "2026-11-16T09:30:00+02:00" })],
		[
			"a time that is not a real instant",
			ack(id, { time: "2026-13-45T25:00:00Z" }),
		],
		["a scope with no bang", ack(id, { scope: IID })],
	];
	for (const [name, line] of WRONG_SCOPE) {
		test(`a line scoped to ${name} does not acknowledge an item of merge request ${IID}`, () => {
			const items = itemsOf(review({ section: needsValidation(RETRY) }));
			const acknowledgements = needsValidationAcknowledgements(ledger([line]));
			expect(openNeedsValidation(IID, items, acknowledgements)).toHaveLength(1);
		});
	}

	test("a line for another merge request is not applied to this one", () => {
		const items = itemsOf(review({ section: needsValidation(RETRY) }));
		const acknowledgements = needsValidationAcknowledgements(
			ledger([ack(id, { scope: "!841" })]),
		);
		expect(openNeedsValidation(IID, items, acknowledgements)).toHaveLength(1);
		expect(openNeedsValidation("841", items, acknowledgements)).toHaveLength(0);
	});

	const MALFORMED_ID = [
		"NV-xyz",
		"NV-0a1b2c3",
		"NV-0A1B2C3D",
		"nv-0a1b2c3d",
		"0a1b2c3d",
	];
	for (const bad of MALFORMED_ID) {
		test(`a line with the id ${bad} is ignored`, () => {
			expect(needsValidationAcknowledgements(ledger([ack(bad)]))).toEqual([]);
		});
	}

	test("a line with a blank who or blank words never acknowledges", () => {
		const items = itemsOf(review({ section: needsValidation(RETRY) }));
		for (const line of [
			ack(id, { who: " " }),
			ack(id, { who: "" }),
			ack(id, { words: "" }),
			ack(id, { words: "   " }),
		]) {
			const acknowledgements = needsValidationAcknowledgements(ledger([line]));
			expect([
				line,
				openNeedsValidation(IID, items, acknowledgements).length,
			]).toEqual([line, 1]);
		}
	});

	test("a line that is not an acknowledgement is ignored and does not hide the one that is", () => {
		const acknowledgements = needsValidationAcknowledgements(
			ledger([
				'- 2026-11-16T09:00:00Z run — continuous-delivery: yes — operator — "go ahead"',
				`- 2026-11-16T09:10:00Z !${IID} at ${HEAD} — accepted the risk of ${id} — Sam Rivera — "accepted"`,
				"continuous-delivery: yes",
				ack(id),
			]),
		);
		expect(acknowledgements).toHaveLength(1);
		expect(acknowledgements[0]).toMatchObject({ itemId: id });
	});

	test("continuous delivery and a risk acceptance do not acknowledge an item", () => {
		const items = itemsOf(review({ section: needsValidation(RETRY) }));
		const acknowledgements = needsValidationAcknowledgements(
			ledger([
				'- 2026-11-16T09:00:00Z run — continuous-delivery: yes — operator — "go ahead"',
				`- 2026-11-16T09:10:00Z !${IID} at ${HEAD} — accepted the High finding SEC-1 — Sam Rivera — "accepted"`,
			]),
		);
		expect(acknowledgements).toEqual([]);
		expect(openNeedsValidation(IID, items, acknowledgements)).toHaveLength(1);
	});

	test("an acknowledgement does not depend on a head", () => {
		const earlier = itemsOf(review({ section: needsValidation(RETRY) }));
		const later = itemsOf(
			review({ head: OTHER_HEAD, section: needsValidation(RETRY) }),
		);
		const acknowledgements = needsValidationAcknowledgements(ledger([ack(id)]));
		expect(openNeedsValidation(IID, earlier, acknowledgements)).toEqual([]);
		expect(openNeedsValidation(IID, later, acknowledgements)).toEqual([]);
	});

	test("an acknowledgement for an id that matches no current item is ignored", () => {
		const items = itemsOf(review({ section: needsValidation(RETRY) }));
		const acknowledgements = needsValidationAcknowledgements(
			ledger([ack(idOf(QUEUE))]),
		);
		expect(openNeedsValidation(IID, items, acknowledgements)).toHaveLength(1);
	});

	test("reads a ledger with CRLF line endings", () => {
		const text = ledger([ack(id)]).replace(/\n/g, "\r\n");
		const acknowledgements = needsValidationAcknowledgements(text);
		expect(acknowledgements).toHaveLength(1);
		expect(acknowledgements[0]).toMatchObject({
			itemId: id,
			words: expect.not.stringContaining("\r"),
		});
	});

	test("reads every occurrence of the Approvals heading", () => {
		const other = idOf(QUEUE);
		const text = `${ledger([ack(id)])}\n\n## Approvals\n\n${ack(other)}\n`;
		const ids = needsValidationAcknowledgements(text).map((a) => a.itemId);
		expect(ids).toEqual([id, other]);
	});

	test("reads the Approvals heading without regard to case", () => {
		const text = ledger([ack(id)]).replace("## Approvals", "## APPROVALS");
		expect(needsValidationAcknowledgements(text)).toHaveLength(1);
	});

	test("a line outside the Approvals section is not an acknowledgement", () => {
		const text = ledger([], ack(id));
		expect(needsValidationAcknowledgements(text)).toEqual([]);
		const decision = `# Run\n\n## Decisions\n\n${ack(id)}\n`;
		expect(needsValidationAcknowledgements(decision)).toEqual([]);
	});

	test("an empty ledger holds none", () => {
		expect(needsValidationAcknowledgements("")).toEqual([]);
	});
});

type Run = {
	code: number;
	stdout: string;
	stderr: string;
	output: string;
	json: {
		items: Array<Record<string, unknown>>;
		closed: Array<Record<string, unknown>>;
		open: Array<Record<string, unknown>>;
		problems: string[];
		ledgerRead: boolean;
	};
};

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "needs-validation-"));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function runCheck(options: {
	max: string | null;
	iid?: string;
	head?: string;
	ledger?: string | null;
	previous?: string | null;
	env?: Record<string, string>;
	args?: string[];
}): Promise<Run> {
	let result: Run | undefined;
	await withRoot(async (root) => {
		const paths = {
			max: join(root, "max.md"),
			ledger: join(root, "ledger.md"),
			previous: join(root, "previous.md"),
		};
		if (options.max !== null) await writeFile(paths.max, options.max);
		if (options.ledger) await writeFile(paths.ledger, options.ledger);
		if (options.previous) await writeFile(paths.previous, options.previous);
		const args = options.args ?? [
			options.iid ?? IID,
			options.head ?? HEAD,
			paths.max,
			options.ledger ? paths.ledger : "-",
			options.previous ? paths.previous : "-",
		];
		const env: Record<string, string> = {
			...Object.fromEntries(
				Object.entries(process.env).filter(
					(pair): pair is [string, string] =>
						pair[1] !== undefined && pair[0] !== "DELIVERY_WORKER_JOURNAL",
				),
			),
			...options.env,
		};
		const proc = Bun.spawn(["bun", SCRIPT, ...args], {
			env,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		let json: Run["json"] | undefined;
		try {
			json = JSON.parse(stdout);
		} catch {
			json = undefined;
		}
		result = {
			code,
			stdout,
			stderr,
			output: `${stdout}\n${stderr}`,
			json: json as Run["json"],
		};
	});
	if (!result) throw new Error("the command did not run");
	return result;
}

describe("the needs-validation command", () => {
	const retryId = idOf(RETRY);
	const queueId = idOf(QUEUE);

	test("an invocation constant names the script and its five arguments", () => {
		expect(NEEDS_VALIDATION_CHECK_INVOCATION).toBe(
			"scripts/needs-validation.ts <iid> <head> <max-pass> <ledger> <previous-max-pass>",
		);
	});

	test("a code block that is never closed before the section exits 2 and names it", async () => {
		const run = await runCheck({
			max: review({
				findings: "```sh\nkubectl get deploy",
				section: needsValidation(RETRY),
			}),
			ledger: ledger([]),
		});
		expect(run.code).toBe(2);
		expect(run.json.problems.join("\n")).toMatch(/never closed/);
	});

	test("open items exit 1 and list only the unacknowledged one", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY, QUEUE) }),
			ledger: ledger([ack(retryId)]),
		});
		expect(run.code).toBe(1);
		expect(run.json.ledgerRead).toBe(true);
		expect(run.json.items).toHaveLength(2);
		expect(run.json.open.map((item) => item.id)).toEqual([queueId]);
		expect(run.json.problems).toEqual([]);
	});

	test("every item acknowledged exits 0 with nothing open", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY, QUEUE) }),
			ledger: ledger([ack(retryId), ack(queueId, { who: "Ada Lovelace" })]),
		});
		expect(run.code).toBe(0);
		expect(run.json.open).toEqual([]);
		expect(run.json.items).toHaveLength(2);
		expect(run.json.problems).toEqual([]);
	});

	test("the printed items carry their id, path and title", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY) }),
			ledger: ledger([]),
		});
		expect(run.json.items[0]).toMatchObject({
			id: retryId,
			path: RETRY.path,
			title: RETRY.title,
		});
		expect(Object.keys(run.json).sort()).toEqual([
			"closed",
			"items",
			"ledgerRead",
			"open",
			"problems",
		]);
	});

	test("each printed item says whether it is acknowledged", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY, QUEUE) }),
			ledger: ledger([ack(retryId)]),
		});
		const byId = new Map(run.json.items.map((item) => [item.id, item]));
		expect(byId.get(retryId)).toHaveProperty("acknowledged", true);
		expect(byId.get(queueId)).toHaveProperty("acknowledged", false);
	});

	test("a review with no section exits 0 with no items", async () => {
		const run = await runCheck({ max: review() });
		expect(run.code).toBe(0);
		expect(run.json.items).toEqual([]);
		expect(run.json.open).toEqual([]);
	});

	test("a missing ledger leaves every item open", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY) }),
			ledger: null,
		});
		expect(run.code).toBe(1);
		expect(run.json.open.map((item) => item.id)).toEqual([retryId]);
	});

	test("an acknowledgement on another merge request leaves the item open", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY) }),
			ledger: ledger([ack(retryId, { scope: "!841" })]),
		});
		expect(run.code).toBe(1);
	});

	test("continuous delivery and a risk acceptance leave the item open", async () => {
		const run = await runCheck({
			max: review({ section: needsValidation(RETRY) }),
			ledger: ledger([
				'- 2026-11-16T09:00:00Z run — continuous-delivery: yes — operator — "go ahead"',
				`- 2026-11-16T09:10:00Z !${IID} at ${HEAD} — accepted the High finding SEC-1 — Sam Rivera — "accepted"`,
			]),
		});
		expect(run.code).toBe(1);
		expect(run.json.open).toHaveLength(1);
	});

	test("an acknowledgement still applies at a later head with a reworded title", async () => {
		const acknowledged = ledger([ack(retryId)]);
		const first = await runCheck({
			max: review({ section: needsValidation(RETRY) }),
			ledger: acknowledged,
		});
		const second = await runCheck({
			head: OTHER_HEAD,
			max: review({
				head: OTHER_HEAD,
				section: needsValidation(
					{ ...QUEUE, fact: "how many consumers read the audit topic" },
					{ ...RETRY, title: "retries never stop when the service scales out" },
				),
			}),
			ledger: acknowledged,
			previous: review({ section: needsValidation(RETRY) }),
		});
		expect(first.code).toBe(0);
		expect(second.code).toBe(1);
		expect(second.json.open.map((item) => item.path)).toEqual([QUEUE.path]);
	});

	test("an incomplete item exits 2 and says which part is missing", async () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
			`   **Missing fact:** ${RETRY.fact}.`,
		].join("\n");
		const run = await runCheck({
			max: review({ section }),
			ledger: ledger([]),
		});
		expect(run.code).toBe(2);
		expect(run.output).toMatch(/owner check/i);
		expect(run.output).toContain(RETRY.title);
	});

	test("unreadable text in the section exits 2 and quotes its first words", async () => {
		const section = [
			NEEDS_VALIDATION_HEADING,
			"",
			"Everything here depends on how the service is deployed.",
			"",
			entry(1, RETRY),
		].join("\n");
		const run = await runCheck({
			max: review({ section }),
			ledger: ledger([]),
		});
		expect(run.code).toBe(2);
		expect(run.output).toContain("Everything here depends");
	});

	test("a code review path that does not exist exits 2", async () => {
		const run = await runCheck({ max: null, ledger: ledger([]) });
		expect(run.code).toBe(2);
		expect(run.output.trim().length).toBeGreaterThan(0);
	});

	test("a ledger path that does not exist exits 2", async () => {
		await withRoot(async (root) => {
			const max = join(root, "max.md");
			await writeFile(max, review({ section: needsValidation(RETRY) }));
			const proc = Bun.spawn(
				["bun", SCRIPT, IID, HEAD, max, join(root, "missing-ledger.md"), "-"],
				{ stdout: "pipe", stderr: "pipe" },
			);
			expect(await proc.exited).toBe(2);
		});
	});

	const NOT_THIS_REVIEW: Array<
		[string, Parameters<typeof runCheck>[0], RegExp]
	> = [
		["an empty file", { max: "" }, /empty/i],
		["a blank file", { max: "  \n\n" }, /empty/i],
		[
			"a review with no marker",
			{ max: review({ section: needsValidation(RETRY), marker: null }) },
			/marker/i,
		],
		[
			"a review whose marker is not the last line",
			{
				max: `${review({ section: needsValidation(RETRY) })}\ntrailing text\n`,
			},
			/marker/i,
		],
		[
			"a review for another merge request",
			{ max: review({ iid: "841", section: needsValidation(RETRY) }) },
			/merge request/i,
		],
		[
			"a review at an older head",
			{ max: review({ head: OTHER_HEAD, section: needsValidation(RETRY) }) },
			/commit|head/i,
		],
		[
			"a review with a marker and no verdict",
			{ max: review({ verdict: null, section: needsValidation(RETRY) }) },
			/verdict/i,
		],
	];
	for (const [name, options, message] of NOT_THIS_REVIEW) {
		test(`${name} exits 2 and never 0`, async () => {
			const run = await runCheck({
				...options,
				ledger: ledger([ack(retryId)]),
			});
			expect(run.code).toBe(2);
			expect(run.output).toMatch(message);
		});
	}

	test("a missing argument is a usage error", async () => {
		await withRoot(async (root) => {
			const max = join(root, "max.md");
			await writeFile(max, review());
			const proc = Bun.spawn(["bun", SCRIPT, IID, HEAD, max, "-"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const stderr = await new Response(proc.stderr).text();
			expect(await proc.exited).toBe(2);
			expect(stderr).toMatch(/usage/i);
		});
	});

	test("no arguments is a usage error", async () => {
		const run = await runCheck({ max: null, args: [] });
		expect(run.code).toBe(2);
		expect(run.output).toMatch(/usage/i);
	});

	describe("earlier items", () => {
		const earlier = review({
			head: OTHER_HEAD,
			section: needsValidation(RETRY, QUEUE),
		});

		test("a review that drops an earlier item exits 2 naming its path and title", async () => {
			const run = await runCheck({
				max: review(),
				ledger: ledger([ack(retryId), ack(queueId)]),
				previous: earlier,
			});
			expect(run.code).toBe(2);
			expect(run.output).toContain(RETRY.path);
			expect(run.output).toContain(RETRY.title);
			expect(run.output).toContain(QUEUE.path);
		});

		test("a review that lists one earlier item and omits the other exits 2 naming the one it omitted", async () => {
			const run = await runCheck({
				max: review({ section: needsValidation(RETRY) }),
				ledger: ledger([ack(retryId), ack(queueId)]),
				previous: earlier,
			});
			expect(run.code).toBe(2);
			expect(run.output).toContain(QUEUE.path);
			expect(run.output).toContain(QUEUE.title);
		});

		test("a review that lists an earlier item with a reworded fact fails closed", async () => {
			const reworded: Entry = {
				...RETRY,
				fact: "the number of replicas the service runs in production",
			};
			const run = await runCheck({
				max: review({ section: needsValidation(reworded, QUEUE) }),
				ledger: ledger([ack(retryId), ack(queueId)]),
				previous: earlier,
			});
			expect(run.code).toBe(2);
			expect(run.output).toContain(RETRY.path);
		});

		test("an earlier item that is carried and another that is closed are accepted", async () => {
			const max = review({
				section: needsValidation(RETRY),
				earlier: closedEntry(1, QUEUE, "the consumer is gone"),
			});
			const open = await runCheck({
				max,
				ledger: ledger([]),
				previous: earlier,
			});
			expect(open.code).toBe(1);
			expect(open.json.open.map((item) => item.id)).toEqual([retryId]);
			expect(open.json.closed.map((item) => item.id)).toEqual([queueId]);
			expect(open.json.problems).toEqual([]);

			const acknowledged = await runCheck({
				max,
				ledger: ledger([ack(retryId)]),
				previous: earlier,
			});
			expect(acknowledged.code).toBe(0);
			expect(acknowledged.json.open).toEqual([]);
			expect(acknowledged.json.closed.map((item) => item.id)).toEqual([
				queueId,
			]);
		});

		test("a closed item needs no acknowledgement and is never open", async () => {
			const run = await runCheck({
				max: review({
					earlier: [
						closedEntry(1, RETRY, "the retry loop is gone"),
						closedEntry(
							2,
							QUEUE,
							"the repository now shows the partition count",
						),
					].join("\n\n"),
				}),
				ledger: ledger([]),
				previous: earlier,
			});
			expect(run.code).toBe(0);
			expect(run.json.open).toEqual([]);
			expect(run.json.closed).toHaveLength(2);
		});

		test("a closure that changes the missing fact does not account for the earlier item", async () => {
			const run = await runCheck({
				max: review({
					earlier: closedEntry(
						1,
						{ ...RETRY, fact: "something else entirely" },
						"the retry loop is gone",
					),
					section: needsValidation(QUEUE),
				}),
				ledger: ledger([ack(queueId)]),
				previous: earlier,
			});
			expect(run.code).toBe(2);
			expect(run.output).toContain(RETRY.path);
		});

		test("an earlier review with no items asks for nothing", async () => {
			const run = await runCheck({
				max: review(),
				ledger: ledger([]),
				previous: review({ head: OTHER_HEAD }),
			});
			expect(run.code).toBe(0);
		});

		test("a new item at this head is accepted beside carried ones", async () => {
			const fresh: Entry = {
				path: "src/cache.ts",
				title: "the cache has no expiry",
				fact: "how long the downstream cache keeps entries",
				check: "read the cache expiry setting in the platform console",
			};
			const run = await runCheck({
				max: review({ section: needsValidation(RETRY, QUEUE, fresh) }),
				ledger: ledger([ack(retryId), ack(queueId)]),
				previous: earlier,
			});
			expect(run.code).toBe(1);
			expect(run.json.open.map((item) => item.id)).toEqual([idOf(fresh)]);
		});
	});

	describe("a worker", () => {
		const journal = "/tmp/needs-validation-worker-ds-8.md";

		test("reads no ledger, so every item is open and the ledger it was given cannot clear the gate", async () => {
			const run = await runCheck({
				max: review({ section: needsValidation(RETRY) }),
				ledger: ledger([ack(retryId)]),
				env: { DELIVERY_WORKER_JOURNAL: journal },
			});
			expect(run.code).toBe(1);
			expect(run.json.ledgerRead).toBe(false);
			expect(run.json.open.map((item) => item.id)).toEqual([retryId]);
		});

		test("a worker with no items still exits 0", async () => {
			const run = await runCheck({
				max: review(),
				env: { DELIVERY_WORKER_JOURNAL: journal },
			});
			expect(run.code).toBe(0);
			expect(run.json.ledgerRead).toBe(false);
		});
	});

	test("every printed item is passed through the human text rules and keeps its id", async () => {
		const dashed: Entry = {
			path: "src/retry.ts",
			title: "the retry loop has no upper bound",
			fact: "how many replicas run — one or more — in production",
			check: "read the replica count – shown in the deploy dashboard",
		};
		const run = await runCheck({
			max: review({ section: needsValidation(dashed) }),
			ledger: ledger([]),
		});
		expect(run.code).toBe(1);
		const printed = JSON.stringify(run.json.open[0]);
		expect(printed).toContain(
			"how many replicas run - one or more - in production",
		);
		expect(printed).toContain(
			"read the replica count - shown in the deploy dashboard",
		);
		expect(printed).not.toMatch(/[—–]/);
		expect(run.json.open[0]?.id).toBe(
			needsValidationId(dashed.path, dashed.fact),
		);
	});

	test("the printed problems are passed through the human text rules", async () => {
		const run = await runCheck({
			max: review({
				section: [
					NEEDS_VALIDATION_HEADING,
					"",
					`1. **\`${RETRY.path}\` — ${RETRY.title}**`,
					`   **Missing fact:** ${RETRY.fact}.`,
				].join("\n"),
			}),
			ledger: ledger([]),
		});
		expect(run.code).toBe(2);
		expect(JSON.stringify(run.json?.problems ?? run.stderr)).not.toMatch(
			/[—–]/,
		);
	});
});

describe("the command and the heading", () => {
	test("the heading and the acknowledgement phrase are the ones the format uses", () => {
		expect(NEEDS_VALIDATION_HEADING).toBe("### Needs validation");
		expect(NEEDS_VALIDATION_ACK_PHRASE).toBe("acknowledged needs-validation");
	});
});
