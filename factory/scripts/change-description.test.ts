import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CHANGE_DESCRIPTION_SECTIONS,
	DECISIONS_SECTION,
	UNPROVEN_SECTION,
	checkDescription,
} from "./change-description";

function description(decisions: string, unproven: string): string {
	return [
		"Closes WORK-1. Adds the spend panel to the account page.",
		"",
		`### ${DECISIONS_SECTION}`,
		decisions,
		"",
		`### ${UNPROVEN_SECTION}`,
		unproven,
		"",
	].join("\n");
}

describe("checkDescription", () => {
	test("accepts both sections with content", () => {
		expect(
			checkDescription(
				description(
					"- Spend rounds to whole pounds, because the spec gave no precision.",
					"- The cost service is faked in every test; no test calls it.",
				),
			),
		).toEqual({ ok: true, problems: [] });
	});

	test("accepts no decisions when the spec made every choice", () => {
		expect(
			checkDescription(
				description("None.", "- No test runs against the live cost service."),
			).ok,
		).toBe(true);
	});

	test("refuses a description without the sections", () => {
		expect(checkDescription("Closes WORK-1. All tests pass.")).toEqual({
			ok: false,
			problems: CHANGE_DESCRIPTION_SECTIONS.map(
				(title) => `The description has no "${title}" section.`,
			),
		});
	});

	test("refuses an empty section", () => {
		const result = checkDescription(description("", "- The service is faked."));
		expect(result.problems).toEqual([
			`The "${DECISIONS_SECTION}" section is empty.`,
		]);
	});

	test("refuses a claim that the checks prove everything", () => {
		for (const none of ["None", "- none.", "Nothing", "n/a"]) {
			const result = checkDescription(description("None.", none));
			expect(result.ok).toBe(false);
			expect(result.problems[0]).toContain(
				"Every check leaves something unproven",
			);
		}
	});

	test("refuses a repeated section", () => {
		const text = `${description("None.", "- Faked service.")}\n### ${UNPROVEN_SECTION}\n- Again.\n`;
		expect(checkDescription(text).problems).toEqual([
			`The description has more than one "${UNPROVEN_SECTION}" section.`,
		]);
	});

	test("the CLI reads the forge create input and exits 1 on a problem", async () => {
		const dir = await mkdtemp(join(tmpdir(), "change-description-"));
		try {
			const good = join(dir, "good.json");
			const bad = join(dir, "bad.json");
			await writeFile(
				good,
				JSON.stringify({
					description: description("None.", "- The service is faked."),
				}),
			);
			await writeFile(bad, JSON.stringify({ description: "All green." }));
			const run = (path: string) =>
				Bun.spawnSync(
					[
						"bun",
						join(import.meta.dir, "change-description.ts"),
						"check",
						path,
					],
					{ env: process.env },
				);
			expect(run(good).exitCode).toBe(0);
			const refused = run(bad);
			expect(refused.exitCode).toBe(1);
			expect(JSON.parse(refused.stdout.toString()).problems).toHaveLength(2);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
