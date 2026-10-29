import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_FIX_ATTEMPTS,
	DEFAULT_MAX_PARALLEL_WORKTREES,
	DEFAULT_MAX_REVIEW_ROUNDS,
	loadConfig,
} from "./config";
import {
	DEFAULT_DELIVERY_LEVEL,
	DELIVERY_LEVELS,
	LEVEL_SETTINGS,
	parseLevel,
	splitLevel,
} from "./levels";
import { classifyEntry, selectNextAction } from "./next-action";
import {
	REVIEW_LENSES,
	type ReviewFanoutInput,
	planReadinessFanout,
	planReviewFanout,
} from "./review-fanout";
import {
	checkRunContract,
	contractLevel,
	freezeAgainstLiveConstitution,
	loadConstitution,
} from "./sdlc-constitution";
import { selectModel } from "./select-model";

const VERBS = new Set(["auto", "execute", "review", "status"]);

describe("level presets", () => {
	test("standard is exactly the behaviour before levels existed", () => {
		expect(DEFAULT_DELIVERY_LEVEL).toBe("standard");
		expect(LEVEL_SETTINGS.standard).toMatchObject({
			maxParallelWorktrees: DEFAULT_MAX_PARALLEL_WORKTREES,
			maxFixAttempts: DEFAULT_MAX_FIX_ATTEMPTS,
			maxReviewRounds: DEFAULT_MAX_REVIEW_ROUNDS,
			reviewBreadth: "measured",
			implementerTier: "measured",
		});
		expect(DEFAULT_MAX_PARALLEL_WORKTREES).toBe(4);
		expect(DEFAULT_MAX_FIX_ATTEMPTS).toBe(2);
		expect(DEFAULT_MAX_REVIEW_ROUNDS).toBe(3);
		const config = loadConfig({});
		expect(config.level).toBe("standard");
		expect(config.overrides).toEqual([]);
	});

	test("each knob moves the same way from min to max", () => {
		const [min, standard, max] = DELIVERY_LEVELS.map(
			(level) => LEVEL_SETTINGS[level],
		);
		for (const knob of [
			"maxParallelWorktrees",
			"maxFixAttempts",
			"maxReviewRounds",
		] as const) {
			expect(min?.[knob]).toBeLessThan(standard?.[knob] ?? 0);
			expect(standard?.[knob]).toBeLessThan(max?.[knob] ?? 0);
		}
	});

	test("config resolves a level and lets an explicit variable win", () => {
		expect(loadConfig({ DELIVERY_LEVEL: "min" })).toMatchObject({
			level: "min",
			maxParallelWorktrees: 2,
			maxFixAttempts: 1,
			maxReviewRounds: 2,
			reviewBreadth: "size-trimmed",
			implementerTier: "measured",
			overrides: [],
		});
		expect(loadConfig({ DELIVERY_LEVEL: "max" })).toMatchObject({
			maxParallelWorktrees: 8,
			maxFixAttempts: 3,
			maxReviewRounds: 4,
			reviewBreadth: "every-lens",
			implementerTier: "frontier",
		});
		expect(
			loadConfig({ DELIVERY_LEVEL: "max", MAX_PARALLEL_WORKTREES: "3" }),
		).toMatchObject({
			maxParallelWorktrees: 3,
			maxFixAttempts: 3,
			overrides: ["MAX_PARALLEL_WORKTREES"],
		});
		expect(loadConfig({ MAX_REVIEW_ROUNDS: "5" }).maxReviewRounds).toBe(5);
	});

	test("an unknown or malformed level fails closed", () => {
		expect(() => loadConfig({ DELIVERY_LEVEL: "turbo" })).toThrow(
			/unknown delivery level/,
		);
		expect(() => loadConfig({ DELIVERY_LEVEL: "MAX" })).toThrow();
		expect(() => loadConfig({ MAX_REVIEW_ROUNDS: "0" })).toThrow();
		expect(() => parseLevel("medium")).toThrow();
		expect(parseLevel(undefined)).toBe("standard");
	});
});

describe("reading a level from the command", () => {
	test("takes the first word or the word right after the verb", () => {
		expect(splitLevel("auto max MDF-1234", VERBS)).toEqual({
			level: "max",
			args: "auto MDF-1234",
		});
		expect(splitLevel("min MDF-5678", VERBS)).toEqual({
			level: "min",
			args: "MDF-5678",
		});
		expect(splitLevel("max auto MDF-1", VERBS)).toEqual({
			level: "max",
			args: "auto MDF-1",
		});
		expect(splitLevel("execute min MDF-9", VERBS)).toEqual({
			level: "min",
			args: "execute MDF-9",
		});
		expect(splitLevel("auto MDF-1", VERBS)).toEqual({ args: "auto MDF-1" });
	});

	test("leaves prose alone and refuses two levels", () => {
		expect(splitLevel("raise the max upload size", VERBS)).toEqual({
			args: "raise the max upload size",
		});
		expect(() => splitLevel("max min MDF-1", VERBS)).toThrow(
			/one delivery level/,
		);
		expect(() => splitLevel("auto max min MDF-1", VERBS)).toThrow(
			/one delivery level/,
		);
		expect(() => splitLevel("max auto min MDF-1", VERBS)).toThrow(
			/one delivery level/,
		);
	});

	test("the next-action selector strips the level and hands it back", () => {
		expect(classifyEntry("auto max MDF-1234")).toMatchObject({
			kind: "explicit-verb",
			verb: "auto",
			level: "max",
		});
		expect(classifyEntry("min MDF-5678")).toEqual({
			kind: "bare-key",
			key: "MDF-5678",
			level: "min",
		});
		expect(selectNextAction({ args: "auto max MDF-1", status: null })).toEqual({
			kind: "run",
			verb: "auto",
			singleStep: true,
			level: "max",
		});
		expect(
			selectNextAction({ args: "min MDF-1", status: "[drafted]" }),
		).toMatchObject({ kind: "run", verb: "execute", level: "min" });
		expect(
			selectNextAction({ args: "max min MDF-1", status: null }),
		).toMatchObject({ kind: "stop" });
		expect(selectNextAction({ args: "turbo MDF-1", status: null })).toEqual({
			kind: "stop",
			reason: "That is not a known delivery command.",
		});
	});
});

const large = (
	overrides: Partial<ReviewFanoutInput> = {},
): ReviewFanoutInput => ({
	changedFiles: 20,
	changedLines: 900,
	reversible: true,
	classificationComplete: true,
	surfaces: [],
	...overrides,
});

describe("review breadth", () => {
	test("min trims lenses that only size added", () => {
		expect(planReviewFanout(large(), "measured").lenses).toEqual([
			...REVIEW_LENSES,
		]);
		expect(planReviewFanout(large(), "size-trimmed")).toMatchObject({
			mode: "contained",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
		});
	});

	test("min keeps every lens wherever the measured plan needs it for risk", () => {
		for (const risky of [
			large({ surfaces: ["auth"] }),
			large({ surfaces: ["data"] }),
			large({ surfaces: ["contract"] }),
			large({ surfaces: ["config"] }),
			large({ surfaces: ["infra"] }),
			large({ surfaces: ["dependencies"] }),
			large({ reversible: false }),
			large({ classificationComplete: false }),
			{ ...large({ surfaces: ["auth"] }), changedFiles: 1, changedLines: 3 },
		]) {
			expect(planReviewFanout(risky, "size-trimmed")).toEqual(
				planReviewFanout(risky, "measured"),
			);
			expect(planReviewFanout(risky, "size-trimmed").lenses).toEqual([
				...REVIEW_LENSES,
			]);
		}
	});

	test("min never trims below the measured plan for small or contained changes", () => {
		for (const input of [
			large({ changedFiles: 1, changedLines: 10 }),
			large({ changedFiles: 4, changedLines: 200 }),
		]) {
			expect(planReviewFanout(input, "size-trimmed")).toEqual(
				planReviewFanout(input, "measured"),
			);
		}
	});

	test("max runs every lens on any change with code", () => {
		const small = large({ changedFiles: 1, changedLines: 4 });
		expect(planReviewFanout(small, "every-lens").lenses).toEqual([
			...REVIEW_LENSES,
		]);
		expect(planReadinessFanout(small, "every-lens").mode).toBe("full");
		const empty = large({ changedFiles: 0, changedLines: 0 });
		expect(planReviewFanout(empty, "every-lens").mode).toBe("empty");
		expect(planReadinessFanout(empty, "every-lens").mode).toBe("empty");
	});

	test("no level reduces release readiness", () => {
		for (const input of [
			large(),
			large({ changedFiles: 1, changedLines: 4 }),
			large({ surfaces: ["auth"] }),
			large({ reversible: false }),
		]) {
			expect(planReadinessFanout(input, "size-trimmed")).toEqual(
				planReadinessFanout(input, "measured"),
			);
		}
	});
});

describe("model selection", () => {
	test("review stays frontier at every level", () => {
		for (const implementerTier of ["measured", "frontier"] as const) {
			expect(selectModel({ step: "review", implementerTier })).toBe("opus");
		}
	});

	test("max raises only the implementer; min keeps the justified frontier case", () => {
		expect(
			selectModel({ step: "implement", implementerTier: "frontier" }),
		).toBe("opus");
		expect(
			selectModel({ step: "write-tests", implementerTier: "frontier" }),
		).toBe("sonnet");
		expect(
			selectModel({
				step: "implement",
				complexitySignal: "high",
				frontierJustification: "lock-free queue",
				implementerTier: LEVEL_SETTINGS.min.implementerTier,
			}),
		).toBe("opus");
		expect(
			selectModel({
				step: "implement",
				complexitySignal: "low",
				implementerTier: LEVEL_SETTINGS.min.implementerTier,
			}),
		).toBe("sonnet");
	});
});

function draft(overrides: Record<string, unknown> = {}) {
	const live = loadConstitution();
	return {
		version: 1,
		runId: "levels-run",
		planVersion: 1,
		goal: "Ship the panel",
		scope: ["Add the panel"],
		nonGoals: [],
		tickets: [
			{
				key: "WORK-1",
				title: "Add the panel",
				acceptance: ["The panel shows spend"],
				blockedBy: [],
			},
		],
		permittedWrites: [...(live.document.stages.draft?.writes ?? [])],
		humanOwned: [...live.document.humanOwned],
		approval: {
			who: "operator",
			words: "yes",
			at: "2026-10-29T00:00:00.000Z",
		},
		...overrides,
	};
}

describe("the frozen run contract carries the level", () => {
	test("a contract without a level runs as standard", () => {
		const frozen = freezeAgainstLiveConstitution(draft());
		expect(frozen.level).toBeUndefined();
		expect(contractLevel(frozen)).toEqual({ ok: true, level: "standard" });
		expect(contractLevel(frozen, "standard").ok).toBe(true);
	});

	test("a different requested level stops until the plan is superseded", () => {
		const frozen = freezeAgainstLiveConstitution(draft({ level: "min" }));
		expect(contractLevel(frozen, "min")).toEqual({ ok: true, level: "min" });
		const changed = contractLevel(frozen, "max");
		expect(changed.ok).toBe(false);
		expect(changed.reason).toMatch(/approved at the min level/);
		expect(() => contractLevel(frozen, "turbo")).toThrow();
	});

	test("changing the level is a plan change that needs a new approval", () => {
		const current = freezeAgainstLiveConstitution(draft({ level: "min" }));
		const sameVersion = freezeAgainstLiveConstitution(draft({ level: "max" }));
		expect(sameVersion.contractHash).not.toBe(current.contractHash);
		expect(
			checkRunContract({
				frozen: current,
				constitution: loadConstitution(),
				stage: "draft",
				ticketKey: "WORK-1",
				proposal: sameVersion,
			}),
		).toEqual({ ok: false, reason: "a scope change needs a new plan version" });
		const superseded = freezeAgainstLiveConstitution(
			draft({
				level: "max",
				planVersion: 2,
				supersedesHash: current.contractHash,
				reason: "operator asked for speed",
				affectedInvariant: "delivery level",
				approval: {
					who: "operator",
					words: "run it at max",
					at: "2026-10-29T01:00:00.000Z",
				},
			}),
		);
		expect(
			checkRunContract({
				frozen: current,
				constitution: loadConstitution(),
				stage: "draft",
				ticketKey: "WORK-1",
				proposal: superseded,
			}).ok,
		).toBe(true);
	});

	test("an unknown level is refused at freeze", () => {
		expect(() =>
			freezeAgainstLiveConstitution(draft({ level: "turbo" })),
		).toThrow();
	});

	test("the level command reports and guards the contract level", async () => {
		const dir = await mkdtemp(join(tmpdir(), "levels-"));
		try {
			const path = join(dir, "contract.json");
			await writeFile(
				path,
				JSON.stringify(freezeAgainstLiveConstitution(draft({ level: "max" }))),
			);
			const run = (args: string[]) => {
				const proc = Bun.spawnSync(
					[
						"bun",
						join(import.meta.dir, "sdlc-constitution.ts"),
						"level",
						...args,
					],
					{ stdout: "pipe", stderr: "pipe" },
				);
				return {
					code: proc.exitCode,
					out: proc.stdout.toString(),
				};
			};
			expect(run([path])).toEqual({
				code: 0,
				out: `${JSON.stringify({ ok: true, level: "max" })}\n`,
			});
			expect(run([path, "max"]).code).toBe(0);
			expect(run([path, "min"]).code).toBe(1);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
