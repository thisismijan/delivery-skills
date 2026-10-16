import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateGate, runTestGate, type TestGateResult } from "./test-gate";

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function gateResult(
	overrides: Record<string, unknown> = {},
): TestGateResult {
	return {
		passed: false,
		exitCode: 1,
		output: "sample.test.ts assertion failed",
		timedOut: false,
		executedExpectedTests: true,
		...overrides,
	} as TestGateResult;
}

function evidence(overrides: Record<string, unknown> = {}) {
	return {
		commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		argv: ["bun", "test", "sample.test.ts"],
		cwd: "/repo",
		expectedTestPaths: ["sample.test.ts"],
		testHashes: { "sample.test.ts": "hash-sample" },
		...overrides,
	};
}

async function loadVerifyGateEvidence() {
	const mod = await import("./test-gate");
	expect("verifyGateEvidence" in mod).toBe(true);
	return (
		mod as {
			verifyGateEvidence: (
				recorded: ReturnType<typeof evidence>,
				current: ReturnType<typeof evidence>,
			) => { ok: boolean; reason: string };
		}
	).verifyGateEvidence;
}

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

test("evaluateGate red: empty expected paths fail closed", () => {
	const evaluation = evaluateGate(
		gateResult({ expectedTestPaths: [] }),
		"red",
	);
	expect(evaluation.ok).toBe(false);
	expect(evaluation.reason).toMatch(/no expected tests were given/i);
});

test("evaluateGate green: empty expected paths fail closed", () => {
	const evaluation = evaluateGate(
		gateResult({
			passed: true,
			exitCode: 0,
			output: "ok",
			expectedTestPaths: [],
		}),
		"green",
	);
	expect(evaluation.ok).toBe(false);
	expect(evaluation.reason).toMatch(/no expected tests were given/i);
});

test("evaluateGate: a similar basename does not prove the expected test ran", () => {
	expect(
		evaluateGate(
			gateResult({
				output: "other/sample.test.ts assertion failed",
				expectedTestPaths: ["sample.test.ts"],
			}),
			"red",
		).ok,
	).toBe(false);
	expect(
		evaluateGate(
			gateResult({
				output: "sample.test.ts.bak assertion failed",
				expectedTestPaths: ["sample.test.ts"],
			}),
			"red",
		).ok,
	).toBe(false);
});

test("evaluateGate: the exact path proves the expected test ran", () => {
	expect(
		evaluateGate(
			gateResult({
				output: "sample.test.ts assertion failed",
				expectedTestPaths: ["sample.test.ts"],
			}),
			"red",
		).ok,
	).toBe(true);
});

test("evaluateGate: path tokens normalize separators and a leading ./", () => {
	expect(
		evaluateGate(
			gateResult({
				output: "./foo/bar.test.ts assertion failed",
				executedExpectedTests: false,
				expectedTestPaths: ["foo/bar.test.ts"],
			}),
			"red",
		).ok,
	).toBe(true);
	expect(
		evaluateGate(
			gateResult({
				output: "foo\\bar.test.ts assertion failed",
				executedExpectedTests: false,
				expectedTestPaths: ["foo/bar.test.ts"],
			}),
			"red",
		).ok,
	).toBe(true);
});

test("verifyGateEvidence accepts matching evidence", async () => {
	const verifyGateEvidence = await loadVerifyGateEvidence();
	const recorded = evidence();
	expect(verifyGateEvidence(recorded, recorded).ok).toBe(true);
});

test("verifyGateEvidence rejects a commit change", async () => {
	const verifyGateEvidence = await loadVerifyGateEvidence();
	const recorded = evidence();
	expect(
		verifyGateEvidence(recorded, evidence({ commit: "b".repeat(40) })).ok,
	).toBe(false);
});

test("verifyGateEvidence rejects an argv change", async () => {
	const verifyGateEvidence = await loadVerifyGateEvidence();
	const recorded = evidence();
	expect(
		verifyGateEvidence(recorded, evidence({ argv: ["bun", "test"] })).ok,
	).toBe(false);
});

test("verifyGateEvidence rejects a cwd change", async () => {
	const verifyGateEvidence = await loadVerifyGateEvidence();
	const recorded = evidence();
	expect(
		verifyGateEvidence(recorded, evidence({ cwd: "/other" })).ok,
	).toBe(false);
});

test("verifyGateEvidence rejects an expected path set change", async () => {
	const verifyGateEvidence = await loadVerifyGateEvidence();
	const recorded = evidence();
	expect(
		verifyGateEvidence(
			recorded,
			evidence({
				expectedTestPaths: ["other.test.ts"],
				testHashes: { "other.test.ts": "hash-sample" },
			}),
		).ok,
	).toBe(false);
});

test("verifyGateEvidence rejects a test hash change", async () => {
	const verifyGateEvidence = await loadVerifyGateEvidence();
	const recorded = evidence();
	expect(
		verifyGateEvidence(
			recorded,
			evidence({ testHashes: { "sample.test.ts": "hash-changed" } }),
		).ok,
	).toBe(false);
});

test("runTestGate records evidence with content hashes", async () => {
	const dir = await mkdtemp(join(tmpdir(), "test-gate-ev-"));
	const testFile = join(dir, "sample.test.ts");
	const contents = "test('sample', () => { throw new Error('red'); });\n";
	await writeFile(testFile, contents);
	const argv = [
		"bun",
		"-e",
		`console.log(${JSON.stringify(testFile)}); process.exit(0)`,
	];
	try {
		const result = (await runTestGate({
			argv,
			expectedTestPaths: [testFile],
		})) as TestGateResult & {
			evidence?: {
				commit: string;
				argv: string[];
				cwd: string;
				expectedTestPaths: string[];
				testHashes: Record<string, string>;
			};
		};
		const normalized = testFile.replaceAll("\\", "/");
		expect(result.evidence).toBeDefined();
		expect(result.evidence?.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(result.evidence?.argv).toEqual(argv);
		expect(result.evidence?.expectedTestPaths).toEqual([normalized]);
		expect(result.evidence?.testHashes[normalized]).toBe(sha256(contents));
	} finally {
		await rm(dir, { recursive: true });
	}
});
