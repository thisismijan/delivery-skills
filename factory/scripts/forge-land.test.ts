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
const MERGED = "c".repeat(40);

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "forge-land-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function draft(permittedWrites: string[]) {
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
		permittedWrites,
		humanOwned: [...HumanOwnedAction.options],
		approval: {
			who: "operator",
			words: "ship it",
			at: "2026-10-29T00:00:00.000Z",
		},
	};
}

function pipelineStatus(status: string) {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "12",
		state: "open",
		draft: false,
		branches: { source: "topic", target: "main" },
		revisions: { head: HEAD },
		title: "Add the panel",
		description: "",
		author: "factory",
		url: "https://example.invalid/12",
		pipeline: { available: true, status, revision: HEAD, current: true },
		mergeability: { available: true, conflicts: false, status: "mergeable" },
	};
}

async function setup(
	root: string,
	options: { permittedWrites?: string[]; pipeline?: string } = {},
): Promise<{ log: string; runtime: ReturnType<typeof parseRuntimeManifest> }> {
	const frozen = freezeAgainstLiveConstitution(
		draft(options.permittedWrites ?? ["change-land"]),
	);
	await mkdir(join(root, ".delivery", "runs"), { recursive: true });
	await writeFile(
		join(root, ".delivery", "runs", "WORK-1.run-contract.json"),
		JSON.stringify(frozen),
	);
	await writeFile(
		join(root, ".delivery", "runs", "WORK-1.md"),
		[
			"# Ship the panel",
			"",
			"Ids: WORK-1",
			`Run contract: .delivery/runs/WORK-1.run-contract.json (${frozen.contractHash})`,
			"",
			"## Verdicts",
			"",
			"| Date | MR | Kind | Head | Base | Patch-id | Verdict | By |",
			"|------|----|------|------|------|----------|---------|----|",
			`| 2026-10-29 | !12 | readiness | ${HEAD} | b | p | go | factory |`,
			"",
			"## Approvals",
			"",
			'- 2026-10-29 run — continuous-delivery: yes — operator — "ship it"',
			"",
		].join("\n"),
	);
	const evidence = {
		version: 1,
		provider: "sample-forge",
		ref: "12",
		headRevision: HEAD,
	};
	const responses = {
		read: pipelineStatus(options.pipeline ?? "success"),
		approvals: {
			...evidence,
			approval: { available: true, approvedBy: ["reviewer"], rulesMet: true },
		},
		discussions: {
			...evidence,
			discussions: [
				{
					id: "d1",
					resolved: false,
					notes: [
						{
							id: "n1",
							author: "reviewer",
							body: "looks good",
							system: false,
							resolved: false,
						},
					],
				},
			],
		},
		land: {
			version: 1,
			provider: "sample-forge",
			ref: "12",
			operation: "land",
			url: "https://example.invalid/12",
			mergedRevision: MERGED,
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

function landInput(overrides: Record<string, unknown> = {}) {
	return {
		ref: "12",
		headRevision: HEAD,
		kind: "change",
		ticketKey: "WORK-1",
		ledgerPath: ".delivery/runs/WORK-1.md",
		runContractPath: ".delivery/runs/WORK-1.run-contract.json",
		readNoteIds: ["n1"],
		approved: true,
		...overrides,
	};
}

async function calls(
	log: string,
): Promise<Array<{ operation: string; stdin: string }>> {
	const text = await readFile(log, "utf8").catch(() => "");
	return text
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

test("land merges with the head guard once the gate holds", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root);
		const result = await runForgeOperation({
			operation: "land",
			repositoryRoot: root,
			runtime,
			input: landInput(),
		});
		expect(result).toMatchObject({
			operation: "land",
			decision: "landed",
			mergedRevision: MERGED,
		});
		const made = await calls(log);
		expect(made.map((call) => call.operation)).toEqual([
			"read",
			"approvals",
			"discussions",
			"land",
		]);
		const landed = JSON.parse(made[3]?.stdin ?? "{}");
		expect(landed.input).toEqual({
			ref: "12",
			headRevision: HEAD,
			approved: true,
		});
	});
});

test("land waits on a running pipeline and never merges", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, { pipeline: "running" });
		const result = await runForgeOperation({
			operation: "land",
			repositoryRoot: root,
			runtime,
			input: landInput(),
		});
		expect(result).toMatchObject({ decision: "wait" });
		expect((await calls(log)).map((call) => call.operation)).not.toContain(
			"land",
		);
	});
});

test("land stops when the run contract predates the land stage", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root, { permittedWrites: ["tests"] });
		const result = await runForgeOperation({
			operation: "land",
			repositoryRoot: root,
			runtime,
			input: landInput(),
		});
		expect(result).toMatchObject({ decision: "stop" });
		expect(JSON.stringify(result)).toMatch(/change-land/);
		expect((await calls(log)).map((call) => call.operation)).not.toContain(
			"land",
		);
	});
});

test("land stops when the ledger is missing", async () => {
	await withRoot(async (root) => {
		const { runtime } = await setup(root);
		const result = await runForgeOperation({
			operation: "land",
			repositoryRoot: root,
			runtime,
			input: landInput({ ledgerPath: ".delivery/runs/missing.md" }),
		});
		expect(result).toMatchObject({ decision: "stop" });
	});
});

test("a dry run checks the gate without merging", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root);
		const result = await runForgeOperation({
			operation: "land",
			repositoryRoot: root,
			runtime,
			input: landInput({ approved: undefined, dryRun: true }),
		});
		expect(result).toMatchObject({ operation: "land", dryRun: true });
		expect((await calls(log)).map((call) => call.operation)).not.toContain(
			"land",
		);
	});
});

test("land needs explicit approval", async () => {
	await withRoot(async (root) => {
		const { log, runtime } = await setup(root);
		await expect(
			runForgeOperation({
				operation: "land",
				repositoryRoot: root,
				runtime,
				input: landInput({ approved: undefined }),
			}),
		).rejects.toThrow(/approved/);
		expect(await calls(log)).toEqual([]);
	});
});

test("land is planned only on the adapter and never through session tools", async () => {
	await withRoot(async (root) => {
		await mkdir(join(root, ".delivery", "runtime"), { recursive: true });
		await writeFile(
			join(root, ".delivery", "runtime", "mcp-inventory.json"),
			`${JSON.stringify({
				version: 1,
				recordedAt: "2026-10-20T09:00:00.000Z",
				tools: [
					{ server: "GitLab", name: "get_merge_request", status: "ready" },
				],
			})}\n`,
		);
		await expect(
			planForgeOperation({
				operation: "land",
				repositoryRoot: root,
				runtime: defaultRuntimeManifest(true),
				input: landInput(),
			}),
		).rejects.toThrow(/session tools never merge/);
		const { runtime } = await setup(root);
		expect(
			await planForgeOperation({
				operation: "land",
				repositoryRoot: root,
				runtime,
				input: landInput(),
			}),
		).toEqual({
			transport: "adapter",
			provider: "sample-forge",
			operation: "land",
		});
		expect(() =>
			normalizeForgeSessionResult({
				operation: "land",
				provider: "gitlab",
				raw: {},
			}),
		).toThrow(/never land/);
	});
});

test("a raw merge stays refused", async () => {
	await withRoot(async (root) => {
		const { runtime } = await setup(root);
		await expect(
			runForgeOperation({
				operation: "merge",
				repositoryRoot: root,
				runtime,
				input: landInput(),
			}),
		).rejects.toThrow(/stay with a human/);
	});
});
