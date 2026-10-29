import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CreateForgeChangeInput,
	FORGE_OPERATIONS,
	ForgeChange,
	ForgeDiff,
	ForgeDryRun,
	ForgeFiles,
	ForgePipeline,
	ForgeReceipt,
	PublishForgeNoteInput,
	parseForgeOperationInput,
	parseForgeOperationResult,
	planForgeOperation,
	runForgeOperation,
} from "./forge-provider";
import {
	defaultRuntimeManifest,
	parseRuntimeManifest,
} from "./runtime-manifest";

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "forge-provider-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function change(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "change-1",
		state: "open",
		draft: true,
		branches: { source: "topic", target: "main" },
		revisions: { head: "abc123def" },
		title: "Keep the forge generic",
		description: "normalized",
		author: "factory",
		url: "https://example.invalid/changes/change-1",
		pipeline: { available: false },
		mergeability: { available: false },
		...overrides,
	};
}

function evidence(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "change-1",
		headRevision: "abc123def",
		...overrides,
	};
}

function receipt(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "change-1",
		operation: "note",
		noteId: "note-1",
		url: "https://example.invalid/notes/1",
		...overrides,
	};
}

async function fakeAdapter(
	root: string,
	name: string,
	body: string,
): Promise<string> {
	const path = join(root, name);
	await writeFile(path, `#!/usr/bin/env bun\n${body}\n`);
	await chmod(path, 0o755);
	return path;
}

async function recordingAdapter(
	root: string,
	name: string,
	stdout: string,
	exitCode = 0,
): Promise<{ executable: string; log: string }> {
	const log = join(root, `${name}.log`);
	const executable = await fakeAdapter(
		root,
		name,
		`import { writeFile } from "node:fs/promises";
await writeFile(${JSON.stringify(log)}, JSON.stringify({
  argv: process.argv.slice(2),
  stdin: await Bun.stdin.text(),
}));
await Bun.stderr.write("diagnostic".repeat(1_000));
process.stdout.write(${JSON.stringify(stdout)});
process.exit(${exitCode});`,
	);
	return { executable, log };
}

function runtime(options: {
	forge: string;
	review?: string;
	forgeProvider?: string;
	reviewProvider?: string;
}) {
	const base = defaultRuntimeManifest(true);
	return parseRuntimeManifest({
		version: 1,
		capabilities: {
			...base.capabilities,
			"forge.change": {
				available: true,
				mode: "adapter",
				provider: options.forgeProvider ?? "sample-forge",
				invocation: options.forge,
			},
			"review.publish": {
				available: true,
				mode: "adapter",
				provider: options.reviewProvider ?? "sample-forge",
				invocation: options.review ?? options.forge,
			},
		},
	});
}

test("normalized operations exclude merge, close, and thread resolution", () => {
	expect([...FORGE_OPERATIONS]).toEqual([
		"find",
		"read",
		"pipeline",
		"files",
		"diff",
		"commits",
		"discussions",
		"anchors",
		"approvals",
		"create",
		"set-draft",
		"note",
		"reply",
		"land",
	]);
	for (const operation of ["merge", "close", "delete", "approve", "resolve"]) {
		expect(FORGE_OPERATIONS).not.toContain(operation);
	}
});

test("malformed change, evidence, and receipt schemas fail before adapter execution", () => {
	expect(() => ForgeChange.parse({ ...change(), title: "" })).toThrow();
	expect(() => ForgeChange.parse({ ...change(), iid: 12 })).toThrow();
	expect(() =>
		parseForgeOperationResult("read", { version: 1, provider: "sample-forge" }),
	).toThrow();
	expect(() =>
		ForgeDiff.parse(evidence({ unifiedDiff: "partial", complete: false })),
	).toThrow();
	expect(() =>
		ForgeFiles.parse(
			evidence({
				files: [
					{
						path: "src/a.ts",
						status: "renamed",
						additions: 1,
						deletions: 0,
					},
				],
			}),
		),
	).toThrow(/previous path/);
	expect(() =>
		ForgeReceipt.parse({ version: 1, provider: "sample-forge", ref: "1" }),
	).toThrow();
	expect(() =>
		ForgePipeline.parse({
			version: 1,
			provider: "sample-forge",
			revision: "merge-sha",
			pipeline: {
				available: true,
				status: "success",
				revision: "different-sha",
			},
		}),
	).toThrow(/requested revision/);
});

test("pipeline evidence is bound to the exact requested revision", async () => {
	await withRoot(async (root) => {
		const { executable } = await recordingAdapter(
			root,
			"pipeline",
			JSON.stringify({
				version: 1,
				provider: "sample-forge",
				revision: "merge-sha",
				pipeline: {
					available: true,
					status: "success",
					revision: "merge-sha",
					url: "https://example.invalid/pipelines/1",
				},
			}),
		);
		const result = await runForgeOperation({
			operation: "pipeline",
			repositoryRoot: root,
			runtime: runtime({ forge: `exec:${executable}` }),
			input: { revision: "merge-sha" },
		});
		expect(result).toMatchObject({
			revision: "merge-sha",
			pipeline: { available: true, status: "success" },
		});
	});
});

test("unapproved mutations fail before adapter execution", async () => {
	await withRoot(async (root) => {
		const { executable, log } = await recordingAdapter(
			root,
			"unapproved",
			JSON.stringify(receipt({ operation: "create" })),
		);
		const live = runtime({ forge: `exec:${executable}` });
		await expect(
			runForgeOperation({
				operation: "create",
				repositoryRoot: root,
				runtime: live,
				input: {
					approved: false,
					title: "No",
					sourceBranch: "topic",
					targetBranch: "main",
				},
			}),
		).rejects.toThrow();
		expect(() =>
			parseForgeOperationInput("create", {
				title: "No",
				sourceBranch: "topic",
				targetBranch: "main",
			}),
		).toThrow();
		expect(() =>
			CreateForgeChangeInput.parse({
				title: "No",
				sourceBranch: "topic",
				targetBranch: "main",
			}),
		).toThrow();
		expect(() =>
			PublishForgeNoteInput.parse({
				ref: "change-1",
				bodyPath: ".review/note.md",
			}),
		).toThrow();
		expect(await Bun.file(log).exists()).toBe(false);
	});
});

test("human-owned lifecycle operations never invoke an adapter", async () => {
	await withRoot(async (root) => {
		const { executable, log } = await recordingAdapter(
			root,
			"human-owned",
			JSON.stringify(receipt()),
		);
		const live = runtime({ forge: `exec:${executable}` });
		for (const operation of ["merge", "close", "resolve"]) {
			await expect(
				runForgeOperation({
					operation,
					repositoryRoot: root,
					runtime: live,
					input: { approved: true, ref: "change-1" },
				}),
			).rejects.toThrow(/human/i);
		}
		expect(await Bun.file(log).exists()).toBe(false);
	});
});

test("read receives versioned JSON and returns a validated change", async () => {
	await withRoot(async (root) => {
		const adapter = await fakeAdapter(
			root,
			"read-ok",
			`const request = JSON.parse(await Bun.stdin.text());
await Bun.stderr.write("diagnostic".repeat(100_000));
console.log(JSON.stringify({
  version: 1,
  provider: request.provider,
  ref: request.input.ref,
  state: "open",
  draft: true,
  branches: { source: "topic", target: "main" },
  revisions: { head: "abc123def" },
  title: process.argv[2],
  description: "normalized",
  author: "factory",
  url: "https://example.invalid/changes/" + request.input.ref,
  pipeline: { available: false },
  mergeability: { available: false },
}));`,
		);
		expect(
			await runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${adapter}` }),
				input: { ref: "native:42" },
			}),
		).toMatchObject({
			provider: "sample-forge",
			ref: "native:42",
			title: "read",
			pipeline: { available: false },
		});
	});
});

test("absent, mismatched, relative, failed, noisy, and malformed adapters fail safely", async () => {
	await withRoot(async (root) => {
		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: defaultRuntimeManifest(true),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow(/runtime manifest/i);

		const { executable: mismatchExe, log: mismatchLog } =
			await recordingAdapter(root, "mismatch", JSON.stringify(change()));
		await expect(
			runForgeOperation({
				operation: "note",
				repositoryRoot: root,
				runtime: runtime({
					forge: `exec:${mismatchExe}`,
					review: `exec:${mismatchExe}`,
					forgeProvider: "alpha-forge",
					reviewProvider: "beta-forge",
				}),
				input: {
					approved: true,
					ref: "change-1",
					bodyPath: ".review/ok.md",
				},
			}),
		).rejects.toThrow(/same provider|different providers/i);
		expect(await Bun.file(mismatchLog).exists()).toBe(false);

		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: "exec:relative/adapter" }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow(/absolute path/);

		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: "host:forge" }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow(/executable bridge/);

		const failed = await fakeAdapter(
			root,
			"failed",
			`await Bun.stderr.write("token=secret-value");
process.exit(9);`,
		);
		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${failed}` }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow(/exit 9/);
		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${failed}` }),
				input: { ref: "change-1" },
			}),
		).rejects.not.toThrow(/secret-value|token=/);
		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${failed}` }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow(/\[credential redacted\]/);

		const malformed = await fakeAdapter(
			root,
			"malformed",
			'console.log("not-json")',
		);
		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${malformed}` }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow(/JSON/);

		const incomplete = await fakeAdapter(
			root,
			"incomplete",
			`console.log(JSON.stringify(${JSON.stringify({ version: 1, provider: "sample-forge", ref: "change-1" })}))`,
		);
		await expect(
			runForgeOperation({
				operation: "read",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${incomplete}` }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow();

		const truncated = await fakeAdapter(
			root,
			"truncated",
			`console.log(JSON.stringify(${JSON.stringify(
				evidence({ unifiedDiff: "partial", complete: false }),
			)}))`,
		);
		await expect(
			runForgeOperation({
				operation: "diff",
				repositoryRoot: root,
				runtime: runtime({ forge: `exec:${truncated}` }),
				input: { ref: "change-1" },
			}),
		).rejects.toThrow();
	});
});

test("unsafe note bodies never reach an adapter", async () => {
	await withRoot(async (root) => {
		const { executable, log } = await recordingAdapter(
			root,
			"unsafe-note",
			JSON.stringify(receipt()),
		);
		const live = runtime({ forge: `exec:${executable}` });
		await mkdir(join(root, ".review"), { recursive: true });
		await writeFile(join(root, "outside.md"), "escaped");
		await writeFile(
			join(root, ".review", "summary.md"),
			"-----BEGIN PRIVATE KEY-----\nMIIE\n",
		);
		await writeFile(join(root, ".review", ".env"), "plain note");

		await expect(
			runForgeOperation({
				operation: "note",
				repositoryRoot: root,
				runtime: live,
				input: {
					approved: true,
					ref: "change-1",
					bodyPath: join(root, "outside.md"),
				},
			}),
		).rejects.toThrow(/review/i);
		await expect(
			runForgeOperation({
				operation: "note",
				repositoryRoot: root,
				runtime: live,
				input: {
					approved: true,
					ref: "change-1",
					bodyPath: join(root, ".review", "summary.md"),
				},
			}),
		).rejects.toThrow(/secret/i);
		await expect(
			runForgeOperation({
				operation: "reply",
				repositoryRoot: root,
				runtime: live,
				input: {
					approved: true,
					ref: "change-1",
					discussionId: "thread-1",
					bodyPath: join(root, ".review", ".env"),
				},
			}),
		).rejects.toThrow(/secret|name/i);
		expect(await Bun.file(log).exists()).toBe(false);
	});
});

test("dry-run publication validates and renders without invoking an adapter", async () => {
	await withRoot(async (root) => {
		const { executable, log } = await recordingAdapter(
			root,
			"dry-run",
			JSON.stringify(receipt()),
		);
		await mkdir(join(root, ".review"), { recursive: true });
		await writeFile(
			join(root, ".review", "summary.md"),
			"Holdout review passed.\n",
		);
		const result = await runForgeOperation({
			operation: "note",
			repositoryRoot: root,
			runtime: runtime({ forge: `exec:${executable}` }),
			input: {
				dryRun: true,
				ref: "change-1",
				bodyPath: join(root, ".review", "summary.md"),
				anchor: { path: "src/a.ts", line: 12 },
			},
		});
		expect(ForgeDryRun.parse(result)).toMatchObject({
			dryRun: true,
			provider: "sample-forge",
			operation: "note",
			input: {
				ref: "change-1",
				body: "Holdout review passed.\n",
				anchor: { path: "src/a.ts", line: 12 },
			},
		});
		expect(JSON.stringify(result)).not.toMatch(/bodyPath/);
		expect(await Bun.file(log).exists()).toBe(false);
	});
});

test("approved publication sends the checked body to the review adapter", async () => {
	await withRoot(async (root) => {
		const { executable, log } = await recordingAdapter(
			root,
			"publish",
			JSON.stringify(receipt({ noteId: "n-9" })),
		);
		await mkdir(join(root, ".review"), { recursive: true });
		await writeFile(
			join(root, ".review", "summary.md"),
			"Holdout review passed.\n",
		);
		expect(
			await runForgeOperation({
				operation: "note",
				repositoryRoot: root,
				runtime: runtime({
					forge: `exec:${join(root, "unused-forge")}`,
					review: `exec:${executable}`,
				}),
				input: {
					approved: true,
					ref: "change-1",
					bodyPath: ".review/summary.md",
				},
			}),
		).toMatchObject({
			operation: "note",
			noteId: "n-9",
			provider: "sample-forge",
		});
		const recorded = JSON.parse(await Bun.file(log).text()) as {
			argv: string[];
			stdin: string;
		};
		expect(recorded.argv).toEqual(["note"]);
		const envelope = JSON.parse(recorded.stdin) as {
			version: number;
			provider: string;
			input: { body?: string; bodyPath?: string };
		};
		expect(envelope).toMatchObject({
			version: 1,
			provider: "sample-forge",
			input: { body: "Holdout review passed.\n", ref: "change-1" },
		});
		expect(envelope.input.bodyPath).toBeUndefined();
	});
});

test("plan prefers recorded session tools over a missing adapter", async () => {
	await withRoot(async (root) => {
		await mkdir(join(root, ".delivery", "runtime"), { recursive: true });
		await writeFile(
			join(root, ".delivery", "runtime", "mcp-inventory.json"),
			`${JSON.stringify({
				version: 1,
				recordedAt: "2026-10-20T09:00:00.000Z",
				tools: [
					{
						server: "GitLab",
						name: "get_merge_request",
						status: "ready",
					},
				],
			})}\n`,
		);
		const planned = await planForgeOperation({
			operation: "read",
			repositoryRoot: root,
			runtime: defaultRuntimeManifest(true),
			input: { ref: "12" },
		});
		expect(planned).toMatchObject({
			transport: "mcp",
			provider: "gitlab",
			tool: { name: "get_merge_request" },
			arguments: { merge_request_iid: "12" },
		});
	});
});
