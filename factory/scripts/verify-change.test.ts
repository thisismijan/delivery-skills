import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isTestsFirst, verifyChangeArtifacts } from "./verify-change";

const created: string[] = [];

afterEach(async () => {
	for (const dir of created.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

type Part = "proposal" | "specs" | "design" | "tasks";

interface Layout {
	skip?: Part[];
	tasks?: string;
}

async function changeDir(layout: Layout = {}): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "verify-change-"));
	created.push(dir);
	const contents: Record<Part, [string, string]> = {
		proposal: ["proposal.md", "# Proposal\nwhy"],
		specs: ["specs/spec.md", "# Spec\nscenario"],
		design: ["design.md", "# Design"],
		tasks: ["tasks.md", layout.tasks ?? "1. Write test\n2. Implement feature"],
	};
	for (const [part, [path, text]] of Object.entries(contents)) {
		if (layout.skip?.includes(part as Part)) continue;
		await mkdir(dirname(join(dir, path)), { recursive: true });
		await writeFile(join(dir, path), text);
	}
	return dir;
}

describe("verifyChangeArtifacts", () => {
	test("a complete tests-first change is ok", async () => {
		const report = await verifyChangeArtifacts(await changeDir());
		expect(report.ok).toBe(true);
		expect(report.missing).toEqual([]);
	});

	test("an absent design.md is listed as missing", async () => {
		const dir = await changeDir({ skip: ["design"] });
		const report = await verifyChangeArtifacts(dir);
		expect(report.ok).toBe(false);
		expect(report.missing).toContain("design.md");
	});

	test("tasks that start with implementation produce a warning and fail", async () => {
		const dir = await changeDir({
			tasks: "1. Implement feature\n2. Write test",
		});
		const report = await verifyChangeArtifacts(dir);
		expect(report.ok).toBe(false);
		expect(report.warnings.some((line) => line.includes("tests-first"))).toBe(
			true,
		);
	});
});

describe("isTestsFirst", () => {
	test.each([
		"- write test\n- implement",
		"## Tests\n- add failing tests\n## Implementation",
		"## Specs\n## Implementation",
	])("accepts %p", (tasks) => {
		expect(isTestsFirst(tasks)).toBe(true);
	});

	test.each(["- implement\n- write test", "- ship it"])(
		"rejects %p",
		(tasks) => {
			expect(isTestsFirst(tasks)).toBe(false);
		},
	);
});
