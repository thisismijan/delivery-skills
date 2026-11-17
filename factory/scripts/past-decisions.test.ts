import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FeasibilityVerdict } from "./verdicts";

const read = (path: string) =>
	readFileSync(join(import.meta.dir, "..", "agents", path), "utf8").replace(
		/\s+/g,
		" ",
	);

const verdict = {
	feasible: "yes",
	approachSketch: "Add a check.",
	affectedAreas: ["src/a.ts"],
	contractsTouched: [],
	risks: [],
	complexitySignal: "medium",
};

test("the explorer and the feasibility analyst read specs and archived decisions before code", () => {
	for (const agent of ["groom-explorer.md", "feasibility-analyst.md"]) {
		const prompt = read(agent);
		expect(prompt).toContain("## Read past decisions first");
		expect(prompt).toContain(
			"Before reading code, look for decisions already made about this area",
		);
		expect(prompt).toContain("`openspec/specs/*/spec.md`");
		expect(prompt).toContain("`openspec/changes/archive/`");
	}
	expect(read("groom-explorer.md")).toContain(
		"Cite each spec or archived change you relied on, by path, under **Specs and decisions** in your report.",
	);
	expect(read("groom-explorer.md")).toContain(
		"sections for Specs and decisions, Relevant Modules",
	);
	expect(read("feasibility-analyst.md")).toContain(
		"List each spec or archived change you relied on, by path, in `specsRead`.",
	);
});

test("the feasibility verdict carries the specs it read, and older verdicts still parse", () => {
	expect(
		FeasibilityVerdict.parse({
			...verdict,
			specsRead: ["openspec/specs/x/spec.md"],
		}).specsRead,
	).toEqual(["openspec/specs/x/spec.md"]);
	expect(FeasibilityVerdict.parse(verdict).specsRead).toBeUndefined();
	expect(() =>
		FeasibilityVerdict.parse({ ...verdict, specsRead: [""] }),
	).toThrow();
});
