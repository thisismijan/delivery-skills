import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTestsFirst, verifyChangeArtifacts } from "./verify-change";

async function makeChange(
	opts: {
		proposal?: boolean;
		specs?: boolean;
		design?: boolean;
		tasks?: string | false;
	} = {},
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ig-spec-"));
	if (opts.proposal !== false)
		await writeFile(join(dir, "proposal.md"), "# Proposal\nwhy");
	if (opts.specs !== false) {
		await mkdir(join(dir, "specs"));
		await writeFile(join(dir, "specs", "spec.md"), "# Spec\nscenario");
	}
	if (opts.design !== false)
		await writeFile(join(dir, "design.md"), "# Design");
	if (opts.tasks !== false)
		await writeFile(
			join(dir, "tasks.md"),
			opts.tasks ?? "1. Write test\n2. Implement feature",
		);
	return dir;
}

test("all artifacts present -> ok", async () => {
	const dir = await makeChange();
	const r = await verifyChangeArtifacts(dir);
	expect(r.ok).toBe(true);
	expect(r.missing).toEqual([]);
	await rm(dir, { recursive: true });
});

test("missing design.md is reported and ok is false", async () => {
	const dir = await makeChange({ design: false });
	const r = await verifyChangeArtifacts(dir);
	expect(r.ok).toBe(false);
	expect(r.missing).toContain("design.md");
	await rm(dir, { recursive: true });
});

test("tasks not tests-first -> warning", async () => {
	const dir = await makeChange({
		tasks: "1. Implement feature\n2. Write test",
	});
	const r = await verifyChangeArtifacts(dir);
	expect(r.warnings.some((w) => w.includes("tests-first"))).toBe(true);
	await rm(dir, { recursive: true });
});

test("isTestsFirst pure logic", () => {
	expect(isTestsFirst("- write test\n- implement")).toBe(true);
	expect(isTestsFirst("- implement\n- write test")).toBe(false);
	expect(isTestsFirst("- ship it")).toBe(false);
});
