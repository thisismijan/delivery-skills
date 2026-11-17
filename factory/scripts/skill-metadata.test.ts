import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	HOST_FRONTMATTER_KEYS,
	NOT_FOR_STAGE_SKILLS,
	PORTABLE_FRONTMATTER_KEYS,
	coveredSkillIssues,
	hasNotForClause,
	parseSkillDescription,
	parseSkillName,
	skillMetadataIssues,
} from "./skill-metadata";

const PACK_ROOT = join(import.meta.dir, "..", "..");
const SKILLS_ROOT = join(PACK_ROOT, "skills");

function listSkillFiles(dir = SKILLS_ROOT): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			files.push(...listSkillFiles(full));
			continue;
		}
		if (entry === "SKILL.md") files.push(full);
	}
	return files.sort();
}

describe("portable skill metadata", () => {
	test("the portable key list is name, description, and optional license, compatibility, and metadata", () => {
		expect([...PORTABLE_FRONTMATTER_KEYS].sort()).toEqual([
			"compatibility",
			"description",
			"license",
			"metadata",
			"name",
		]);
	});

	test("host argument placeholders, tool allowlists, effort, and model hints are not portable", () => {
		expect([...HOST_FRONTMATTER_KEYS].sort()).toEqual([
			"allowed-tools",
			"argument-hint",
			"disable-model-invocation",
			"effort",
			"model",
			"tools",
		]);
	});

	test("every generic skill uses portable frontmatter and host-neutral skill arguments", () => {
		const files = listSkillFiles();
		expect(files.length).toBeGreaterThan(0);
		const issues: string[] = [];
		for (const file of files) {
			const relative = file.slice(PACK_ROOT.length + 1);
			issues.push(...skillMetadataIssues(readFileSync(file, "utf8"), relative));
		}
		expect(issues).toEqual([]);
	});
});

const CLAUSE = "Not for a question about what a ticket means.";

function skillText(frontmatter: string[], body = "Body.\n"): string {
	return `---\n${frontmatter.join("\n")}\n---\n${body}`;
}

function notForIssues(text: string, path = "skills/x/SKILL.md"): string[] {
	return skillMetadataIssues(text, path).filter((issue) =>
		issue.includes("not-for clause"),
	);
}

function realSkill(name: string): string {
	const file = listSkillFiles().find(
		(path) => parseSkillName(readFileSync(path, "utf8")) === name,
	);
	if (!file) throw new Error(`no real skill named ${name}`);
	return readFileSync(file, "utf8");
}

describe("frontmatter value readers", () => {
	test("a plain name and description are read from their lines", () => {
		const text = skillText(["name: groom", "description: Does a thing."]);
		expect(parseSkillName(text)).toBe("groom");
		expect(parseSkillDescription(text)).toBe("Does a thing.");
	});

	test("one pair of matching quotes is removed from a value, in both readers", () => {
		const text = skillText([
			'name: "groom"',
			"description: 'Does a thing. Not for a question.'",
		]);
		expect(parseSkillName(text)).toBe("groom");
		expect(parseSkillDescription(text)).toBe(
			"Does a thing. Not for a question.",
		);
	});

	test("mismatched quotes are left on the value", () => {
		expect(parseSkillName(skillText(["name: \"groom'"]))).toBe("\"groom'");
	});

	test("only one pair of quotes is removed", () => {
		expect(parseSkillName(skillText(["name: \"'groom'\""]))).toBe("'groom'");
	});

	test("surrounding whitespace is removed from a value", () => {
		expect(parseSkillName(skillText(["name:    groom   "]))).toBe("groom");
	});

	test("indented continuation lines are joined with single spaces", () => {
		const text = skillText([
			"name: groom",
			"description: First part.",
			"  Second part.",
			"\tThird part.",
		]);
		expect(parseSkillDescription(text)).toBe(
			"First part. Second part. Third part.",
		);
	});

	test.each([">", ">-", "|", "|-"])(
		"a block scalar marker %s takes its text from the indented lines under it",
		(marker) => {
			const text = skillText([
				"name: groom",
				`description: ${marker}`,
				"  Does a thing.",
				"  Second line.",
			]);
			expect(parseSkillDescription(text)).toBe("Does a thing. Second line.");
		},
	);

	test("a value stops at the next top-level key", () => {
		const text = skillText([
			"description: >",
			"  Does a thing.",
			"name: groom",
		]);
		expect(parseSkillDescription(text)).toBe("Does a thing.");
		expect(parseSkillName(text)).toBe("groom");
	});

	test("a missing key or missing frontmatter reads as null", () => {
		expect(parseSkillName(skillText(["description: Only this."]))).toBeNull();
		expect(parseSkillDescription(skillText(["name: groom"]))).toBeNull();
		expect(parseSkillName("# No frontmatter\n")).toBeNull();
		expect(parseSkillDescription("# No frontmatter\n")).toBeNull();
	});
});

describe("not-for clause rule", () => {
	test.each([
		["at the start of the description", "Not for a question."],
		["after a full stop", "Does a thing. Not for a question."],
		["after a question mark", "Is it a run? Not for a question."],
		["after an exclamation mark", "Run it! Not for a question."],
		["after several spaces", "Does a thing.   Not for a question."],
	])("a sentence starting Not for counts %s", (_label, description) => {
		expect(hasNotForClause(description)).toBe(true);
	});

	test.each([
		["lower case not for", "Does a thing. not for a question."],
		["Do not use for", "Does a thing. Do not use for a question."],
		["Not for with nothing after it", "Does a thing. Not for"],
		["Not for followed only by a full stop", "Does a thing. Not for."],
		["Not for followed only by spaces", "Does a thing. Not for   "],
		[
			"Not for in the middle of a sentence",
			"Does a thing, Not for a question.",
		],
		["Not for as part of a longer word", "Does a thing. Not forward plans."],
		["an empty description", ""],
	])("%s does not count", (_label, description) => {
		expect(hasNotForClause(description)).toBe(false);
	});
});

describe("not-for rule on covered stage skills", () => {
	test("the covered list is the four stage skills that write or build", () => {
		expect([...NOT_FOR_STAGE_SKILLS].sort()).toEqual([
			"address-comments",
			"draft",
			"execute",
			"groom",
		]);
	});

	test.each(["draft", "groom", "execute", "address-comments"])(
		"a covered skill %s with no not-for clause fails and is named",
		(name) => {
			const text = skillText([
				`name: ${name}`,
				"description: Does a thing and nothing else.",
			]);
			expect(skillMetadataIssues(text, `skills/${name}/SKILL.md`)).toContain(
				`skills/${name}/SKILL.md: stage skill '${name}' description has no not-for clause`,
			);
		},
	);

	test("the not-for issue sits beside existing issues without changing them", () => {
		const text = skillText(
			["name: groom", "description: Does a thing.", "model: opus"],
			"Use $ARGUMENTS here.\n",
		);
		const issues = skillMetadataIssues(text, "skills/groom/SKILL.md");
		expect(issues).toContain(
			"skills/groom/SKILL.md: host field 'model' belongs in an adapter overlay",
		);
		expect(issues).toContain(
			"skills/groom/SKILL.md: replace $ARGUMENTS with host-neutral skill arguments language",
		);
		expect(issues).toContain(
			"skills/groom/SKILL.md: stage skill 'groom' description has no not-for clause",
		);
		expect(issues).toHaveLength(3);
	});

	test.each([
		[
			"a plain name with a one line description",
			["name: groom", `description: Does a thing. ${CLAUSE}`],
		],
		[
			"a quoted name with a one line description",
			['name: "groom"', `description: Does a thing. ${CLAUSE}`],
		],
		[
			"a single quoted name",
			["name: 'groom'", `description: Does a thing. ${CLAUSE}`],
		],
		[
			"a block scalar description",
			["name: groom", "description: >-", "  Does a thing.", `  ${CLAUSE}`],
		],
		[
			"a literal block scalar description",
			["name: groom", "description: |", "  Does a thing.", `  ${CLAUSE}`],
		],
		[
			"a continuation line description",
			["name: groom", "description: Does a thing.", `  ${CLAUSE}`],
		],
	])("a covered skill with a not-for clause passes: %s", (_label, lines) => {
		expect(notForIssues(skillText(lines))).toEqual([]);
	});

	test("a quoted covered name is still recognised as covered", () => {
		const text = skillText(['name: "groom"', "description: Does a thing."]);
		expect(notForIssues(text, "skills/groom/SKILL.md")).toEqual([
			"skills/groom/SKILL.md: stage skill 'groom' description has no not-for clause",
		]);
	});

	test.each([
		["lower case not for", "description: Does a thing. not for a question."],
		[
			"Do not use for in place of the clause",
			"description: Does a thing. Do not use for a question.",
		],
		["Not for with nothing after it", "description: Does a thing. Not for"],
		[
			"Not for only in the middle of a sentence",
			"description: Does a thing, Not for a question.",
		],
		["an empty description", "description:"],
		["a quoted empty description", 'description: ""'],
	])("a malformed or empty clause fails closed: %s", (_label, line) => {
		const issues = notForIssues(
			skillText(["name: draft", line]),
			"skills/draft/SKILL.md",
		);
		expect(issues).toEqual([
			"skills/draft/SKILL.md: stage skill 'draft' description has no not-for clause",
		]);
	});

	test("a covered skill with no description key fails closed", () => {
		expect(
			notForIssues(skillText(["name: draft"]), "skills/draft/SKILL.md"),
		).toEqual([
			"skills/draft/SKILL.md: stage skill 'draft' description has no not-for clause",
		]);
	});

	test.each(["delivery", "code-review-max", "mr-review"])(
		"a skill outside the covered list, %s, is not flagged",
		(name) => {
			const text = skillText([`name: ${name}`, "description: Does a thing."]);
			expect(notForIssues(text)).toEqual([]);
			expect(skillMetadataIssues(text, "skills/x/SKILL.md")).toEqual([]);
		},
	);

	test("a skill with no name is not treated as covered", () => {
		expect(notForIssues(skillText(["description: Does a thing."]))).toEqual([]);
	});
});

describe("covered names against the pack", () => {
	const realNames = () =>
		listSkillFiles().map(
			(file) => parseSkillName(readFileSync(file, "utf8")) ?? "",
		);

	test("every covered name matches a real skill in the pack", () => {
		expect(coveredSkillIssues(realNames())).toEqual([]);
	});

	test("a covered name that no skill carries is reported", () => {
		const names = realNames().map((name) =>
			name === "draft" ? "drafting" : name,
		);
		expect(coveredSkillIssues(names)).toEqual([
			"stage skill 'draft' in NOT_FOR_STAGE_SKILLS matches no skill in the pack",
		]);
	});

	test("every covered name that is missing is reported, one issue each", () => {
		expect(coveredSkillIssues([])).toEqual(
			[...NOT_FOR_STAGE_SKILLS].map(
				(name) =>
					`stage skill '${name}' in NOT_FOR_STAGE_SKILLS matches no skill in the pack`,
			),
		);
	});

	test("the real covered skills carry a not-for clause and no metadata issue", () => {
		for (const name of NOT_FOR_STAGE_SKILLS) {
			const text = realSkill(name);
			expect(hasNotForClause(parseSkillDescription(text) ?? "")).toBe(true);
			expect(skillMetadataIssues(text, `skills/${name}/SKILL.md`)).toEqual([]);
		}
	});
});
