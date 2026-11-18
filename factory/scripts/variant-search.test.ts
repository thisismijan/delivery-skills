import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
	readFileSync(join(import.meta.dir, "..", "..", path), "utf8");

test("a confirmed Medium-or-worse finding is searched for variants and listed once", () => {
	const skill = read("skills/code-review-max/SKILL.md");
	const adjudicate = skill.slice(
		skill.indexOf("## Adjudicate every candidate"),
		skill.indexOf("## Severity"),
	);
	const search = adjudicate.slice(
		adjudicate.indexOf("### Search for variants"),
	);
	expect(search).toContain("reference/variant-search.md");
	const text = read(
		"skills/code-review-max/reference/variant-search.md",
	).replace(/\s+/g, " ");
	expect(text).toContain(
		"For each finding you confirmed at Medium or higher, search for the same root cause elsewhere",
	);
	expect(text).toContain("never beyond the change's affected areas");
	expect(text).toContain(
		"Verify each further instance the way you verified the finding, by steps 1 to 4.",
	);
	expect(text).toContain(
		"List every confirmed instance under that finding as **Also at:**",
	);
	expect(text).toContain("Do not raise an instance as a separate finding");
	expect(text).toContain("Low findings get no variant search.");
	expect(skill).toContain("**Also at:** `path/other.ts:17`");
});

test("address-comments fixes every listed instance in the same round", () => {
	const skill = read("skills/address-comments/SKILL.md").replace(/\s+/g, " ");
	expect(skill).toContain(
		"Read `reference/also-at.md` when an action comment, or the review finding it repeats, lists **Also at:** locations",
	);
	const text = read("skills/address-comments/reference/also-at.md").replace(
		/\s+/g,
		" ",
	);
	expect(text).toContain(
		"lists **Also at:** locations, the fix covers every listed instance in the same commit and round",
	);
	expect(text).toContain("the reply names every location fixed");
});
