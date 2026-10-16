import { expect, test } from "bun:test";
import { buildCorpus, scoreCandidate } from "./evaluation-corpus";
import {
	FAST_RELATIVE_UTILITY_THRESHOLD,
	type FastSafetyFloor,
	MIN_EVALUATED_FAST_SAMPLES,
	applyFastPromotion,
	evaluateFastDispatch,
	evaluatePromotion,
	namedSafetyFloor,
} from "./fast-dispatch";
import { loadModelCatalogue } from "./model-catalogue";
import { buildObservation } from "./record-routing";
import { representativeObservations } from "./representative-routing-runs";
import type { RoutingObservation } from "./routing-observation";
import type { TaskProfileInput } from "./task-profile";

const SPARK = "muse-spark-1.3-medium";
const COMPOSER = "composer-1";

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

const passed = {
	gates: [{ name: "green", passed: true }],
	gatesPassed: true,
	repairs: 0,
	escalations: 0,
	terminal: "approve" as const,
};

function observation(overrides?: {
	source?: RoutingObservation["source"];
	taskId?: string;
	profile?: TaskProfileInput;
}): RoutingObservation {
	const profile = overrides?.profile ?? {
		...search,
		taskId: overrides?.taskId ?? search.taskId,
	};
	return buildObservation({
		runId: "run-1",
		profile,
		currentModel: "sonnet",
		source: overrides?.source ?? "representative-run",
		recordedAt: "2026-10-15T10:00:00.000Z",
		outcome: passed,
	});
}

function scored(options: {
	count: number;
	source?: RoutingObservation["source"];
	candidateModel?: string;
	relativeUtility?: number;
	criticalMisses?: number;
	profile?: TaskProfileInput;
}) {
	const source = options.source ?? "representative-run";
	const candidateModel = options.candidateModel ?? SPARK;
	return Array.from({ length: options.count }, (_, i) =>
		scoreCandidate(
			observation({
				source,
				taskId: `${options.profile?.taskId ?? "search"}-${source}-${i}`,
				profile: options.profile,
			}),
			{
				candidateModel,
				relativeUtility: options.relativeUtility ?? 0.91,
				criticalMisses: options.criticalMisses ?? 0,
			},
		),
	);
}

const clearing = () =>
	scored({ count: MIN_EVALUATED_FAST_SAMPLES, relativeUtility: 0.91 });

test("the 90 percent bar stays at 0.9", () => {
	expect(FAST_RELATIVE_UTILITY_THRESHOLD).toBe(0.9);
	expect(MIN_EVALUATED_FAST_SAMPLES).toBe(5);
});

test("mixed live and representative evidence is not enough", () => {
	const mixed = [
		...scored({ count: 3, source: "live" }),
		...scored({ count: 3, source: "representative-run" }),
	];
	const dispatch = evaluateFastDispatch(mixed, search, SPARK);
	expect(dispatch.allowed).toBe(false);
	expect(dispatch.sampleSize).toBe(3);
	const promotion = evaluatePromotion(mixed, SPARK);
	expect(promotion.availability).toBe("evaluation-only");
	expect(promotion.evidenceCleared).toBe(false);
	expect(promotion.sampleSize).toBe(3);
});

test("live-only scores do not count", () => {
	const live = scored({
		count: MIN_EVALUATED_FAST_SAMPLES,
		source: "live",
	});
	const dispatch = evaluateFastDispatch(live, search, SPARK);
	expect(dispatch.allowed).toBe(false);
	expect(dispatch.sampleSize).toBe(0);
	const promotion = evaluatePromotion(live, SPARK);
	expect(promotion.availability).toBe("evaluation-only");
	expect(promotion.sampleSize).toBe(0);
});

test("a different candidate's scores do not count", () => {
	const spark = clearing();
	expect(evaluateFastDispatch(spark, search, COMPOSER).allowed).toBe(false);
	expect(evaluatePromotion(spark, COMPOSER).evidenceCleared).toBe(false);
});

test("unscored representative fixtures do not clear dispatch or promotion", () => {
	const fixtures = buildCorpus(representativeObservations());
	expect(evaluateFastDispatch(fixtures, search, SPARK).allowed).toBe(false);
	const promotion = evaluatePromotion(fixtures, SPARK, {
		approval: { candidateModel: SPARK },
	});
	expect(promotion.availability).toBe("evaluation-only");
	expect(promotion.evidenceCleared).toBe(false);
});

test("fewer than five representative cases stay evaluation-only", () => {
	const four = scored({ count: 4, relativeUtility: 0.95 });
	expect(evaluateFastDispatch(four, search, SPARK).allowed).toBe(false);
	const promotion = evaluatePromotion(four, SPARK, {
		approval: { candidateModel: SPARK },
	});
	expect(promotion.availability).toBe("evaluation-only");
	expect(promotion.evidenceCleared).toBe(false);
	expect(promotion.sampleSize).toBe(4);
});

test("utility below 90 percent stays evaluation-only", () => {
	const weak = scored({
		count: MIN_EVALUATED_FAST_SAMPLES,
		relativeUtility: 0.8,
	});
	expect(evaluateFastDispatch(weak, search, SPARK).allowed).toBe(false);
	expect(evaluatePromotion(weak, SPARK).availability).toBe("evaluation-only");
});

test("an 89 percent mean does not lower the bar", () => {
	const justUnder = scored({
		count: MIN_EVALUATED_FAST_SAMPLES,
		relativeUtility: 0.89,
	});
	expect(evaluateFastDispatch(justUnder, search, SPARK).allowed).toBe(false);
	expect(evaluatePromotion(justUnder, SPARK).availability).toBe(
		"evaluation-only",
	);
	expect(evaluatePromotion(justUnder, SPARK).relativeUtility).toBe(0.89);
});

test("any critical miss stays evaluation-only", () => {
	const miss = clearing().map((entry, i) =>
		i === 0
			? {
					...entry,
					evaluation: {
						...entry.evaluation,
						candidateModel: SPARK,
						relativeUtility: 0.91,
						criticalMisses: 1,
					},
				}
			: entry,
	);
	expect(evaluateFastDispatch(miss, search, SPARK).allowed).toBe(false);
	expect(evaluatePromotion(miss, SPARK).availability).toBe("evaluation-only");
	expect(evaluatePromotion(miss, SPARK).criticalMisses).toBe(1);
});

function floorProfile(
	overrides: Partial<TaskProfileInput> &
		Pick<TaskProfileInput, "taskId" | "reason">,
): TaskProfileInput {
	return { ...search, ...overrides };
}

const floorCases: Array<{
	name: string;
	profile: TaskProfileInput;
	floor: FastSafetyFloor;
}> = [
	{
		name: "auth",
		profile: floorProfile({
			taskId: "auth-search",
			domains: ["auth"],
			reason: ["lists auth call sites"],
		}),
		floor: "auth",
	},
	{
		name: "migration",
		profile: floorProfile({
			taskId: "migration-search",
			domains: ["migration"],
			reason: ["lists migration call sites"],
		}),
		floor: "migration",
	},
	{
		name: "concurrency",
		profile: floorProfile({
			taskId: "concurrency-search",
			domains: ["concurrency"],
			reason: ["lists lock sites"],
		}),
		floor: "concurrency",
	},
	{
		name: "distributed-state",
		profile: floorProfile({
			taskId: "distributed-search",
			domains: ["distributed-state"],
			reason: ["lists replica sites"],
		}),
		floor: "distributed-state",
	},
	{
		name: "weak-verification",
		profile: floorProfile({
			taskId: "weak-search",
			verificationStrength: "weak",
			reason: ["no executable check"],
		}),
		floor: "weak-verification",
	},
	{
		name: "holdout",
		profile: floorProfile({
			taskId: "holdout-review",
			stage: "execute",
			workType: "review",
			reason: ["final holdout adjudication"],
		}),
		floor: "holdout",
	},
];

for (const { name, profile, floor } of floorCases) {
	test(`${name} work is blocked by the named safety floor`, () => {
		expect(namedSafetyFloor(profile)).toBe(floor);
		const verdict = evaluateFastDispatch(clearing(), profile, SPARK);
		expect(verdict.allowed).toBe(false);
		expect(verdict.reason).toContain(floor);
	});
}

test("a named floor still blocks after the quality bar clears", () => {
	const auth = floorCases[0];
	if (!auth) throw new Error("auth floor fixture missing");
	const evidence = clearing();
	expect(evaluateFastDispatch(evidence, search, SPARK).allowed).toBe(true);
	const blocked = evaluateFastDispatch(evidence, auth.profile, SPARK);
	expect(blocked.allowed).toBe(false);
	expect(blocked.reason).toContain("auth");
	expect(namedSafetyFloor(auth.profile)).toBe("auth");
});

test("passing evidence without approval leaves availability unchanged", async () => {
	const catalogue = await loadModelCatalogue();
	const before = structuredClone(catalogue);
	const verdict = evaluatePromotion(clearing(), SPARK);
	expect(verdict.evidenceCleared).toBe(true);
	expect(verdict.availability).toBe("evaluation-only");
	const next = applyFastPromotion(catalogue, verdict);
	expect(next).toEqual(before);
	expect(
		next.tiers.fast.candidates.find((candidate) => candidate.id === SPARK)
			?.availability,
	).toBe("evaluation-only");
	expect(catalogue).toEqual(before);
});

test("approval for another candidate leaves availability unchanged", async () => {
	const catalogue = await loadModelCatalogue();
	const before = structuredClone(catalogue);
	const verdict = evaluatePromotion(clearing(), SPARK, {
		approval: { candidateModel: COMPOSER },
	});
	expect(verdict.evidenceCleared).toBe(true);
	expect(verdict.availability).toBe("evaluation-only");
	expect(applyFastPromotion(catalogue, verdict)).toEqual(before);
});

test("public rankings do not promote", async () => {
	const catalogue = await loadModelCatalogue();
	const rankings = [{ model: SPARK, rank: 1, score: 0.99 }];
	const verdict = evaluatePromotion([], SPARK, {
		rankings,
		approval: { candidateModel: SPARK },
	});
	expect(verdict.availability).toBe("evaluation-only");
	expect(verdict.evidenceCleared).toBe(false);
	expect(
		applyFastPromotion(catalogue, verdict).tiers.fast.candidates.find(
			(candidate) => candidate.id === SPARK,
		)?.availability,
	).toBe("evaluation-only");
});

test("exact operator promotion approval can mark only that candidate live", async () => {
	const catalogue = await loadModelCatalogue();
	const before = structuredClone(catalogue);
	const verdict = evaluatePromotion(clearing(), SPARK, {
		approval: { candidateModel: SPARK },
	});
	expect(verdict.evidenceCleared).toBe(true);
	expect(verdict.availability).toBe("live");
	const next = applyFastPromotion(catalogue, verdict);
	expect(
		next.tiers.fast.candidates.find((candidate) => candidate.id === SPARK)
			?.availability,
	).toBe("live");
	expect(
		next.tiers.fast.candidates.find((candidate) => candidate.id === COMPOSER)
			?.availability,
	).toBe("evaluation-only");
	expect(
		next.tiers.fast.candidates.find((candidate) => candidate.id === "haiku")
			?.availability,
	).toBe("evaluation-only");
	expect(catalogue).toEqual(before);
});
