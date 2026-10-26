import { expect, test } from "bun:test";
import {
	CorpusEntry,
	TEST_REPO_STAND_IN_PROVENANCE,
	buildPromotionReport,
	corpusEntryFrom,
	scoreCandidate,
} from "./evaluation-corpus";
import { buildObservation } from "./record-routing";
import type { RoutingObservation } from "./routing-observation";
import type { TaskProfileInput } from "./task-profile";

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

function observation(overrides?: {
	source?: RoutingObservation["source"];
	workType?: TaskProfileInput["workType"];
	taskId?: string;
}): RoutingObservation {
	return buildObservation({
		runId: "run-1",
		profile: {
			...search,
			taskId: overrides?.taskId ?? search.taskId,
			workType: overrides?.workType ?? search.workType,
		},
		currentModel: "sonnet",
		source: overrides?.source ?? "live",
		recordedAt: "2026-10-15T10:00:00.000Z",
		outcome: {
			gates: [{ name: "green", passed: true }],
			gatesPassed: true,
			repairs: 0,
			escalations: 0,
			terminal: "approve",
		},
	});
}

test("score is recorded for the exact candidate and task class", () => {
	const entry = scoreCandidate(observation(), {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
	});
	expect(entry.evaluation).toEqual({
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
		taskClass: "search",
	});
	expect(entry.workType).toBe("search");
});

test("two candidates on one observation stay distinct", () => {
	const shared = observation();
	const spark = scoreCandidate(shared, {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
	});
	const composer = scoreCandidate(shared, {
		candidateModel: "composer-1",
		relativeUtility: 0.4,
		criticalMisses: 2,
	});
	expect(spark.evaluation).toEqual({
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
		taskClass: "search",
	});
	expect(composer.evaluation).toEqual({
		candidateModel: "composer-1",
		relativeUtility: 0.4,
		criticalMisses: 2,
		taskClass: "search",
	});
});

test("utility outside 0 to 1 is refused", () => {
	const shared = observation();
	expect(() =>
		scoreCandidate(shared, {
			candidateModel: "muse-spark-1.3-medium",
			relativeUtility: 1.1,
			criticalMisses: 0,
		}),
	).toThrow();
	expect(() =>
		scoreCandidate(shared, {
			candidateModel: "muse-spark-1.3-medium",
			relativeUtility: -0.01,
			criticalMisses: 0,
		}),
	).toThrow();
});

test("a negative or fractional critical-miss count is refused", () => {
	const shared = observation();
	expect(() =>
		scoreCandidate(shared, {
			candidateModel: "muse-spark-1.3-medium",
			relativeUtility: 0.5,
			criticalMisses: -1,
		}),
	).toThrow();
	expect(() =>
		scoreCandidate(shared, {
			candidateModel: "muse-spark-1.3-medium",
			relativeUtility: 0.5,
			criticalMisses: 1.5,
		}),
	).toThrow();
});

test("a test-repo stand-in score records provenance", () => {
	const entry = scoreCandidate(observation(), {
		candidateModel: "haiku",
		relativeUtility: 1,
		criticalMisses: 0,
		provenance: TEST_REPO_STAND_IN_PROVENANCE,
	});
	expect(entry.evaluation).toEqual({
		candidateModel: "haiku",
		relativeUtility: 1,
		criticalMisses: 0,
		taskClass: "search",
		provenance: TEST_REPO_STAND_IN_PROVENANCE,
	});
});

test("a stored evaluation without a task class still parses", () => {
	const stored = corpusEntryFrom(observation(), {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
	});
	const raw = JSON.parse(JSON.stringify(stored)) as {
		evaluation?: { taskClass?: unknown };
	};
	expect(raw.evaluation && "taskClass" in raw.evaluation).toBe(false);
	expect(CorpusEntry.parse(raw).evaluation).toEqual({
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
	});
});

test("live and representative evidence are reported separately", () => {
	const liveLow = scoreCandidate(observation({ taskId: "search-live-a" }), {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.8,
		criticalMisses: 1,
	});
	const liveHigh = scoreCandidate(observation({ taskId: "search-live-b" }), {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 1,
		criticalMisses: 0,
	});
	const representative = scoreCandidate(
		observation({ source: "representative-run", taskId: "search-synthetic" }),
		{
			candidateModel: "muse-spark-1.3-medium",
			relativeUtility: 0.5,
			criticalMisses: 2,
		},
	);
	const report = buildPromotionReport([liveLow, liveHigh, representative]);
	expect(report.groups).toHaveLength(2);
	expect(report.groups.find((group) => group.source === "live")).toEqual({
		candidateModel: "muse-spark-1.3-medium",
		taskClass: "search",
		source: "live",
		sampleSize: 2,
		relativeUtility: 0.9,
		criticalMisses: 1,
	});
	expect(
		report.groups.find((group) => group.source === "representative-run"),
	).toEqual({
		candidateModel: "muse-spark-1.3-medium",
		taskClass: "search",
		source: "representative-run",
		sampleSize: 1,
		relativeUtility: 0.5,
		criticalMisses: 2,
	});
});

test("test-repo stand-in scores are omitted from promotion groups", () => {
	const standIn = scoreCandidate(
		observation({ source: "representative-run", taskId: "search-stand-in" }),
		{
			candidateModel: "haiku",
			relativeUtility: 1,
			criticalMisses: 0,
			provenance: TEST_REPO_STAND_IN_PROVENANCE,
		},
	);
	expect(buildPromotionReport([standIn]).groups).toEqual([]);
});

test("entries without a score are not counted as evidence", () => {
	const scored = scoreCandidate(observation(), {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
	});
	const unscored = corpusEntryFrom(observation({ taskId: "search-unscored" }));
	const report = buildPromotionReport([unscored, scored]);
	expect(report.groups).toEqual([
		{
			candidateModel: "muse-spark-1.3-medium",
			taskClass: "search",
			source: "live",
			sampleSize: 1,
			relativeUtility: 0.91,
			criticalMisses: 0,
		},
	]);
});

test("different candidates and task classes are not combined", () => {
	const sparkSearch = scoreCandidate(observation(), {
		candidateModel: "muse-spark-1.3-medium",
		relativeUtility: 0.91,
		criticalMisses: 0,
	});
	const composerSearch = scoreCandidate(observation({ taskId: "search-b" }), {
		candidateModel: "composer-1",
		relativeUtility: 0.5,
		criticalMisses: 1,
	});
	const sparkClassify = scoreCandidate(
		observation({ workType: "classify", taskId: "classify" }),
		{
			candidateModel: "muse-spark-1.3-medium",
			relativeUtility: 0.7,
			criticalMisses: 0,
		},
	);
	const report = buildPromotionReport([
		sparkSearch,
		composerSearch,
		sparkClassify,
	]);
	expect(
		report.groups
			.map(
				(group) => `${group.candidateModel}:${group.taskClass}:${group.source}`,
			)
			.sort(),
	).toEqual([
		"composer-1:search:live",
		"muse-spark-1.3-medium:classify:live",
		"muse-spark-1.3-medium:search:live",
	]);
	expect(
		report.groups.find(
			(group) =>
				group.candidateModel === "composer-1" && group.taskClass === "search",
		),
	).toEqual({
		candidateModel: "composer-1",
		taskClass: "search",
		source: "live",
		sampleSize: 1,
		relativeUtility: 0.5,
		criticalMisses: 1,
	});
	expect(
		report.groups.find(
			(group) =>
				group.candidateModel === "muse-spark-1.3-medium" &&
				group.taskClass === "classify",
		),
	).toEqual({
		candidateModel: "muse-spark-1.3-medium",
		taskClass: "classify",
		source: "live",
		sampleSize: 1,
		relativeUtility: 0.7,
		criticalMisses: 0,
	});
});
