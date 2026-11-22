import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type GateEvidence,
	type TestGateResult,
	evaluateGate,
	gateSummary,
	outputExcerpt,
	runTestGate,
	verifyGateEvidence,
} from "./test-gate";

const SAMPLE = "sample.test.ts";

function result(changes: Partial<TestGateResult> = {}): TestGateResult {
	return {
		passed: false,
		exitCode: 1,
		output: `${SAMPLE} assertion failed`,
		timedOut: false,
		executedExpectedTests: true,
		...changes,
	};
}

const passing: Partial<TestGateResult> = {
	passed: true,
	exitCode: 0,
	output: `${SAMPLE} passed`,
};

function recorded(changes: Partial<GateEvidence> = {}): GateEvidence {
	return {
		commit: "a".repeat(40),
		argv: ["bun", "test", SAMPLE],
		cwd: "/repo",
		expectedTestPaths: [SAMPLE],
		testHashes: { [SAMPLE]: "hash-sample" },
		...changes,
	};
}

const printAndExit = (text: string, code: number) => [
	"bun",
	"-e",
	`console.log(${JSON.stringify(text)}); process.exit(${code})`,
];

describe("runTestGate", () => {
	test("a command that exits 0 and names the test passes", async () => {
		const run = await runTestGate({
			argv: printAndExit(import.meta.path, 0),
			expectedTestPaths: [import.meta.path],
		});
		expect(run.passed).toBe(true);
		expect(run.exitCode).toBe(0);
		expect(run.executedExpectedTests).toBe(true);
	});

	test("a non-zero exit is reported and does not pass", async () => {
		const run = await runTestGate({
			argv: ["bun", "-e", "process.exit(3)"],
			expectedTestPaths: [import.meta.path],
		});
		expect(run.passed).toBe(false);
		expect(run.exitCode).toBe(3);
	});

	test("the command's output is returned", async () => {
		const run = await runTestGate({
			argv: ["bun", "-e", "console.log('hello-gate')"],
			expectedTestPaths: [import.meta.path],
		});
		expect(run.output).toContain("hello-gate");
	});

	test("evidence holds the commit, argv, normalized paths and file hashes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "test-gate-ev-"));
		const file = join(dir, SAMPLE);
		const body = "test('sample', () => { throw new Error('red'); });\n";
		await writeFile(file, body);
		const argv = printAndExit(file, 0);
		try {
			const { evidence } = await runTestGate({
				argv,
				expectedTestPaths: [file],
			});
			const key = file.replaceAll("\\", "/");
			expect(evidence).toBeDefined();
			expect(evidence?.commit).toMatch(/^[0-9a-f]{40}$/);
			expect(evidence?.argv).toEqual(argv);
			expect(evidence?.expectedTestPaths).toEqual([key]);
			expect(evidence?.testHashes[key]).toBe(
				createHash("sha256").update(body).digest("hex"),
			);
		} finally {
			await rm(dir, { recursive: true });
		}
	});
});

describe("the red gate", () => {
	test("is satisfied by the expected test failing", () => {
		expect(evaluateGate(result(), "red").ok).toBe(true);
	});

	test("is not satisfied when the tests pass", () => {
		expect(evaluateGate(result(passing), "red").ok).toBe(false);
	});

	test.each<[string, Partial<TestGateResult>]>([
		["a missing command (exit 127)", { exitCode: 127 }],
		["a timeout", { timedOut: true }],
		["the expected test not running", { executedExpectedTests: false }],
		["a run of zero tests", { output: "0 tests" }],
	])("is not satisfied by %s", (_label, changes) => {
		expect(evaluateGate(result(changes), "red").ok).toBe(false);
	});

	test("an empty expected path list is refused", () => {
		const verdict = evaluateGate(result({ expectedTestPaths: [] }), "red");
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/no expected tests were given/i);
	});

	test.each([`other/${SAMPLE}`, `${SAMPLE}.bak`])(
		"output naming only %s does not prove the expected test ran",
		(printed) => {
			const run = result({
				output: `${printed} assertion failed`,
				expectedTestPaths: [SAMPLE],
			});
			expect(evaluateGate(run, "red").ok).toBe(false);
		},
	);

	test("output naming the exact path proves it ran", () => {
		const run = result({ expectedTestPaths: [SAMPLE] });
		expect(evaluateGate(run, "red").ok).toBe(true);
	});

	test.each(["./foo/bar.test.ts", "foo\\bar.test.ts"])(
		"the printed path %s matches foo/bar.test.ts after normalizing",
		(printed) => {
			const run = result({
				output: `${printed} assertion failed`,
				executedExpectedTests: false,
				expectedTestPaths: ["foo/bar.test.ts"],
			});
			expect(evaluateGate(run, "red").ok).toBe(true);
		},
	);
});

describe("the green gate", () => {
	test("is satisfied by a passing suite", () => {
		expect(evaluateGate(result(passing), "green").ok).toBe(true);
	});

	test("is not satisfied when the output never named the expected tests", () => {
		const run = result({
			...passing,
			output: "done",
			executedExpectedTests: false,
		});
		expect(evaluateGate(run, "green").ok).toBe(false);
	});

	test("an empty expected path list is refused", () => {
		const run = result({
			passed: true,
			exitCode: 0,
			output: "ok",
			expectedTestPaths: [],
		});
		const verdict = evaluateGate(run, "green");
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/no expected tests were given/i);
	});
});

describe("verifyGateEvidence", () => {
	test("accepts evidence identical to the current state", () => {
		expect(verifyGateEvidence(recorded(), recorded()).ok).toBe(true);
	});

	test.each<[string, Partial<GateEvidence>]>([
		["commit", { commit: "b".repeat(40) }],
		["argv", { argv: ["bun", "test"] }],
		["cwd", { cwd: "/other" }],
		[
			"expected path set",
			{
				expectedTestPaths: ["other.test.ts"],
				testHashes: { "other.test.ts": "hash-sample" },
			},
		],
		["test hash", { testHashes: { [SAMPLE]: "hash-changed" } }],
	])("rejects a changed %s", (_label, changes) => {
		expect(verifyGateEvidence(recorded(), recorded(changes)).ok).toBe(false);
	});
});

describe("the gate summary", () => {
	const noisy = [
		...Array.from({ length: 300 }, (_, index) => `ok ${index} passes quietly`),
		"(fail) fees > rounds half up",
		"Expected: 3",
		"Received: 2",
		...Array.from(
			{ length: 300 },
			(_, index) => `ok ${index + 300} passes quietly`,
		),
		" 599 pass",
		" 1 fail",
	].join("\n");

	test("a failing run keeps the failure lines and the end of the run, marking the gaps", () => {
		const excerpt = outputExcerpt(noisy, false);
		expect(excerpt).toContain("(fail) fees > rounds half up");
		expect(excerpt).toContain("Expected: 3");
		expect(excerpt).toContain("Received: 2");
		expect(excerpt.slice(-2)).toEqual([" 599 pass", " 1 fail"]);
		expect(excerpt).toContain("…");
		expect(excerpt.length).toBeLessThan(30);
	});

	test("a passing run keeps only its last lines, and long lines are cut", () => {
		expect(outputExcerpt(noisy, true)).toEqual([
			"ok 597 passes quietly",
			"ok 598 passes quietly",
			"ok 599 passes quietly",
			" 599 pass",
			" 1 fail",
		]);
		const [line] = outputExcerpt("x".repeat(1000), true);
		expect(line).toHaveLength(301);
	});

	test("the summary names the report file and keeps the verdict", () => {
		const report = {
			...result({ output: noisy }),
			evaluation: { ok: true, reason: "RED GATE PASSED" },
		};
		expect(gateSummary(report, "/r/red-gate-abc.json")).toMatchObject({
			reportPath: "/r/red-gate-abc.json",
			evaluation: { ok: true },
			exitCode: 1,
			outputChars: noisy.length,
		});
	});
});

test("with --out the full report goes to the file and only the summary is printed", async () => {
	const root = await mkdtemp(join(tmpdir(), "test-gate-out-"));
	try {
		const body = "test('sample', () => { throw new Error('red'); });\n";
		await writeFile(join(root, SAMPLE), body);
		for (const argv of [
			["git", "init", "-q"],
			["git", "add", SAMPLE],
			[
				"git",
				"-c",
				"user.name=Gate Test",
				"-c",
				"user.email=gate@example.test",
				"commit",
				"-q",
				"-m",
				"red test",
			],
		]) {
			expect(
				Bun.spawnSync(argv, { cwd: root, env: { ...process.env } }).exitCode,
			).toBe(0);
		}
		const command = join(root, "red-command.json");
		await writeFile(
			command,
			JSON.stringify({
				argv: printAndExit(`${join(root, SAMPLE)} (fail) assertion failed`, 1),
				cwd: root,
				expectedTestPaths: [join(root, SAMPLE)],
			}),
		);
		const out = join(root, "red-gate-abc.json");
		const child = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "test-gate.ts"),
				command,
				"red",
				"--out",
				out,
			],
			{ stdout: "pipe", stderr: "pipe", env: { ...process.env } },
		);
		const [stdout, code] = await Promise.all([
			new Response(child.stdout).text(),
			child.exited,
		]);
		expect(code).toBe(0);
		const summary = JSON.parse(stdout);
		expect(summary).toMatchObject({
			reportPath: out,
			evaluation: { ok: true },
		});
		expect(summary).not.toHaveProperty("output");
		const saved = JSON.parse(await Bun.file(out).text());
		expect(saved.evaluation.ok).toBe(true);
		expect(saved.output).toContain("assertion failed");
		expect(saved).toHaveProperty("evidence");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
