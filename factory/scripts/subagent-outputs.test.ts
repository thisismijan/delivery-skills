import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	REPAIR_TURNS,
	SUBAGENT_OUTPUTS,
	SUBAGENT_POLICY_INVOCATION,
	repairPolicy,
} from "./subagent-outputs";

const root = join(import.meta.dir, "..", "..");

test("every agent the pack ships is classified", () => {
	const agents = readdirSync(join(root, "factory", "agents"))
		.filter((name) => name.endsWith(".md"))
		.map((name) => name.replace(/\.md$/, ""));
	for (const agent of agents) {
		expect({ agent, listed: agent in SUBAGENT_OUTPUTS }).toEqual({
			agent,
			listed: true,
		});
	}
});

test("malformed lens candidates get one repair turn", () => {
	expect(REPAIR_TURNS).toBe(1);
	expect(repairPolicy("review-lens")).toEqual({
		subagent: "review-lens",
		kind: "advisory",
		repairTurns: 1,
	});
	expect(repairPolicy("focused-pass").repairTurns).toBe(1);
});

test("a malformed gating verdict such as feasibility or holdout gets no repair", () => {
	for (const gate of [
		"ticket-assessor",
		"feasibility-analyst",
		"approach-challenger",
		"explain-back-reader",
		"first-pass-reviewer",
		"holdout-reviewer",
		"comment-assessor",
		"adjudication",
	]) {
		expect(repairPolicy(gate)).toEqual({
			subagent: gate,
			kind: "gating",
			repairTurns: 0,
		});
	}
});

test("a subagent not on the list is treated as gating and refused", () => {
	expect(() => repairPolicy("new-agent")).toThrow(
		"treated as gating and fails closed",
	);
	const proc = Bun.spawnSync(
		[
			"bun",
			join(import.meta.dir, "subagent-outputs.ts"),
			"policy",
			"new-agent",
		],
		{ stdout: "pipe", stderr: "pipe", env: process.env },
	);
	expect(proc.exitCode).toBe(1);
});

test("the conventions and the code review state the repair rule", () => {
	const conventions = readFileSync(
		join(root, "factory", "CONVENTIONS.md"),
		"utf8",
	).replace(/\s+/g, " ");
	expect(conventions).toContain(
		"Every subagent output is listed in `scripts/subagent-outputs.ts` as gating or advisory.",
	);
	expect(conventions).toContain(
		"malformed → fail closed at once (stop + escalate), with no repair",
	);
	expect(conventions).toContain(
		"gets one repair turn: the same subagent receives the parse error and returns only its corrected output, doing no new work. A second failure fails closed.",
	);
	expect(conventions).toContain(
		SUBAGENT_POLICY_INVOCATION.replace("scripts/", ""),
	);
	const review = readFileSync(
		join(root, "skills", "code-review-max", "SKILL.md"),
		"utf8",
	).replace(/\s+/g, " ");
	const repair = readFileSync(
		join(root, "skills", "code-review-max", "reference", "coverage-repair.md"),
		"utf8",
	).replace(/\s+/g, " ");
	expect(review).toContain("reference/coverage-repair.md");
	expect(repair).toContain(
		"give that same lens one repair turn with the script's message",
	);
	expect(review).toContain("A second refusal stops the review.");
	expect(review).toContain(
		"Adjudication output is gating and is never repaired.",
	);
});
