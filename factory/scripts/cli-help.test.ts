import { expect, test } from "bun:test";
import { join } from "node:path";
import { z } from "zod";
import { describeSchema, helpText, isHelpRequest } from "./cli-help";
import { FORGE_OPERATIONS } from "./forge-provider";
import { WORK_ITEM_OPERATIONS } from "./work-item-provider";

test("schemas are described as compact shapes a caller can fill in", () => {
	const schema = z
		.object({
			approved: z.literal(true),
			ref: z.string().trim().min(1),
			count: z.number().int().optional(),
			kind: z.enum(["bug", "story"]).default("story"),
			tags: z.array(z.enum(["a", "b"])).default([]),
			anchors: z.array(z.object({ path: z.string() })),
			settings: z.record(z.string()),
			examined: z.unknown().describe("string[] of paths"),
			either: z.union([z.string(), z.null()]),
		})
		.strict()
		.superRefine(() => {});
	expect(describeSchema(schema)).toBe(
		'{ approved: true, ref: string, count?: number, kind?: "bug" | "story", tags?: ("a" | "b")[], anchors: { path: string }[], settings: { [key: string]: string }, examined: string[] of paths, either: string | null }',
	);
});

test("help lists every operation's input, or narrows to one operation", () => {
	const inputs = {
		read: z.object({ ref: z.string() }),
		list: null,
	};
	const full = helpText({ usage: ["tool <op>", "tool --help"], inputs });
	expect(full).toContain("usage: tool <op>\n       tool --help");
	expect(full).toContain("  read: { ref: string }");
	expect(full).toContain("  list: no input file");
	const one = helpText({ usage: ["tool <op>"], inputs, operation: "read" });
	expect(one).toContain("read: { ref: string }");
	expect(one).not.toContain("list:");
	expect(() =>
		helpText({ usage: ["tool"], inputs, operation: "nope" }),
	).toThrow(/unknown operation 'nope'; operations: read, list/);
	expect(isHelpRequest(["--help"])).toBe(true);
	expect(isHelpRequest(["-h"])).toBe(true);
	expect(isHelpRequest(["read"])).toBe(false);
});

async function help(script: string, ...args: string[]) {
	const child = Bun.spawn(
		["bun", join(import.meta.dir, script), "--help", ...args],
		{ stdout: "pipe", stderr: "pipe", env: { ...process.env } },
	);
	const [stdout, code] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	]);
	return { stdout, code };
}

test("the provider commands print every operation's input with --help and exit zero", async () => {
	const forge = await help("forge-provider.ts");
	expect(forge.code).toBe(0);
	for (const operation of FORGE_OPERATIONS) {
		expect(forge.stdout).toContain(`  ${operation}: {`);
	}
	expect((await help("forge-provider.ts", "note")).stdout).toContain(
		"note: { approved?: true, dryRun?: boolean, ref: string, bodyPath: string",
	);
	const workItems = await help("work-item-provider.ts");
	expect(workItems.code).toBe(0);
	for (const operation of WORK_ITEM_OPERATIONS) {
		expect(workItems.stdout).toContain(`  ${operation}: `);
	}
	expect(workItems.stdout).toContain("auditId: string");
});

test("review fan-out and comment scoping explain their inputs with --help", async () => {
	const fanout = await help("review-fanout.ts");
	expect(fanout.code).toBe(0);
	expect(fanout.stdout).toContain(
		"reports: { lens: string, examined: string[] of repository paths }[]",
	);
	expect(fanout.stdout).toContain(
		'adjudication: { candidates: { severity: "Critical" | "High" | "Medium" | "Low" }[] }',
	);
	const comments = await help("forge-comments.ts");
	expect(comments.code).toBe(0);
	expect(comments.stdout).toContain("DELIVERY_FACTORY_AUTHORS");
	expect(comments.stdout).toContain("Prints { inScope, outdated }");
});
