import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	TRANSCRIPT_COST_INVOCATION,
	formatSummary,
	packSkillNames,
	readArea,
	runCost,
	shellKind,
	summarize,
	toolEvents,
	transcriptCost,
} from "./transcript-cost";

const SKILLS = ["delivery", "execute"];

function tool(name: string, args: Record<string, unknown>, output: string) {
	return {
		role: "tool",
		tool_name: name,
		tool_args: args,
		tool_result: { resultType: "result", value: { contents: output } },
	};
}

const lines = (count: number) =>
	Array.from({ length: count }, (_, index) => `line ${index}`).join("\n");

const session = {
	messages: [
		{ role: "user", text: "deliver it" },
		tool("read_file", { target_file: "/skills/_factory/RUNTIME.md" }, "notes"),
		tool("read_file", { target_file: "/skills/_factory/RUNTIME.md" }, "notes"),
		tool(
			"read_file",
			{ target_file: "/skills/_factory/scripts/forge-provider.ts" },
			"source",
		),
		tool("read_file", { target_file: "/repo/src/big.ts" }, lines(400)),
		tool("read_file", { target_file: "/repo/src/big.ts", offset: 10 }, "x"),
		tool("run_terminal_cmd", { command: "bun run test" }, "1 pass"),
		tool("run_terminal_cmd", { command: "cat src/a.ts" }, "abc"),
		tool("get_mcp_tools", {}, "tools"),
		{ role: "tool", tool_name: "grep", tool_args: {}, tool_result: null },
	],
};

test("tool messages become events, and a message without a result is skipped", () => {
	const events = toolEvents(session);
	expect(events).toHaveLength(8);
	expect(events[0]).toEqual({
		tool: "read_file",
		args: { target_file: "/skills/_factory/RUNTIME.md" },
		output: "notes",
	});
	expect(() => toolEvents({ entries: [] })).toThrow(/messages array/);
});

test("reads are sorted into pack, run-artifact, and source files", () => {
	expect(readArea("/store/skills/_factory/agents/implementer.md", SKILLS)).toBe(
		"skill or factory",
	);
	expect(readArea("/store/skills/execute/reference/re-entry.md", SKILLS)).toBe(
		"skill or factory",
	);
	expect(
		readArea("/repo/plugins/acme/skills/acceptance-test/run.ts", SKILLS),
	).toBe("source");
	expect(readArea("/repo/.review/mr-1/diff.patch", SKILLS)).toBe(
		"run artifacts",
	);
	expect(packSkillNames()).toContain("delivery");
});

test("shell output is classified by what the command did", () => {
	expect(shellKind("bun run test", 10)).toBe("shell: tests, lint, typecheck");
	expect(shellKind("git diff main...HEAD", 10)).toBe("shell: git diff or show");
	expect(shellKind("git log --oneline", 10)).toBe("shell: other git");
	expect(shellKind("sed -n 1,40p a.ts", 10)).toBe("shell: file reads");
	expect(shellKind("cat a.ts", 30_000)).toBe(
		"shell: file reads (over 20k chars)",
	);
});

test("a session's cost counts re-reads, script-source reads, large whole reads, and tool listings", () => {
	const cost = runCost("one", toolEvents(session), SKILLS);
	expect(cost.steps).toBe(8);
	expect(cost.rereadChars).toBe("notes".length + "x".length);
	expect(cost.runtimeNotesReads).toBe(2);
	expect(cost.scriptSourceReads).toEqual(["forge-provider.ts"]);
	expect(cost.largeWholeReads).toEqual([
		{ path: "/repo/src/big.ts", lines: 400, chars: lines(400).length },
	]);
	expect(cost.toolListings).toBe(1);
	expect(cost.byKind["read: source, ranged"]).toMatchObject({ calls: 1 });
	// The first result is re-sent on each of the seven later steps.
	expect(cost.byKind["read: skill or factory, whole"]?.carried).toBe(
		5 * 7 + 5 * 6 + "source".length * 5,
	);
});

test("the summary gives shares largest first and says it counts characters, not billed tokens", () => {
	const summary = summarize([runCost("one", toolEvents(session), SKILLS)]);
	expect(summary.byKind[0]?.kind).toBe("read: source, whole, over 350 lines");
	expect(
		summary.byKind.reduce((sum, entry) => sum + entry.share, 0),
	).toBeCloseTo(1);
	expect(summary.runsReadingScriptSource).toBe(1);
	const text = formatSummary(summary);
	expect(text).toContain(
		"These are characters of tool output, not billed tokens.",
	);
	expect(text).toContain("Whole-file reads over 350 lines: 1.");
	expect(text).toContain(
		"Sessions that read a factory script's source: 1 of 1.",
	);
});

test("a batch export is read with its session names", async () => {
	const root = await mkdtemp(join(tmpdir(), "transcript-cost-"));
	try {
		await mkdir(join(root, "bc-1"));
		await writeFile(
			join(root, "bc-1", "transcript.json"),
			JSON.stringify(session),
		);
		await writeFile(
			join(root, "index.json"),
			JSON.stringify({ agents: [{ bcId: "bc-1", name: "Stage 3 review !7" }] }),
		);
		const summary = await transcriptCost([
			join(root, "bc-1", "transcript.json"),
		]);
		expect(summary.runs[0]?.name).toBe("Stage 3 review !7 (bc-1)");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the retro's token-cost step runs it on exported transcripts and says what it counts", () => {
	const retro = readFileSync(
		join(
			import.meta.dir,
			"..",
			"..",
			"skills",
			"delivery",
			"workflows",
			"retro.md",
		),
		"utf8",
	);
	const step = retro.slice(
		retro.indexOf("### 11. Review token cost"),
		retro.indexOf("### 12. Present"),
	);
	expect(
		step
			.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
			.replaceAll('.ts"', ".ts"),
	).toContain(TRANSCRIPT_COST_INVOCATION);
	const flat = step.replace(/\s+/g, " ");
	expect(flat).toContain("counts characters of tool output, not billed tokens");
	expect(flat).toContain(
		"When no transcript can be exported, say so and skip it.",
	);
});
