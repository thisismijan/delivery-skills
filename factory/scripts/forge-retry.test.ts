import { expect, test } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	normalizeForgeSessionResult,
	planForgeOperation,
	runForgeOperation,
} from "./forge-provider";
import {
	defaultRuntimeManifest,
	parseRuntimeManifest,
} from "./runtime-manifest";
import {
	HumanOwnedAction,
	freezeAgainstLiveConstitution,
} from "./sdlc-constitution";

const HEAD = "a".repeat(40);
const CONTRACT = ".delivery/runs/WORK-1.run-contract.json";

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "forge-retry-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function draft(ciRetry?: { infrastructure: 0 | 1 }) {
	return {
		version: 1,
		runId: "WORK-1",
		planVersion: 1,
		goal: "Ship the panel",
		scope: ["Add the panel"],
		nonGoals: [],
		tickets: [
			{
				key: "WORK-1",
				title: "Add the panel",
				acceptance: ["Given costs, when the page loads, then spend shows"],
				blockedBy: [],
			},
		],
		permittedWrites: ["ledger", "worker-journals"],
		humanOwned: [...HumanOwnedAction.options],
		approval: {
			who: "operator",
			words: "ship it",
			at: "2026-10-29T00:00:00.000Z",
		},
		...(ciRetry ? { ciRetry } : {}),
	};
}

function failedJob(attempt: number) {
	return {
		id: "71",
		name: "workspace-build",
		failureReason: "runner_system_failure",
		attempt,
	};
}

async function setup(
	root: string,
	options: {
		ciRetry?: { infrastructure: 0 | 1 };
		attempt?: number;
		kind?: "merge-train" | "merge-request";
		receipt?: Record<string, unknown>;
	} = {},
) {
	await mkdir(join(root, ".delivery", "runs"), { recursive: true });
	await writeFile(
		join(root, CONTRACT),
		JSON.stringify(freezeAgainstLiveConstitution(draft(options.ciRetry))),
	);
	const responses = {
		failures: {
			version: 1,
			provider: "sample-forge",
			ref: "12",
			headRevision: HEAD,
			pipeline: {
				available: true,
				id: "500",
				status: "failed",
				kind: options.kind ?? "merge-request",
				attempt: 1,
				failedJobs: [failedJob(options.attempt ?? 1)],
			},
		},
		retry: options.receipt ?? {
			version: 1,
			provider: "sample-forge",
			ref: "12",
			operation: "retry",
			url: "https://example.invalid/jobs/72",
			retriedJobIds: ["71"],
		},
	};
	const log = join(root, "adapter.log");
	const executable = join(root, "adapter");
	await writeFile(
		executable,
		`#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";
const operation = process.argv[2];
const stdin = await Bun.stdin.text();
await appendFile(${JSON.stringify(log)}, JSON.stringify({ operation, stdin }) + "\\n");
const responses = ${JSON.stringify(responses)};
process.stdout.write(JSON.stringify(responses[operation]));
`,
	);
	await chmod(executable, 0o755);
	const base = defaultRuntimeManifest(true);
	const runtime = parseRuntimeManifest({
		version: 1,
		capabilities: {
			...base.capabilities,
			"forge.change": {
				available: true,
				mode: "adapter",
				provider: "sample-forge",
				invocation: `exec:${executable}`,
			},
		},
	});
	return { log, runtime };
}

function retryInput(overrides: Record<string, unknown> = {}) {
	return {
		ref: "12",
		headRevision: HEAD,
		ticketKey: "WORK-1",
		runContractPath: CONTRACT,
		approved: true,
		...overrides,
	};
}

async function calls(
	log: string,
): Promise<Array<{ operation: string; input: Record<string, unknown> }>> {
	const text = await readFile(log, "utf8").catch(() => "");
	return text
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const call = JSON.parse(line);
			return { operation: call.operation, input: JSON.parse(call.stdin).input };
		});
}

test("retry reruns a first infrastructure failure the contract allows", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, {
			ciRetry: { infrastructure: 1 },
		});
		const result = await runForgeOperation({
			operation: "retry",
			repositoryRoot: root,
			runtime,
			input: retryInput(),
		});
		expect(result).toEqual({
			version: 1,
			provider: "sample-forge",
			ref: "12",
			operation: "retry",
			decision: "retried",
			reasons: [],
			retriedJobs: ["workspace-build"],
			url: "https://example.invalid/jobs/72",
		});
		expect(await calls(log)).toEqual([
			{ operation: "failures", input: { ref: "12", headRevision: HEAD } },
			{
				operation: "retry",
				input: {
					ref: "12",
					headRevision: HEAD,
					jobIds: ["71"],
					approved: true,
				},
			},
		]);
	});
});

test("retry stops and asks the operator when the failure repeats after its retry", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, {
			ciRetry: { infrastructure: 1 },
			attempt: 2,
		});
		const result = await runForgeOperation({
			operation: "retry",
			repositoryRoot: root,
			runtime,
			input: retryInput(),
		});
		expect(result).toMatchObject({ operation: "retry", decision: "stop" });
		expect(JSON.stringify(result)).toContain("goes to the operator");
		expect((await calls(log)).map(({ operation }) => operation)).toEqual([
			"failures",
		]);
	});
});

test("retry never runs when the run contract sets no retry policy", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root);
		const result = await runForgeOperation({
			operation: "retry",
			repositoryRoot: root,
			runtime,
			input: retryInput(),
		});
		expect(result).toMatchObject({
			decision: "stop",
			reasons: [expect.stringContaining("does not allow CI retries")],
		});
		expect((await calls(log)).map(({ operation }) => operation)).toEqual([
			"failures",
		]);
	});
});

test("retry stops when the ticket is outside the run contract", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, {
			ciRetry: { infrastructure: 1 },
		});
		const result = await runForgeOperation({
			operation: "retry",
			repositoryRoot: root,
			runtime,
			input: retryInput({ ticketKey: "WORK-2" }),
		});
		expect(result).toMatchObject({
			decision: "stop",
			reasons: [expect.stringContaining("outside the frozen run contract")],
		});
		expect((await calls(log)).map(({ operation }) => operation)).not.toContain(
			"retry",
		);
	});
});

test("retry re-adds a failed merge train instead of retrying its jobs", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, {
			ciRetry: { infrastructure: 1 },
			kind: "merge-train",
			receipt: {
				version: 1,
				provider: "sample-forge",
				ref: "12",
				operation: "retry",
				mergeTrain: true,
			},
		});
		const result = await runForgeOperation({
			operation: "retry",
			repositoryRoot: root,
			runtime,
			input: retryInput(),
		});
		expect(result).toMatchObject({ decision: "retried", mergeTrain: true });
		expect((await calls(log))[1]).toEqual({
			operation: "retry",
			input: {
				ref: "12",
				headRevision: HEAD,
				mergeTrain: true,
				approved: true,
			},
		});
	});
});

test("a retry dry run shows the request and asks the adapter for nothing", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, {
			ciRetry: { infrastructure: 1 },
		});
		const result = await runForgeOperation({
			operation: "retry",
			repositoryRoot: root,
			runtime,
			input: retryInput({ approved: undefined, dryRun: true }),
		});
		expect(result).toEqual({
			version: 1,
			provider: "sample-forge",
			operation: "retry",
			dryRun: true,
			input: { ref: "12", headRevision: HEAD, jobIds: ["71"] },
		});
		expect((await calls(log)).map(({ operation }) => operation)).toEqual([
			"failures",
		]);
	});
});

test("retry fails when the adapter retried something other than was asked", async () => {
	await withRoot(async (root) => {
		const { runtime } = await setup(root, {
			ciRetry: { infrastructure: 1 },
			receipt: {
				version: 1,
				provider: "sample-forge",
				ref: "12",
				operation: "retry",
				retriedJobIds: ["99"],
			},
		});
		await expect(
			runForgeOperation({
				operation: "retry",
				repositoryRoot: root,
				runtime,
				input: retryInput(),
			}),
		).rejects.toThrow("does not match what was asked for");
	});
});

test("a live retry needs approval", async () => {
	await withRoot(async (root) => {
		const { runtime } = await setup(root, { ciRetry: { infrastructure: 1 } });
		await expect(
			runForgeOperation({
				operation: "retry",
				repositoryRoot: root,
				runtime,
				input: retryInput({ approved: undefined }),
			}),
		).rejects.toThrow("live forge mutations require approved: true");
	});
});

test("a run contract allows at most one infrastructure retry", () => {
	expect(
		freezeAgainstLiveConstitution(draft({ infrastructure: 1 })).ciRetry,
	).toEqual({ infrastructure: 1 });
	expect(() =>
		freezeAgainstLiveConstitution({
			...draft(),
			ciRetry: { infrastructure: 2 },
		}),
	).toThrow();
	expect(() =>
		freezeAgainstLiveConstitution({
			...draft(),
			ciRetry: { infrastructure: 1, test: 1 },
		}),
	).toThrow();
});

test("session tools never retry CI", async () => {
	await withRoot(async (root) => {
		await expect(
			planForgeOperation({
				operation: "retry",
				repositoryRoot: root,
				runtime: defaultRuntimeManifest(true),
				input: retryInput(),
			}),
		).rejects.toThrow(
			"Retrying CI needs the executable forge adapter; session tools never retry. Leave the retry to a person.",
		);
	});
	expect(() =>
		normalizeForgeSessionResult({
			operation: "retry",
			provider: "sample-forge",
			raw: {},
		}),
	).toThrow("Session tools never retry CI.");
});
