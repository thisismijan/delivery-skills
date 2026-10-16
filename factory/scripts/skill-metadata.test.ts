import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	HOST_FRONTMATTER_KEYS,
	PORTABLE_FRONTMATTER_KEYS,
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
			issues.push(
				...skillMetadataIssues(readFileSync(file, "utf8"), relative),
			);
		}
		expect(issues).toEqual([]);
	});
});
