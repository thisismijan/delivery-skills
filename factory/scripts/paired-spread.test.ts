import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectedOrder } from "./paired-evaluation";
import {
	PAIRED_SPREAD_RECORD_INVOCATION,
	PAIRED_SPREAD_REPORT_INVOCATION,
	type PairedRunRecord,
	readRecords,
	recordFor,
	spreadReport,
} from "./paired-spread";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const hash = (digit: string) => digit.repeat(64);

function evidence(candidate: number[]) {
	const controls = {
		taskFixtureHash: hash("1"),
		model: "model-a",
		environmentHash: hash("2"),
		allowedContextHash: hash("3"),
		toolsHash: hash("4"),
		outputContractHash: hash("5"),
		timeoutMs: 60_000,
	};
	const checks = [{ id: "contract", hidden: false, passed: true }];
	const run = (tree: string, utility: number) => ({
		controls,
		managedTreeHash: hash(tree),
		utility,
		criticalMisses: 0,
		checks,
		metrics: {
			usage: { unit: "tokens" as const, input: 10, output: 5 },
			wallTimeMs: 1,
			repairAttempts: 0,
			deliveredCodeBytes: 1,
		},
	});
	return {
		version: 2 as const,
		candidateId: "improve-1",
		intendedEffect: "behaviour" as const,
		hiddenChecks: { available: false as const, reason: "none" },
		mutation: { required: false as const, reason: "none" },
		pairs: candidate.map((utility, index) => ({
			order: expectedOrder(index),
			baseline: run("a", 1),
			candidate: run("b", utility),
		})),
	};
}

const record = (taskClass: string, candidate: number[]): PairedRunRecord => ({
	version: 1,
	candidateId: "c",
	taskClass,
	baseline: candidate.map(() => 1),
	candidate,
	decision: "pass",
});

test("a repeated evaluation records each run's utilities and its decision", () => {
	expect(recordFor(evidence([0.95, 1, 0.97]), "review")).toEqual({
		version: 1,
		candidateId: "improve-1",
		taskClass: "review",
		baseline: [1, 1, 1],
		candidate: [0.95, 1, 0.97],
		decision: "pass",
	});
	expect(() => recordFor(evidence([1, 1, 1]), "Bad Class")).toThrow();
});

test("the report shows each class's spread, extensions at today's margin, and a suggested margin", () => {
	const [draft, review] = spreadReport([
		record("review", [0.9, 0.98, 1]),
		record("review", [0.93, 0.92, 0.91]),
		record("draft", [1, 1, 1]),
	]);
	expect(draft).toEqual({
		taskClass: "draft",
		evaluations: 1,
		largestDeviation: 0,
		medianDeviation: 0,
		extendedAtCurrentMargin: 0,
		suggestedMargin: 0,
	});
	expect(review).toMatchObject({
		taskClass: "review",
		evaluations: 2,
		extendedAtCurrentMargin: 1,
		suggestedMargin: 0.08,
	});
	expect(review?.largestDeviation).toBeCloseTo(0.08, 9);
	expect(review?.medianDeviation).toBeCloseTo(0.045, 9);
	expect(spreadReport([])).toEqual([]);
});

test("a malformed line names its number, and no file means no evidence", async () => {
	const dir = mkdtempSync(join(tmpdir(), "paired-spread-"));
	roots.push(dir);
	const file = join(dir, "runs.jsonl");
	expect(readRecords(file)).toEqual([]);
	writeFileSync(
		file,
		`${JSON.stringify(record("review", [1, 1, 1]))}\nnot json\n`,
	);
	expect(() => readRecords(file)).toThrow("line 2");
	const evidenceFile = join(dir, "evidence.json");
	writeFileSync(evidenceFile, JSON.stringify(evidence([0.95, 1, 0.97])));
	const out = join(dir, "routing", "paired-runs.jsonl");
	const script = join(import.meta.dir, "paired-spread.ts");
	const recorded = Bun.spawnSync([
		process.execPath,
		script,
		"record",
		evidenceFile,
		"review",
		out,
	]);
	expect(recorded.exitCode).toBe(0);
	const empty = Bun.spawnSync([
		process.execPath,
		script,
		"report",
		join(dir, "absent.jsonl"),
	]);
	expect(JSON.parse(empty.stdout.toString())).toEqual({
		evidence: "none",
		classes: [],
	});
	const report = Bun.spawnSync([process.execPath, script, "report", out]);
	expect(JSON.parse(report.stdout.toString())).toMatchObject({
		evidence: "recorded",
		currentMargin: 0.05,
		classes: [{ taskClass: "review", evaluations: 1 }],
	});
});

test("improve records every repeated evaluation and the reference names both commands", () => {
	const read = (path: string) =>
		readFileSync(join(import.meta.dir, "../..", path), "utf8")
			.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
			.replaceAll('"$FACTORY_ROOT/scripts/', "scripts/")
			.replaceAll('.ts"', ".ts");
	expect(read("skills/delivery/workflows/improve.md")).toContain(
		"scripts/paired-spread.ts record",
	);
	const reference = read("docs/reference.md");
	expect(reference).toContain(PAIRED_SPREAD_RECORD_INVOCATION);
	expect(reference).toContain(PAIRED_SPREAD_REPORT_INVOCATION);
});
