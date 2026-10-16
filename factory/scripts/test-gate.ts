import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

export const GateCommand = z.object({
	argv: z.array(z.string().min(1)).min(1),
	cwd: z.string().optional(),
	expectedTestPaths: z.array(z.string().min(1)).min(1),
	timeoutMs: z
		.number()
		.int()
		.positive()
		.max(30 * 60_000)
		.default(10 * 60_000),
});
export type GateCommand = z.infer<typeof GateCommand>;
export type GateCommandInput = z.input<typeof GateCommand>;

export const GateEvidenceSchema = z.object({
	commit: z.string().min(1),
	argv: z.array(z.string().min(1)).min(1),
	cwd: z.string(),
	expectedTestPaths: z.array(z.string().min(1)).min(1),
	testHashes: z.record(z.string().min(1), z.string().min(1)),
});
export type GateEvidence = z.infer<typeof GateEvidenceSchema>;

export interface TestGateResult {
	passed: boolean;
	exitCode: number;
	output: string;
	timedOut: boolean;
	executedExpectedTests: boolean;
	expectedTestPaths?: string[];
	evidence?: GateEvidence;
}

export function normalizeTestPath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizePathList(paths: readonly string[]): string[] {
	return [...new Set(paths.map(normalizeTestPath))].sort();
}

const PATH_TOKEN = /[A-Za-z0-9._\\/-]+/g;

export function outputHasExactPathToken(
	output: string,
	expected: string,
): boolean {
	const want = normalizeTestPath(expected);
	const tokens = output.match(PATH_TOKEN) ?? [];
	return tokens.some((token) => normalizeTestPath(token) === want);
}

function expectedPathsOf(result: TestGateResult): string[] | undefined {
	if (Array.isArray(result.expectedTestPaths)) {
		return result.expectedTestPaths;
	}
	if (result.evidence) {
		return result.evidence.expectedTestPaths;
	}
	return undefined;
}

async function readHeadCommit(cwd: string): Promise<string> {
	const proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(err.trim() || "git rev-parse HEAD failed");
	}
	return out.trim();
}

async function hashTestFile(path: string, cwd: string): Promise<string> {
	const resolved = isAbsolute(path) ? path : join(cwd, path);
	const bytes = await readFile(resolved);
	return createHash("sha256").update(bytes).digest("hex");
}

export async function collectGateEvidence(
	command: GateCommand,
	cwd = command.cwd ?? process.cwd(),
): Promise<GateEvidence> {
	const expectedTestPaths = normalizePathList(command.expectedTestPaths);
	const testHashes: Record<string, string> = {};
	for (const path of expectedTestPaths) {
		testHashes[path] = await hashTestFile(path, cwd);
	}
	return {
		commit: await readHeadCommit(cwd),
		argv: command.argv,
		cwd,
		expectedTestPaths,
		testHashes,
	};
}

function sameStringList(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function sameHashes(
	left: Record<string, string>,
	right: Record<string, string>,
): boolean {
	const leftKeys = Object.keys(left).sort();
	const rightKeys = Object.keys(right).sort();
	if (!sameStringList(leftKeys, rightKeys)) return false;
	return leftKeys.every((key) => left[key] === right[key]);
}

export function verifyGateEvidence(
	recorded: GateEvidence,
	current: GateEvidence,
): { ok: boolean; reason: string } {
	if (recorded.commit !== current.commit) {
		return { ok: false, reason: "gate evidence commit does not match" };
	}
	if (!sameStringList(recorded.argv, current.argv)) {
		return { ok: false, reason: "gate evidence argv does not match" };
	}
	if (recorded.cwd !== current.cwd) {
		return { ok: false, reason: "gate evidence cwd does not match" };
	}
	if (
		!sameStringList(
			normalizePathList(recorded.expectedTestPaths),
			normalizePathList(current.expectedTestPaths),
		)
	) {
		return {
			ok: false,
			reason: "gate evidence expected test paths do not match",
		};
	}
	if (!sameHashes(recorded.testHashes, current.testHashes)) {
		return { ok: false, reason: "gate evidence test hashes do not match" };
	}
	return { ok: true, reason: "gate evidence matches" };
}

export async function runTestGate(
	command: GateCommandInput,
): Promise<TestGateResult> {
	const spec = GateCommand.parse(command);
	const cwd = spec.cwd ?? process.cwd();
	const evidence = await collectGateEvidence(spec, cwd);
	const proc = Bun.spawn(spec.argv, {
		cwd: spec.cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		proc.kill();
	}, spec.timeoutMs);
	const [out, err, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	clearTimeout(timeout);
	const output = out + err;
	const executedExpectedTests = spec.expectedTestPaths.every((path) =>
		outputHasExactPathToken(output, path),
	);
	return {
		passed: exitCode === 0 && !timedOut,
		exitCode,
		output,
		timedOut,
		executedExpectedTests,
		expectedTestPaths: evidence.expectedTestPaths,
		evidence,
	};
}

export interface GateEvaluation {
	ok: boolean;
	reason: string;
}

function gateFailed(expect: "red" | "green", detail: string): GateEvaluation {
	return {
		ok: false,
		reason: `${expect === "red" ? "RED" : "GREEN"} GATE FAILED: ${detail}`,
	};
}

// Red gate: the new tests MUST fail before implementation exists.
// Green gate: the suite MUST pass.
export function evaluateGate(
	result: TestGateResult,
	expect: "red" | "green",
): GateEvaluation {
	const paths = expectedPathsOf(result);
	if (paths && paths.length === 0) {
		return gateFailed(expect, "no expected tests were given");
	}
	const executedExpectedTests = paths
		? paths.every((path) => outputHasExactPathToken(result.output, path))
		: result.executedExpectedTests;

	if (expect === "red") {
		if (result.timedOut) {
			return { ok: false, reason: "RED GATE FAILED: test command timed out" };
		}
		if (result.exitCode !== 1) {
			return {
				ok: false,
				reason: `RED GATE FAILED: expected a test failure exit code of 1, got ${result.exitCode}`,
			};
		}
		if (!executedExpectedTests) {
			return {
				ok: false,
				reason:
					"RED GATE FAILED: output did not name every expected new test file",
			};
		}
		if (
			/\b0\s+(?:tests?|fail(?:ed|ures?)?)\b/i.test(result.output) ||
			!/fail|assert|error|test/i.test(result.output)
		) {
			return {
				ok: false,
				reason:
					"RED GATE FAILED: output does not prove that an expected test assertion failed",
			};
		}
		return {
			ok: true,
			reason: "red gate satisfied: expected new tests failed",
		};
	}
	if (result.timedOut) {
		return { ok: false, reason: "GREEN GATE FAILED: test command timed out" };
	}
	if (!executedExpectedTests) {
		return {
			ok: false,
			reason: "GREEN GATE FAILED: output did not name every expected test file",
		};
	}
	return result.passed
		? { ok: true, reason: "green gate satisfied: all tests pass" }
		: {
				ok: false,
				reason: `GREEN GATE FAILED: tests failing (exit ${result.exitCode})`,
			};
}

function evidenceFromUnknown(raw: unknown): GateEvidence {
	if (raw && typeof raw === "object" && "evidence" in raw) {
		return GateEvidenceSchema.parse((raw as { evidence: unknown }).evidence);
	}
	return GateEvidenceSchema.parse(raw);
}

if (import.meta.main) {
	if (process.argv[2] === "verify") {
		const recordedFile = process.argv[3];
		const commandFile = process.argv[4];
		if (!recordedFile || !commandFile) {
			console.error("usage: test-gate verify <recorded.json> <command.json>");
			process.exit(2);
		}
		try {
			const recorded = evidenceFromUnknown(await Bun.file(recordedFile).json());
			const command = GateCommand.parse(await Bun.file(commandFile).json());
			const current = await collectGateEvidence(command);
			const verification = verifyGateEvidence(recorded, current);
			console.log(JSON.stringify(verification));
			process.exit(verification.ok ? 0 : 1);
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e));
			process.exit(1);
		}
	}
	const commandFile = process.argv[2];
	const expectArg = process.argv[3] as "red" | "green" | undefined;
	if (!commandFile || !expectArg || !["red", "green"].includes(expectArg)) {
		console.error(
			"usage: test-gate <command.json> <red|green>\n       test-gate verify <recorded.json> <command.json>",
		);
		process.exit(2);
	}
	try {
		const command = GateCommand.parse(await Bun.file(commandFile).json());
		const result = await runTestGate(command);
		const evaluation = evaluateGate(result, expectArg);
		console.log(JSON.stringify({ ...result, evaluation }));
		process.exit(evaluation.ok ? 0 : 1);
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
