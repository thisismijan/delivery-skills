import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

const MINUTE_MS = 60_000;
const nonEmpty = z.string().min(1);
const pathList = z.array(nonEmpty).min(1);

export const GateCommand = z.object({
	argv: pathList,
	cwd: z.string().optional(),
	expectedTestPaths: pathList,
	timeoutMs: z
		.number()
		.int()
		.positive()
		.max(30 * MINUTE_MS)
		.default(10 * MINUTE_MS),
});
export type GateCommand = z.infer<typeof GateCommand>;
export type GateCommandInput = z.input<typeof GateCommand>;

export const GateEvidenceSchema = z.object({
	commit: nonEmpty,
	argv: pathList,
	cwd: z.string(),
	expectedTestPaths: pathList,
	testHashes: z.record(nonEmpty, nonEmpty),
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

export interface GateEvaluation {
	ok: boolean;
	reason: string;
}

type Gate = "red" | "green";

// Characters a printed test path can contain; anything else ends a token.
const PATH_CHARS = /[A-Za-z0-9._\\/-]+/g;

export function normalizeTestPath(path: string): string {
	const forward = path.replaceAll("\\", "/");
	return forward.startsWith("./") ? forward.slice(2) : forward;
}

function canonicalPaths(paths: readonly string[]): string[] {
	return Array.from(new Set(paths.map(normalizeTestPath))).sort();
}

export function outputHasExactPathToken(
	output: string,
	expected: string,
): boolean {
	const target = normalizeTestPath(expected);
	for (const token of output.match(PATH_CHARS) ?? []) {
		if (normalizeTestPath(token) === target) return true;
	}
	return false;
}

function allNamed(output: string, paths: readonly string[]): boolean {
	return paths.every((path) => outputHasExactPathToken(output, path));
}

async function capture(argv: string[], cwd?: string) {
	const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}

async function headCommit(cwd: string): Promise<string> {
	const git = await capture(["git", "rev-parse", "HEAD"], cwd);
	if (git.exitCode === 0) return git.stdout.trim();
	throw new Error(git.stderr.trim() || "git rev-parse HEAD failed");
}

async function sha256Of(path: string, cwd: string): Promise<string> {
	const absolute = isAbsolute(path) ? path : join(cwd, path);
	const digest = createHash("sha256");
	digest.update(await readFile(absolute));
	return digest.digest("hex");
}

export async function collectGateEvidence(
	command: GateCommand,
	cwd = command.cwd ?? process.cwd(),
): Promise<GateEvidence> {
	const expectedTestPaths = canonicalPaths(command.expectedTestPaths);
	const testHashes: Record<string, string> = {};
	for (const path of expectedTestPaths) {
		testHashes[path] = await sha256Of(path, cwd);
	}
	const commit = await headCommit(cwd);
	return { commit, argv: command.argv, cwd, expectedTestPaths, testHashes };
}

function equalLists(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((item, at) => item === b[at]);
}

function equalHashes(
	a: Record<string, string>,
	b: Record<string, string>,
): boolean {
	const names = Object.keys(a).sort();
	if (!equalLists(names, Object.keys(b).sort())) return false;
	return names.every((name) => a[name] === b[name]);
}

export function verifyGateEvidence(
	recorded: GateEvidence,
	current: GateEvidence,
): { ok: boolean; reason: string } {
	const checks: Array<[boolean, string]> = [
		[recorded.commit === current.commit, "the commit has changed"],
		[equalLists(recorded.argv, current.argv), "the command argv has changed"],
		[recorded.cwd === current.cwd, "the working directory has changed"],
		[
			equalLists(
				canonicalPaths(recorded.expectedTestPaths),
				canonicalPaths(current.expectedTestPaths),
			),
			"the set of expected test paths has changed",
		],
		[
			equalHashes(recorded.testHashes, current.testHashes),
			"an expected test file's contents have changed",
		],
	];
	const broken = checks.find(([holds]) => !holds);
	return broken
		? { ok: false, reason: `gate evidence is stale: ${broken[1]}` }
		: { ok: true, reason: "gate evidence still matches the current state" };
}

export async function runTestGate(
	command: GateCommandInput,
): Promise<TestGateResult> {
	const spec = GateCommand.parse(command);
	const evidence = await collectGateEvidence(spec, spec.cwd ?? process.cwd());
	const child = Bun.spawn(spec.argv, {
		cwd: spec.cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, spec.timeoutMs);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
	const output = `${stdout}${stderr}`;
	return {
		passed: !timedOut && exitCode === 0,
		exitCode,
		output,
		timedOut,
		executedExpectedTests: allNamed(output, spec.expectedTestPaths),
		expectedTestPaths: evidence.expectedTestPaths,
		evidence,
	};
}

function refuse(gate: Gate, detail: string): GateEvaluation {
	return { ok: false, reason: `${gate.toUpperCase()} GATE FAILED: ${detail}` };
}

// A run that reports zero tests, or prints nothing that looks like a test
// outcome, cannot show that an expected assertion failed.
function showsAFailedAssertion(output: string): boolean {
	const reportsNothingRan = /\b0\s+(?:tests?|fail(?:ed|ures?)?)\b/i;
	const mentionsAnOutcome = /fail|assert|error|test/i;
	return !reportsNothingRan.test(output) && mentionsAnOutcome.test(output);
}

// red: the new tests have to fail before any implementation exists.
// green: the whole suite has to pass.
export function evaluateGate(
	result: TestGateResult,
	expect: Gate,
): GateEvaluation {
	const paths = Array.isArray(result.expectedTestPaths)
		? result.expectedTestPaths
		: result.evidence?.expectedTestPaths;
	if (paths?.length === 0) {
		return refuse(expect, "no expected tests were given");
	}
	const named = paths
		? allNamed(result.output, paths)
		: result.executedExpectedTests;
	if (result.timedOut) {
		return refuse(expect, "the test command ran past its timeout");
	}
	if (expect === "green") {
		if (!named) {
			return refuse(expect, "the output left out an expected test file");
		}
		if (!result.passed) {
			return refuse(expect, `the suite failed (exit ${result.exitCode})`);
		}
		return { ok: true, reason: "green gate satisfied: the suite passed" };
	}
	if (result.exitCode !== 1) {
		return refuse(
			expect,
			`a test failure exits with 1, but the command exited with ${result.exitCode}`,
		);
	}
	if (!named) {
		return refuse(expect, "the output left out an expected new test file");
	}
	if (!showsAFailedAssertion(result.output)) {
		return refuse(
			expect,
			"nothing in the output shows an expected assertion failing",
		);
	}
	return { ok: true, reason: "red gate satisfied: the new tests failed" };
}

function recordedEvidence(saved: unknown): GateEvidence {
	const wrapped =
		typeof saved === "object" && saved !== null && "evidence" in saved;
	return GateEvidenceSchema.parse(
		wrapped ? (saved as { evidence: unknown }).evidence : saved,
	);
}

async function readCommand(path: string): Promise<GateCommand> {
	return GateCommand.parse(await Bun.file(path).json());
}

async function verifyCommand(recordedFile: string, commandFile: string) {
	const recorded = recordedEvidence(await Bun.file(recordedFile).json());
	const current = await collectGateEvidence(await readCommand(commandFile));
	const verdict = verifyGateEvidence(recorded, current);
	console.log(JSON.stringify(verdict));
	return verdict.ok;
}

const FAILURE_LINE =
	/\b(fail(ed|ing|ure)?|error|exception|expected|received|assert(ion)?|panic|timed? ?out)\b|✗|×/i;
const EXCERPT_FAILURE_LINES = 40;
const EXCERPT_TAIL_LINES = 20;
const EXCERPT_PASSING_TAIL_LINES = 5;
const EXCERPT_LINE_CHARS = 300;

// The few lines of a test run a reader needs: on failure, the lines that name a failure plus the
// end of the run; on success, only the end. The full output stays in the report file.
export function outputExcerpt(output: string, ok: boolean): string[] {
	const lines = output.replace(/\r\n/g, "\n").split("\n");
	while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
	const tailCount = ok ? EXCERPT_PASSING_TAIL_LINES : EXCERPT_TAIL_LINES;
	const tailStart = Math.max(0, lines.length - tailCount);
	const picked = new Set<number>();
	if (!ok) {
		for (const [index, line] of lines.entries()) {
			if (index >= tailStart) break;
			if (picked.size >= EXCERPT_FAILURE_LINES) break;
			if (FAILURE_LINE.test(line)) picked.add(index);
		}
	}
	for (let index = tailStart; index < lines.length; index += 1)
		picked.add(index);
	const excerpt: string[] = [];
	let previous = -1;
	for (const index of [...picked].sort((left, right) => left - right)) {
		if (previous >= 0 && index > previous + 1) excerpt.push("…");
		const line = lines[index] ?? "";
		excerpt.push(
			line.length > EXCERPT_LINE_CHARS
				? `${line.slice(0, EXCERPT_LINE_CHARS)}…`
				: line,
		);
		previous = index;
	}
	return excerpt;
}

export function gateSummary(
	report: TestGateResult & { evaluation: GateEvaluation },
	reportPath: string,
) {
	return {
		reportPath,
		evaluation: report.evaluation,
		exitCode: report.exitCode,
		timedOut: report.timedOut,
		executedExpectedTests: report.executedExpectedTests,
		outputChars: report.output.length,
		outputExcerpt: outputExcerpt(report.output, report.evaluation.ok),
	};
}

async function gateCommand(commandFile: string, gate: Gate, outPath?: string) {
	const result = await runTestGate(await readCommand(commandFile));
	const evaluation = evaluateGate(result, gate);
	const report = { ...result, evaluation };
	if (outPath) {
		const temporary = `${outPath}.${process.pid}.tmp`;
		await writeFile(temporary, `${JSON.stringify(report)}\n`);
		await rename(temporary, outPath);
		console.log(JSON.stringify(gateSummary(report, outPath), null, 2));
	} else {
		console.log(JSON.stringify(report));
	}
	return evaluation.ok;
}

const VERIFY_USAGE = "test-gate verify <recorded.json> <command.json>";
const RUN_USAGE = "test-gate <command.json> <red|green> [--out <report.json>]";

if (import.meta.main) {
	const [first, second, third, fourth] = process.argv.slice(2);
	let job: () => Promise<boolean>;
	if (first === "verify") {
		if (!second || !third) {
			console.error(`usage: ${VERIFY_USAGE}`);
			process.exit(2);
		}
		job = () => verifyCommand(second, third);
	} else {
		const outPath = third === "--out" ? fourth : undefined;
		if (
			!first ||
			(second !== "red" && second !== "green") ||
			(third !== undefined && !outPath)
		) {
			console.error(`usage: ${RUN_USAGE}\n       ${VERIFY_USAGE}`);
			process.exit(2);
		}
		job = () => gateCommand(first, second, outPath);
	}
	try {
		process.exit((await job()) ? 0 : 1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
