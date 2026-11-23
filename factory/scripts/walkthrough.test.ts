import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	MAX_QUESTIONS,
	MAX_TOPICS,
	WalkthroughRecord,
	alternativeTopics,
	criterionTopics,
	diffTopics,
	rankTopics,
	recordPath,
	summarize,
	writeRecord,
} from "./walkthrough";

async function withRepo(fn: (root: string) => Promise<void>) {
	const root = await mkdtemp(join(tmpdir(), "walkthrough-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("acceptance scenarios and rejected alternatives become topics that cite their file", async () => {
	await withRepo(async (root) => {
		const change = join(root, "openspec", "changes", "fees");
		await mkdir(join(change, "specs", "billing"), { recursive: true });
		await writeFile(
			join(change, "specs", "billing", "spec.md"),
			[
				"## ADDED Requirements",
				"### Requirement: Fees round half up",
				"#### Scenario: Exactly half a penny",
				"- **WHEN** a fee is 2.5p",
			].join("\n"),
		);
		await writeFile(
			join(change, "design.md"),
			[
				"## Decision",
				"- Round in the ledger",
				"## Alternatives considered",
				"- Round at display time: totals drift",
				"## Risks",
				"- None",
			].join("\n"),
		);
		expect(criterionTopics(root, change)).toEqual([
			{
				kind: "criterion",
				text: "Fees round half up: Exactly half a penny",
				source: "openspec/changes/fees/specs/billing/spec.md",
			},
		]);
		expect(alternativeTopics(root, change)).toEqual([
			{
				kind: "alternative",
				text: "Round at display time: totals drift",
				source: "openspec/changes/fees/design.md",
			},
		]);
	});
});

const diff = [
	"diff --git a/db/migrations/001_drop.sql b/db/migrations/001_drop.sql",
	"--- a/db/migrations/001_drop.sql",
	"+++ b/db/migrations/001_drop.sql",
	"@@ -0,0 +1 @@",
	"+DROP TABLE fees;",
	"diff --git a/src/fees.ts b/src/fees.ts",
	"--- a/src/fees.ts",
	"+++ b/src/fees.ts",
	"@@ -1,2 +1,3 @@",
	"-export const round = Math.floor;",
	"+export const round = Math.round;",
	"+export const scale = 100;",
	"diff --git a/src/fees.test.ts b/src/fees.test.ts",
	"--- a/src/fees.test.ts",
	"+++ b/src/fees.test.ts",
	"@@ -0,0 +1,9 @@",
	...Array.from({ length: 9 }, (_, index) => `+test line ${index}`),
	"",
].join("\n");

test("the diff gives one-way and surface topics first, then the source files that changed most", () => {
	const topics = rankTopics(diffTopics(diff));
	expect(topics[0]).toMatchObject({
		kind: "one-way",
		source: "db/migrations/001_drop.sql",
	});
	const changed = topics.filter((topic) => topic.kind === "change");
	expect(changed.map((topic) => topic.source)).toEqual([
		"src/fees.ts",
		"db/migrations/001_drop.sql",
	]);
	expect(changed[0]?.text).toBe("3 changed lines");
	expect(topics.some((topic) => topic.source === "src/fees.test.ts")).toBe(
		false,
	);
});

test("topics are ranked by kind, deduplicated, and capped", () => {
	const many = Array.from({ length: 20 }, (_, index) => ({
		kind: "change" as const,
		text: `t${index}`,
		source: `f${index}`,
	}));
	const ranked = rankTopics([
		...many,
		{ kind: "one-way", text: "x", source: "a" },
		{ kind: "one-way", text: "x", source: "a" },
	]);
	expect(ranked).toHaveLength(MAX_TOPICS);
	expect(ranked[0]?.kind).toBe("one-way");
	expect(ranked.filter((topic) => topic.kind === "one-way")).toHaveLength(1);
});

const record = {
	version: 1 as const,
	ref: "42",
	headRevision: "abcdef1234567",
	questions: [
		{
			topic: "Rounding",
			source: "src/fees.ts",
			kind: "predict" as const,
			outcome: "explained" as const,
			hints: 0,
		},
		{
			topic: "Dropped table",
			source: "db/migrations/001_drop.sql",
			kind: "why" as const,
			outcome: "explained-after-hints" as const,
			hints: 2,
		},
		{
			topic: "Display rounding",
			source: "openspec/changes/fees/design.md",
			kind: "flaw" as const,
			outcome: "not-explained" as const,
			hints: 2,
		},
	],
};

test("a record is checked so hints and outcomes agree", () => {
	expect(WalkthroughRecord.parse(record)).toEqual(record);
	const bad = structuredClone(record);
	const first = bad.questions[0];
	if (first) first.hints = 1;
	expect(() => WalkthroughRecord.parse(bad)).toThrow(
		/explained means no hints/,
	);
	expect(() => WalkthroughRecord.parse({ ...record, questions: [] })).toThrow();
	expect(() =>
		WalkthroughRecord.parse({
			...record,
			questions: [{ ...record.questions[0], hints: 3 }],
		}),
	).toThrow();
});

test("a record is saved under the change's head, and the summary reads in plain words", async () => {
	await withRepo(async (root) => {
		const path = await writeRecord(root, record);
		expect(path).toBe(recordPath(root, "42", "abcdef1234567"));
		expect(path).toEndWith(".review/mr-42/abcdef1234567/walkthrough.json");
		expect(
			summarize(WalkthroughRecord.parse(record), "42", record.headRevision),
		).toBe(
			[
				"Walkthrough at abcdef123: you explained 1 of 3 without hints.",
				"- Explained after 2 hints: Dropped table (`db/migrations/001_drop.sql`)",
				"- Worth reading before merging: Display rounding (`openspec/changes/fees/design.md`)",
			].join("\n"),
		);
		expect(summarize(null, "42", record.headRevision)).toBe(
			"No walkthrough at this head. To check your understanding before merging, run `/delivery walkthrough 42`.",
		);
	});
});

test("the walkthrough workflow keeps the questioning rules and is never a gate", async () => {
	const root = join(import.meta.dir, "..", "..", "skills", "delivery");
	const flat = (text: string) => text.replace(/\s+/g, " ");
	const workflow = flat(
		await Bun.file(join(root, "workflows", "walkthrough.md")).text(),
	);
	for (const rule of [
		"Ask one question per message, and end the message with it.",
		"When an answer is wrong, do not give the answer.",
		"After two hints, explain in a few sentences, citing the file, then ask about the same idea once from a different angle.",
		"A vague or partly right answer is not right.",
		"Never credit them with an insight they did not state.",
		"Never ask what those files do not answer.",
		"Never treat the walkthrough as a gate",
		"The record under `.review/` is the only file this writes.",
	]) {
		expect(workflow).toContain(rule);
	}
	expect(workflow).toContain(
		'scripts/walkthrough.ts" topics "<repoRoot>" "<changeDir>" <base> <head>',
	);
	expect(workflow).toContain(
		'scripts/walkthrough.ts" record "<repoRoot>" <record.json>',
	);
	const readiness = flat(
		await Bun.file(join(root, "workflows", "release-readiness.md")).text(),
	);
	expect(readiness).toContain(
		'scripts/walkthrough.ts" summary "<repoRoot>" <ref> <full-head-sha>',
	);
	expect(readiness).toContain("never changes GO or NO-GO");
	const skill = await Bun.file(join(root, "SKILL.md")).text();
	expect(skill).toContain("| `^walkthrough\\s+\\d+$` | Walkthrough |");
	expect(await Bun.file(join(root, "reference", "help.md")).text()).toContain(
		"/delivery walkthrough <iid>",
	);
});

test("the reference guide states the limits the script enforces", async () => {
	const guide = (
		await Bun.file(
			join(import.meta.dir, "..", "..", "docs", "reference.md"),
		).text()
	).replace(/\s+/g, " ");
	expect(guide).toContain(`lists up to ${MAX_TOPICS} grounded topics`);
	expect(guide).toContain(`between 1 and ${MAX_QUESTIONS}`);
});
