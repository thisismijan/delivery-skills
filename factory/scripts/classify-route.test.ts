import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type ActionGroup, classifyRoute } from "./classify-route";

const GROUPS: Array<[string, ActionGroup]> = [
	["bug", "action"],
	["test-gap", "action"],
	["non-functional", "action"],
	["nitpick", "dispute"],
	["false-positive", "dispute"],
	["question", "answer"],
	["outdated", "skip"],
];

describe("classifyRoute", () => {
	test.each(GROUPS)("%s belongs to the %s group", (classification, group) => {
		expect(classifyRoute(classification)).toBe(group);
	});

	test.each([
		["an unlisted class", "enhancement"],
		["the empty string", ""],
		["a resolution word", "resolved"],
		["a capitalised class", "Bug"],
		["an upper-case class", "BUG"],
		["the word null", "null"],
		["an object prototype key", "constructor"],
		["another prototype key", "toString"],
	])("%s has no group and throws", (_label, classification) => {
		expect(() => classifyRoute(classification)).toThrow(
			"unknown classification",
		);
	});
});

describe("classify-route command", () => {
	const script = join(import.meta.dir, "classify-route.ts");
	const run = (...args: string[]) =>
		Bun.spawnSync(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });

	test("prints the class with its group", () => {
		const result = run("false-positive");
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout.toString())).toEqual({
			classification: "false-positive",
			action: "dispute",
		});
	});

	test("exits 1 for an unknown or missing class", () => {
		expect(run("wontfix").exitCode).toBe(1);
		expect(run().exitCode).toBe(1);
	});
});
