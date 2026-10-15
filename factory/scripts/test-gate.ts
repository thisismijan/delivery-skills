export interface TestGateResult {
	passed: boolean;
	exitCode: number;
	output: string;
}

export async function runTestGate(
	cmd: string,
	cwd?: string,
): Promise<TestGateResult> {
	const proc = Bun.spawn(["sh", "-c", cmd], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { passed: exitCode === 0, exitCode, output: out + err };
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
		return result.passed
			? {
					ok: false,
					reason:
						"RED GATE FAILED: tests passed before implementation (vacuous tests or no-op change)",
				}
			: { ok: true, reason: "red gate satisfied: new tests fail as required" };
	}
	return result.passed
		? { ok: true, reason: "green gate satisfied: all tests pass" }
		: {
				ok: false,
				reason: `GREEN GATE FAILED: tests failing (exit ${result.exitCode})`,
			};
}

if (import.meta.main) {
	const cmd = process.argv[2];
	const expectArg = process.argv[3] as "red" | "green" | undefined;
	if (!cmd) {
		console.error('usage: test-gate "<command>" [red|green]');
		process.exit(2);
	}
	const result = await runTestGate(cmd);
	const evaluation = expectArg ? evaluateGate(result, expectArg) : undefined;
	console.log(JSON.stringify({ ...result, evaluation }));
	process.exit(evaluation ? (evaluation.ok ? 0 : 1) : 0);
}
