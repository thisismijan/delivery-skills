import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectScenarios,
	generateTasksFile,
	generateTasksMarkdown,
} from "./generate-tasks";
import { isTestsFirst } from "./verify-change";

const spec = `## ADDED Requirements

### Requirement: Task lists are generated from spec scenarios

#### Scenario: Scenarios become tests-first tasks
- **WHEN** the change specs contain two scenarios
- **THEN** tasks.md lists two test tasks

#### Scenario: A spec without scenarios is refused
- **WHEN** the specs directory has no Scenario headings
- **THEN** generate-tasks exits non-zero
`;

test("scenarios become tests-first tasks", () => {
	const scenarios = collectScenarios(spec, "cost-efficient-routing");
	expect(scenarios).toHaveLength(2);
	expect(scenarios[0]?.name).toBe("Scenarios become tests-first tasks");
	const markdown = generateTasksMarkdown(scenarios);
	expect(isTestsFirst(markdown)).toBe(true);
	expect(markdown).toContain("1.1 Prove Scenarios become tests-first tasks.");
	expect(markdown).toContain("1.2 Prove A spec without scenarios is refused.");
	expect(markdown).toContain("2.1 Implement the specified behaviour");
	expect(markdown.indexOf("1. Tests")).toBeLessThan(
		markdown.indexOf("2. Implementation"),
	);
});

test("a spec without scenarios is refused", () => {
	expect(() =>
		generateTasksMarkdown(
			collectScenarios("### Requirement: Empty\n\nNo scenarios.\n", "x"),
		),
	).toThrow("no spec scenarios");
});

test("a scenario without a requirement is refused", () => {
	expect(() => collectScenarios("#### Scenario: Orphan\n", "x")).toThrow(
		"scenario is missing a requirement heading",
	);
});

test("the CLI writes tasks.md from the change specs", async () => {
	const dir = await mkdtemp(join(tmpdir(), "generate-tasks-"));
	try {
		await mkdir(join(dir, "specs", "cost-efficient-routing"), {
			recursive: true,
		});
		await writeFile(
			join(dir, "specs", "cost-efficient-routing", "spec.md"),
			spec,
		);
		const proc = Bun.spawn(
			["bun", join(import.meta.dir, "generate-tasks.ts"), dir],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		const tasks = await Bun.file(join(dir, "tasks.md")).text();
		expect(isTestsFirst(tasks)).toBe(true);
		expect(tasks).toContain("Prove Scenarios become tests-first tasks.");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("missing specs write nothing", async () => {
	const dir = await mkdtemp(join(tmpdir(), "generate-tasks-missing-"));
	try {
		await expect(generateTasksFile(dir)).rejects.toThrow(
			"specs directory is missing",
		);
		expect(await Bun.file(join(dir, "tasks.md")).exists()).toBe(false);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
