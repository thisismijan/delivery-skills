import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectReadyWave } from "./config";
import { type LandGateInput, decideLand } from "./land-gate";
import { LEVEL_SETTINGS } from "./levels";
import {
	allowRound,
	emptyRounds,
	recordRound,
	roundLimitReason,
} from "./review-rounds";
import { decideStage3Readiness } from "./stage3-readiness";
import { liveWorkers, watchWorkers } from "./worker-watch";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "limits-"));
	dirs.push(dir);
	return dir;
}
const HEAD = (n: number) => n.toString(16).padStart(40, "0");
const bug = (id: string, assumption: string) => ({
	commentId: id,
	classification: "bug",
	reasoning: "r",
	assumption,
});

describe("the parallel worker cap counts workers already running", () => {
	const cap = LEVEL_SETTINGS.standard.maxParallelWorktrees;
	const running = ["MDF-3250", "MDF-3251", "MDF-3252", "MDF-3253"];

	test("with the cap already reached, a fifth worker is refused", () => {
		expect(running).toHaveLength(cap);
		expect(selectReadyWave(["MDF-3254"], cap, running)).toEqual({
			dispatch: [],
			queued: ["MDF-3254"],
		});
	});

	test("room left under the cap is all that is dispatched, and a running key is not dispatched again", () => {
		expect(
			selectReadyWave(["MDF-3254", "MDF-3255"], cap, running.slice(0, 3)),
		).toEqual({ dispatch: ["MDF-3254"], queued: ["MDF-3255"] });
		expect(() => selectReadyWave(["MDF-3250"], cap, running)).toThrow(
			/already has a worker running/,
		);
	});

	test("finished workers do not count, and are not watched for idleness", () => {
		const dispatch = {
			workers: [
				{
					key: "MDF-1",
					dispatchedAt: "2026-10-22T08:00:00Z",
					finishedAt: "2026-10-22T09:00:00Z",
				},
				{ key: "MDF-2", dispatchedAt: "2026-10-22T08:00:00Z" },
			],
		};
		expect(liveWorkers(dispatch).map((worker) => worker.key)).toEqual([
			"MDF-2",
		]);
		const watched = watchWorkers({
			workersDir: tempDir(),
			dispatch,
			now: new Date("2026-10-22T12:00:00Z"),
			idleLimitMinutes: 20,
		});
		expect(watched.workers.map((worker) => worker.key)).toEqual(["MDF-2"]);
	});

	test("the ready-wave command reads live workers from dispatch.json", () => {
		const dir = tempDir();
		const path = join(dir, "dispatch.json");
		writeFileSync(
			path,
			JSON.stringify({
				workers: running.map((key) => ({
					key,
					dispatchedAt: "2026-10-22T08:00:00Z",
				})),
			}),
		);
		const proc = Bun.spawnSync(
			[
				"bun",
				join(import.meta.dir, "config.ts"),
				"ready-wave",
				JSON.stringify(["MDF-3254"]),
				path,
			],
			{
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, MAX_PARALLEL_WORKTREES: String(cap) },
			},
		);
		expect(proc.exitCode).toBe(0);
		expect(JSON.parse(proc.stdout.toString())).toMatchObject({
			dispatch: [],
			queued: ["MDF-3254"],
			live: running,
		});
	});
});

describe("the review-round cap needs a recorded approval to pass", () => {
	function threeRounds() {
		let rounds = emptyRounds();
		for (const n of [1, 2, 3]) {
			rounds = recordRound(rounds, [bug(`c${n}`, `idea-${n}`)], HEAD(n));
		}
		return rounds;
	}

	test("a fourth review pass at the standard level is refused", () => {
		const rounds = threeRounds();
		expect(
			roundLimitReason(rounds, LEVEL_SETTINGS.standard.maxReviewRounds),
		).toBeUndefined();
		const fourth = recordRound(rounds, [bug("c4", "idea-4")], HEAD(4));
		expect(
			roundLimitReason(fourth, LEVEL_SETTINGS.standard.maxReviewRounds),
		).toMatch(/review round 4, past the limit of 3/);
		expect(
			roundLimitReason(fourth, LEVEL_SETTINGS.max.maxReviewRounds),
		).toBeUndefined();
	});

	test("the operator's approval for that exact round lets it through", () => {
		const allowed = allowRound(threeRounds(), 4, {
			who: "operator",
			words: "one more round",
			at: "2026-10-27T10:00:00.000Z",
		});
		const fourth = recordRound(allowed, [bug("c4", "idea-4")], HEAD(4));
		expect(roundLimitReason(fourth, 3)).toBeUndefined();
		const fifth = recordRound(fourth, [bug("c5", "idea-5")], HEAD(5));
		expect(roundLimitReason(fifth, 3)).toMatch(/review round 5/);
		expect(() =>
			allowRound(threeRounds(), 5, {
				who: "o",
				words: "w",
				at: "2026-10-27T10:00:00.000Z",
			}),
		).toThrow(/only the next round, 4/);
		expect(() => allowRound(threeRounds(), 4, { who: "o" })).toThrow();
	});

	test("the record command refuses the round and leaves the file unchanged", () => {
		const dir = tempDir();
		const path = join(dir, "review-rounds.json");
		writeFileSync(path, JSON.stringify(threeRounds()));
		const classification = join(dir, "c.json");
		writeFileSync(classification, JSON.stringify([bug("c4", "idea-4")]));
		const before = readFileSync(path, "utf8");
		const script = join(import.meta.dir, "review-rounds.ts");
		const run = (...args: string[]) =>
			Bun.spawnSync(["bun", script, ...args], {
				stdout: "pipe",
				stderr: "pipe",
			});
		const refused = run("record", path, classification, HEAD(4));
		expect(refused.exitCode).toBe(1);
		expect(JSON.parse(refused.stdout.toString())).toMatchObject({
			decision: "stop",
			round: 4,
		});
		expect(readFileSync(path, "utf8")).toBe(before);
		const approval = join(dir, "approval.json");
		writeFileSync(
			approval,
			JSON.stringify({
				who: "operator",
				words: "go on",
				at: "2026-10-27T10:00:00.000Z",
			}),
		);
		expect(run("allow", path, "4", approval).exitCode).toBe(0);
		expect(run("record", path, classification, HEAD(4)).exitCode).toBe(0);
	});

	test("an older rounds file without allowances still loads", () => {
		const { allowances: _allowances, ...old } = threeRounds();
		expect(roundLimitReason(recordRound(old as never, [], HEAD(4)), 3)).toMatch(
			/round 4/,
		);
	});
});

describe("a push after GO is seen before landing", () => {
	const A = "a".repeat(40);
	const B = "b".repeat(40);

	test("the land gate refuses a GO given at an earlier commit", () => {
		const input: LandGateInput = {
			request: {
				ref: "1001",
				headRevision: B,
				kind: "change",
				ticketKey: "MDF-1",
				readNoteIds: [],
			},
			change: {
				state: "open",
				draft: false,
				revisions: { head: B },
				pipeline: {
					available: true,
					status: "success",
					revision: B,
					current: true,
				},
				mergeability: {
					available: true,
					conflicts: false,
					status: "mergeable",
				},
			},
			approvals: {
				headRevision: B,
				approval: { available: true, approvedBy: ["reviewer"], rulesMet: true },
			},
			discussions: { headRevision: B, discussions: [] },
			ledger: [
				`Run contract: c.json (sha256:${"1".repeat(64)})`,
				"## Verdicts",
				"| Date | MR | Kind | Head | Base | Patch-id | Verdict | By |",
				"|------|----|------|------|------|----------|---------|----|",
				`| 2026-10-22 | !1001 | readiness | ${A} | x | p | go | factory |`,
				"## Approvals",
				"- continuous-delivery: yes",
			].join("\n"),
			contract: { ok: true },
			contractHash: `sha256:${"1".repeat(64)}`,
			settle: { decision: "settled", reasons: [] },
		};
		expect(decideLand(input)).toEqual({
			decision: "stop",
			reasons: ["The readiness GO was given at a different commit."],
		});
	});

	test("release readiness finds no current review for the new commit", () => {
		const maxPass = `**Verdict:** PASS\n\n<!-- code-review-max:mr=1001 head=${A} -->\n`;
		const approachPass = `**Verdict:** approach is sound\n\n<!-- mr-review:${A} -->\n`;
		expect(
			decideStage3Readiness({ iid: "1001", head: B, maxPass, approachPass })
				.decision,
		).not.toBe("ready");
	});
});
