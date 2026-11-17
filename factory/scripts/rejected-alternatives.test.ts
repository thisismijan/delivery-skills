import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const read = (path: string) =>
	readFileSync(join(root, path), "utf8").replace(/\s+/g, " ");

test("draft records rejected alternatives for every change above low complexity", () => {
	const draft = read("skills/draft/SKILL.md");
	expect(draft).toContain(
		"When `complexitySignal` is `medium` or `high`, `design.md` has a `## Rejected alternatives` section.",
	);
	expect(draft).toContain(
		"List each material option not taken, with the one-line reason it loses",
	);
	expect(draft).toContain(
		"any alternative the approach challenger named, and any option the grooming decisions log rejected for this ticket",
	);
	expect(draft).toContain("A low-complexity change may leave the section out.");
});

test("the holdout reviewer fails a diff that implements a rejected alternative", () => {
	const holdout = read("factory/agents/holdout-reviewer.md");
	expect(holdout).toContain(
		"When `design.md` has a `## Rejected alternatives` section, a diff that implements one of those options fails this check unless the spec itself was changed to adopt it",
	);
});
