import { z } from "zod";

export const GateCommand = z.object({
	argv: z.array(z.string().min(1)).min(1),
	cwd: z.string().optional(),
	expectedTestPaths: z.array(z.string().min(1)).default([]),
	timeoutMs: z
		.number()
		.int()
		.positive()
		.max(30 * 60_000)
		.default(10 * 60_000),
});
export type GateCommand = z.infer<typeof GateCommand>;
export type GateCommandInput = z.input<typeof GateCommand>;

export interface TestGateResult {
	passed: boolean;
	exitCode: number;
	output: string;
	timedOut: boolean;
	executedExpectedTests: boolean;
}

export async function runTestGate(
	command: GateCommandInput,
): Promise<TestGateResult> {
	const spec = GateCommand.parse(command);
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
	const executedExpectedTests = spec.expectedTestPaths.every((path) => {
		const basename = path.split(/[\\/]/).pop() ?? path;
		return output.includes(path) || output.includes(basename);
	});
	return {
		passed: exitCode === 0 && !timedOut,
		exitCode,
		output,
		timedOut,
		executedExpectedTests,
	};
}

export interface GateEvaluation {
	ok: boolean;
	reason: string;
}

// Red gate: the new tests MUST fail before implementation exists.
// Green gate: the suite MUST pass.
export function evaluateGate(
	result: TestGateResult,
	expect: "red" | "green",
): GateEvaluation {
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
		if (!result.executedExpectedTests) {
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
	if (!result.executedExpectedTests) {
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

if (import.meta.main) {
	const commandFile = process.argv[2];
	const expectArg = process.argv[3] as "red" | "green" | undefined;
	if (!commandFile || !expectArg || !["red", "green"].includes(expectArg)) {
		console.error("usage: test-gate <command.json> <red|green>");
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
