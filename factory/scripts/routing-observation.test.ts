import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCorpus } from "./evaluation-corpus";
import {
	evaluateFastDispatch,
	FAST_RELATIVE_UTILITY_THRESHOLD,
	MIN_EVALUATED_FAST_SAMPLES,
} from "./fast-dispatch";
import {
	buildObservation,
	loadObservations,
	persistObservation,
} from "./record-routing";
import { representativeObservations } from "./representative-routing-runs";
import {
	formatRoutingReport,
	summariseObservations,
	tierRelation,
} from "./routing-report";
import type { TaskProfileInput } from "./task-profile";
import { parseTaskProfileInput } from "./task-profile";

const search: TaskProfileInput = {
	version: 1,
	taskId: "search",
	stage: "discover",
	workType: "search",
	reasoningDepth: "low",
	ambiguity: "low",
	blastRadius: "local",
	risk: "reversible",
	novelty: "known-pattern",
	verificationStrength: "strong",
	contextSize: "small",
	domains: ["user-interface"],
	reason: ["inventory existing dashboard modules"],
	promotionTriggers: ["a required source was missed"],
};

test("the controller profile parser accepts TaskProfileInput and rejects extra keys by later routing", () => {
	expect(parseTaskProfileInput(search).taskId).toBe("search");
	expect(() => parseTaskProfileInput({ ...search, selectedTier: "fast" })).toThrow();
});

test("an observation records gates, repairs, escalations, and usage when present", () => {
	const observation = buildObservation({
		runId: "run-1",
		profile: search,
		currentModel: "sonnet",
		source: "representative-run",
		recordedAt: "2026-10-15T10:00:00.000Z",
		outcome: {
			gates: [{ name: "green", passed: true }],
			gatesPassed: true,
			repairs: 0,
			escalations: 0,
			terminal: "approve",
		},
		usage: { source: "tokens", inputTokens: 10, outputTokens: 4 },
	});
	expect(observation.controller.agent).toBe("task-profile-controller");
	expect(observation.shadowTier).toBe("fast");
	expect(observation.currentTier).toBe("standard");
	expect(observation.executed).toBe("current");
	expect(observation.currentOutcome.repairs).toBe(0);
	expect(observation.context.usage.inputTokens).toBe(10);
	expect(observation.context.size).toBe("small");
});

test("observations persist under .delivery/routing and reload", async () => {
	const dir = await mkdtemp(join(tmpdir(), "routing-obs-"));
	try {
		const root = join(dir, ".delivery", "routing");
		const observation = buildObservation({
			runId: "run-1",
			profile: search,
			currentModel: "sonnet",
			source: "live",
			outcome: {
				gates: [],
				gatesPassed: true,
				repairs: 0,
				escalations: 0,
				terminal: "continue",
			},
		});
		const path = await persistObservation(root, observation);
		expect(path).toContain(`${join(".delivery", "routing", "run-1", "search.json")}`);
		const loaded = await loadObservations(root);
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.profile.taskId).toBe("search");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("the comparison report contrasts live tier with shadow recommendations", () => {
	const report = summariseObservations(representativeObservations());
	expect(report.taskCount).toBe(7);
	expect(report.runCount).toBeGreaterThanOrEqual(4);
	expect(report.cheaperShadow).toBeGreaterThan(0);
	expect(report.floorRaised).toBeGreaterThan(0);
	expect(report.escalations).toBe(1);
	expect(report.repairs).toBeGreaterThan(0);
	expect(report.tokenTasks).toBeGreaterThan(0);
	expect(report.characterTasks).toBeGreaterThan(0);
	expect(report.unavailableUsage).toBeGreaterThan(0);
	const text = formatRoutingReport(report);
	expect(text).toContain("Shadow recommendations");
	expect(text).toContain("90 percent");
	expect(text).not.toContain("shadowTier");
	expect(text).not.toContain("—");
});

test("search on sonnet is a cheaper shadow; holdout stays frontier", () => {
	expect(tierRelation("standard", "fast")).toBe("cheaper");
	expect(tierRelation("frontier", "frontier")).toBe("same");
	const runs = representativeObservations();
	const holdout = runs.find((item) => item.profile.taskId === "review");
	expect(holdout?.currentTier).toBe("frontier");
	expect(holdout?.shadowTier).toBe("frontier");
});

test("the evaluation corpus is built from representative deliveries", () => {
	const corpus = buildCorpus(representativeObservations());
	expect(corpus).toHaveLength(7);
	expect(corpus.every((entry) => entry.observation.controller.kind === "opus-readonly")).toBe(
		true,
	);
	expect(corpus.some((entry) => entry.workType === "search")).toBe(true);
	expect(corpus.some((entry) => entry.workType === "implement")).toBe(true);
	expect(corpus.every((entry) => entry.evaluation === undefined)).toBe(true);
});

test("fast models stay off until scored reversible work clears 90 percent", () => {
	const fromRuns = buildCorpus(representativeObservations());
	expect(evaluateFastDispatch(fromRuns).allowed).toBe(false);
	expect(evaluateFastDispatch(fromRuns).sampleSize).toBe(0);

	const scored = Array.from({ length: MIN_EVALUATED_FAST_SAMPLES }, (_, i) => ({
		...fromRuns[0]!,
		taskId: `search-${i}`,
		evaluation: { relativeUtility: 0.91, criticalMisses: 0 },
	}));
	const ready = evaluateFastDispatch(scored, search);
	expect(ready.allowed).toBe(true);
	expect(ready.relativeUtility).toBeGreaterThanOrEqual(
		FAST_RELATIVE_UTILITY_THRESHOLD,
	);

	const miss = scored.map((entry, i) =>
		i === 0
			? { ...entry, evaluation: { relativeUtility: 0.91, criticalMisses: 1 } }
			: entry,
	);
	expect(evaluateFastDispatch(miss, search).allowed).toBe(false);

	const weak = scored.map((entry) => ({
		...entry,
		evaluation: { relativeUtility: 0.8, criticalMisses: 0 },
	}));
	expect(evaluateFastDispatch(weak, search).allowed).toBe(false);
});

test("representative deliveries seed routing files, a report, and a corpus", async () => {
	const dir = await mkdtemp(join(tmpdir(), "routing-seed-"));
	try {
		const root = join(dir, ".delivery", "routing");
		const seed = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "representative-routing-runs.ts"),
				root,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await seed.exited).toBe(0);
		const report = Bun.spawn(
			["bun", join(import.meta.dir, "routing-report.ts"), root],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const reportOut = JSON.parse(await new Response(report.stdout).text());
		expect(await report.exited).toBe(0);
		expect(reportOut.report.taskCount).toBe(7);
		expect(reportOut.text).toContain("cheaper model");
		const corpusDir = join(root, "corpus");
		const corpus = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "evaluation-corpus.ts"),
				root,
				corpusDir,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await corpus.exited).toBe(0);
		const index = (await Bun.file(join(corpusDir, "index.json")).json()) as {
			entries: unknown[];
		};
		expect(index.entries.length).toBe(7);
		const entries = [];
		for (const file of [
			"run-discover-dashboard-search.json",
			"run-address-mdf-sample-classify.json",
		]) {
			entries.push(await Bun.file(join(corpusDir, file)).json());
		}
		const entriesPath = join(dir, "entries.json");
		await Bun.write(entriesPath, JSON.stringify(entries));
		const gate = Bun.spawn(
			["bun", join(import.meta.dir, "fast-dispatch.ts"), entriesPath],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const stdout = await new Response(gate.stdout).text();
		expect(await gate.exited).toBe(0);
		expect(JSON.parse(stdout).allowed).toBe(false);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("CLI persists an observation without printing dispatch", async () => {
	const dir = await mkdtemp(join(tmpdir(), "record-routing-"));
	try {
		const profilePath = join(dir, "profile.json");
		const outcomePath = join(dir, "outcome.json");
		await Bun.write(profilePath, JSON.stringify(search));
		await Bun.write(
			outcomePath,
			JSON.stringify({
				gates: [{ name: "green", passed: true }],
				gatesPassed: true,
				repairs: 0,
				escalations: 0,
				terminal: "approve",
			}),
		);
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "record-routing.ts"),
				"persist",
				join(dir, ".delivery", "routing"),
				"run-cli",
				profilePath,
				"sonnet",
				outcomePath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const stdout = await new Response(proc.stdout).text();
		expect(await proc.exited).toBe(0);
		expect(stdout).not.toContain("dispatch");
		expect(JSON.parse(stdout).shadowTier).toBe("fast");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
