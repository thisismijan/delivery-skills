import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	decideRound,
	emptyRounds,
	loadRounds,
	recordPremiseCheck,
	recordRound,
} from "./review-rounds";

const HEAD = (n: number) => n.toString(16).padStart(40, "0");
const bug = (id: string, assumption: string) => ({
	commentId: id,
	classification: "bug",
	reasoning: "r",
	assumption,
});
const nit = (id: string) => ({
	commentId: id,
	classification: "nitpick",
	reasoning: "r",
});

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

test("a first round, and a round with new assumptions, continue", () => {
	let rounds = recordRound(
		emptyRounds(),
		[bug("a", "fields-found-by-pattern")],
		HEAD(1),
	);
	expect(decideRound(rounds)).toEqual({ decision: "continue", round: 1 });
	rounds = recordRound(
		rounds,
		[bug("b", "comments-are-stripped"), nit("c")],
		HEAD(2),
	);
	expect(decideRound(rounds)).toEqual({ decision: "continue", round: 2 });
	rounds = recordRound(rounds, [nit("d")], HEAD(3));
	expect(decideRound(rounds)).toEqual({ decision: "continue", round: 3 });
});

test("an assumption seen in any earlier round needs a premise check", () => {
	let rounds = recordRound(
		emptyRounds(),
		[bug("a", "fields-found-by-pattern")],
		HEAD(1),
	);
	rounds = recordRound(rounds, [bug("b", "comments-are-stripped")], HEAD(2));
	rounds = recordRound(
		rounds,
		[bug("c", "fields-found-by-pattern"), bug("d", "fields-found-by-pattern")],
		HEAD(3),
	);
	expect(decideRound(rounds)).toEqual({
		decision: "premise-check",
		round: 3,
		repeated: ["fields-found-by-pattern"],
	});
});

test("after a premise check, the same assumption again stops the round", () => {
	let rounds = recordRound(
		emptyRounds(),
		[bug("a", "fields-found-by-pattern")],
		HEAD(1),
	);
	rounds = recordRound(rounds, [bug("b", "fields-found-by-pattern")], HEAD(2));
	rounds = recordPremiseCheck(
		rounds,
		"fields-found-by-pattern",
		"Matching call shapes cannot be complete; note unless every call is proven local.",
	);
	rounds = recordRound(
		rounds,
		[bug("c", "locals-trusted-everywhere")],
		HEAD(3),
	);
	expect(decideRound(rounds).decision).toBe("continue");
	rounds = recordRound(rounds, [bug("d", "fields-found-by-pattern")], HEAD(4));
	const decision = decideRound(rounds);
	expect(decision).toMatchObject({
		decision: "stop",
		round: 4,
		repeated: ["fields-found-by-pattern"],
	});
	expect(decision.decision === "stop" && decision.reason).toMatch(
		/already re-examined for fields-found-by-pattern/,
	);
});

test("re-recording the same head replaces that round instead of adding one", () => {
	let rounds = recordRound(emptyRounds(), [bug("a", "x")], HEAD(1));
	rounds = recordRound(rounds, [bug("a", "x"), bug("b", "y")], HEAD(1));
	expect(rounds.rounds).toHaveLength(1);
	expect(rounds.rounds[0]?.bugs.map((entry) => entry.assumption)).toEqual([
		"x",
		"y",
	]);
	expect(decideRound(rounds).decision).toBe("continue");
});

test("a premise check is refused when nothing repeated, or for another label", () => {
	let rounds = recordRound(emptyRounds(), [bug("a", "x")], HEAD(1));
	expect(() => recordPremiseCheck(rounds, "x", "o")).toThrow(/does not need/);
	rounds = recordRound(rounds, [bug("b", "x")], HEAD(2));
	expect(() => recordPremiseCheck(rounds, "y", "o")).toThrow(/did not repeat/);
	expect(() => recordPremiseCheck(rounds, "x", "  ")).toThrow();
});

test("malformed input fails closed", () => {
	expect(() =>
		recordRound(
			emptyRounds(),
			[{ commentId: "a", classification: "bug", reasoning: "r" }],
			HEAD(1),
		),
	).toThrow(/names the assumption/);
	expect(() => recordRound(emptyRounds(), [bug("a", "x")], "abc123")).toThrow(
		/full commit SHA/,
	);
	expect(() => decideRound(emptyRounds())).toThrow(/no review round/);
	const dir = mkdtempSync(join(tmpdir(), "review-rounds-"));
	dirs.push(dir);
	const path = join(dir, "review-rounds.json");
	writeFileSync(path, "{nope");
	expect(() => loadRounds(path)).toThrow(/not valid JSON/);
	writeFileSync(
		path,
		JSON.stringify({
			version: 1,
			rounds: [{ round: 2, head: HEAD(1), bugs: [] }],
			premiseChecks: [],
		}),
	);
	expect(() => loadRounds(path)).toThrow();
	expect(loadRounds(join(dir, "missing.json"))).toEqual(emptyRounds());
});

test("the command line records rounds and exits 0, 3, or 1", () => {
	const dir = mkdtempSync(join(tmpdir(), "review-rounds-"));
	dirs.push(dir);
	const path = join(dir, "review-rounds.json");
	const script = join(import.meta.dir, "review-rounds.ts");
	const run = (...args: string[]) =>
		Bun.spawnSync(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });
	const classification = (name: string, value: unknown) => {
		const file = join(dir, name);
		writeFileSync(file, JSON.stringify(value));
		return file;
	};
	expect(
		run("record", path, classification("r1.json", [bug("a", "x")]), HEAD(1))
			.exitCode,
	).toBe(0);
	const second = run(
		"record",
		path,
		classification("r2.json", [bug("b", "x")]),
		HEAD(2),
	);
	expect(second.exitCode).toBe(3);
	expect(JSON.parse(second.stdout.toString())).toMatchObject({
		decision: "premise-check",
	});
	const outcome = join(dir, "outcome.md");
	writeFileSync(
		outcome,
		"Replaced the pattern match with a fail-closed rule.\n",
	);
	expect(run("premise", path, "x", outcome).exitCode).toBe(0);
	expect(
		run("record", path, classification("r3.json", [bug("c", "x")]), HEAD(3))
			.exitCode,
	).toBe(1);
	expect(JSON.parse(readFileSync(path, "utf8")).premiseChecks).toHaveLength(1);
	expect(run("record", path).exitCode).toBe(2);
});
