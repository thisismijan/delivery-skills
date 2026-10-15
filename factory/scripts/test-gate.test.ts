import { expect, test } from "bun:test";
import { evaluateGate, runTestGate } from "./test-gate";

test("runTestGate: success command -> passed true, exit 0", async () => {
	const r = await runTestGate({
		argv: ["bun", "-e", "console.log('sample.test.ts'); process.exit(0)"],
		expectedTestPaths: ["sample.test.ts"],
	});
	expect(r.passed).toBe(true);
	expect(r.exitCode).toBe(0);
	expect(r.executedExpectedTests).toBe(true);
});

test("runTestGate: failing command -> passed false, non-zero exit", async () => {
	const r = await runTestGate({
		argv: ["bun", "-e", "process.exit(3)"],
	});
	expect(r.passed).toBe(false);
	expect(r.exitCode).toBe(3);
});

test("runTestGate: captures output", async () => {
	const r = await runTestGate({
		argv: ["bun", "-e", "console.log('hello-gate')"],
	});
	expect(r.output).toContain("hello-gate");
});

test("evaluateGate red: failing tests satisfy the red gate", () => {
	expect(
		evaluateGate(
			{
				passed: false,
				exitCode: 1,
				output: "sample.test.ts assertion failed",
				timedOut: false,
				executedExpectedTests: true,
			},
			"red",
		).ok,
	).toBe(true);
});

test("evaluateGate red: passing tests FAIL the red gate", () => {
	expect(
		evaluateGate(
			{
				passed: true,
				exitCode: 0,
				output: "sample.test.ts passed",
				timedOut: false,
				executedExpectedTests: true,
			},
			"red",
		).ok,
	).toBe(false);
});

test("evaluateGate green: passing tests satisfy the green gate", () => {
	expect(
		evaluateGate(
			{
				passed: true,
				exitCode: 0,
				output: "sample.test.ts passed",
				timedOut: false,
				executedExpectedTests: true,
			},
			"green",
		).ok,
	).toBe(true);
});

test("red gate rejects command-not-found, timeout, missing tests, and zero tests", () => {
	const base = {
		passed: false,
		exitCode: 1,
		output: "sample.test.ts assertion failed",
		timedOut: false,
		executedExpectedTests: true,
	};
	expect(evaluateGate({ ...base, exitCode: 127 }, "red").ok).toBe(false);
	expect(evaluateGate({ ...base, timedOut: true }, "red").ok).toBe(false);
	expect(
		evaluateGate({ ...base, executedExpectedTests: false }, "red").ok,
	).toBe(false);
	expect(evaluateGate({ ...base, output: "0 tests" }, "red").ok).toBe(false);
});

test("green gate rejects a successful command that did not name expected tests", () => {
	expect(
		evaluateGate(
			{
				passed: true,
				exitCode: 0,
				output: "done",
				timedOut: false,
				executedExpectedTests: false,
			},
			"green",
		).ok,
	).toBe(false);
});
