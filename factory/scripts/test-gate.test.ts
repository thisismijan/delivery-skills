import { expect, test } from "bun:test";
import { evaluateGate, runTestGate } from "./test-gate";

test("runTestGate: success command -> passed true, exit 0", async () => {
	const r = await runTestGate("exit 0");
	expect(r.passed).toBe(true);
	expect(r.exitCode).toBe(0);
});

test("runTestGate: failing command -> passed false, non-zero exit", async () => {
	const r = await runTestGate("exit 3");
	expect(r.passed).toBe(false);
	expect(r.exitCode).toBe(3);
});

test("runTestGate: captures output", async () => {
	const r = await runTestGate("echo hello-gate");
	expect(r.output).toContain("hello-gate");
});

test("evaluateGate red: failing tests satisfy the red gate", () => {
	expect(
		evaluateGate({ passed: false, exitCode: 1, output: "" }, "red").ok,
	).toBe(true);
});

test("evaluateGate red: passing tests FAIL the red gate", () => {
	expect(
		evaluateGate({ passed: true, exitCode: 0, output: "" }, "red").ok,
	).toBe(false);
});

test("evaluateGate green: passing tests satisfy the green gate", () => {
	expect(
		evaluateGate({ passed: true, exitCode: 0, output: "" }, "green").ok,
	).toBe(true);
});
