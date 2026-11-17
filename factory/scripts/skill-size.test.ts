import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	SKILL_SIZE_RAISE_INVOCATION,
	currentSizes,
	readCeilings,
	skillSizeIssues,
} from "./skill-size";

test("every SKILL.md in the pack is within its recorded ceiling", () => {
	expect(skillSizeIssues(readCeilings(), currentSizes())).toEqual([]);
});

test("a SKILL.md larger than its ceiling fails and is named", () => {
	expect(
		skillSizeIssues(
			{ "skills/execute/SKILL.md": 100 },
			{ "skills/execute/SKILL.md": 101 },
		),
	).toEqual([
		`skills/execute/SKILL.md is 101 bytes, over its ceiling of 100. Slim it, or raise the ceiling deliberately with ${SKILL_SIZE_RAISE_INVOCATION}.`,
	]);
});

test("a new skill without a ceiling, or a ceiling for a removed skill, is reported", () => {
	expect(
		skillSizeIssues(
			{ "skills/old/SKILL.md": 10 },
			{ "skills/new/SKILL.md": 5 },
		),
	).toEqual([
		`skills/new/SKILL.md has no recorded size ceiling. Record one with ${SKILL_SIZE_RAISE_INVOCATION}.`,
		"skills/old/SKILL.md has a ceiling but no such skill exists.",
	]);
});

test("the conventions say how a ceiling is raised", () => {
	const conventions = readFileSync(
		join(import.meta.dir, "..", "CONVENTIONS.md"),
		"utf8",
	).replace(/\s+/g, " ");
	expect(conventions).toContain("`factory/skill-size-ceilings.json`");
	expect(conventions).toContain(
		SKILL_SIZE_RAISE_INVOCATION.replace("scripts/", ""),
	);
});
