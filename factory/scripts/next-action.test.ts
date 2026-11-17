import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecuteRecoveryEvidence } from "./execute-recovery";
import {
	NEXT_ACTION_INVOCATION,
	classifyEntry,
	selectNextAction,
} from "./next-action";

function recordingWriter(): {
	writer: { write: (markdown: string) => void };
	calls: string[];
} {
	const calls: string[] = [];
	return {
		writer: {
			write: (markdown: string) => {
				calls.push(markdown);
			},
		},
		calls,
	};
}

describe("classifyEntry", () => {
	test("a ticket key with no verb is a bare key", () => {
		expect(classifyEntry("ABC-1234")).toEqual({
			kind: "bare-key",
			key: "ABC-1234",
		});
		expect(classifyEntry("  XYZ-740  ")).toEqual({
			kind: "bare-key",
			key: "XYZ-740",
		});
	});

	test("a known lifecycle verb is an explicit verb", () => {
		expect(classifyEntry("execute ABC-1234")).toMatchObject({
			kind: "explicit-verb",
			verb: "execute",
		});
		expect(classifyEntry("draft ABC-2101")).toMatchObject({
			kind: "explicit-verb",
			verb: "draft",
		});
		expect(classifyEntry("build ABC-2101")).toMatchObject({
			kind: "explicit-verb",
			verb: "execute",
		});
	});

	test("an unmatched command word is unknown", () => {
		expect(classifyEntry("frobnicate ABC-1234").kind).toBe("unknown");
		expect(classifyEntry("publish").kind).toBe("unknown");
		expect(classifyEntry("deploy 740").kind).toBe("unknown");
	});
});

describe("selectNextAction resume", () => {
	test("a bare key at drafted selects execute and does not continue the span", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "ABC-1234", status: "[drafted]" },
			writer,
		);
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("execute");
		expect(result.singleStep).toBe(true);
		expect(calls).toEqual([]);
	});

	test("a bare key at ready selects release readiness", () => {
		const result = selectNextAction({
			args: "ABC-1234",
			status: "[ready !740]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("ship");
		expect(result.singleStep).toBe(true);
	});

	test("a bare key at reviewed-blocked selects address comments", () => {
		const result = selectNextAction({
			args: "ABC-1234",
			status: "[reviewed-blocked !12]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("address");
		expect(result.singleStep).toBe(true);
	});

	test("a bare key at addressed selects review, not address comments", () => {
		const result = selectNextAction({
			args: "ABC-1234",
			status: "[addressed !12]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("review");
		expect(result.singleStep).toBe(true);
	});
});

describe("selectNextAction explicit verb", () => {
	test("execute at drafted runs only execute", () => {
		const result = selectNextAction({
			args: "execute ABC-1234",
			status: "[drafted]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("execute");
		expect(result.singleStep).toBe(true);
	});

	test("draft at groomed runs only draft", () => {
		const result = selectNextAction({
			args: "draft ABC-1234",
			status: "[groomed]",
			blockersMerged: true,
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("draft");
		expect(result.singleStep).toBe(true);
	});
});

describe("selectNextAction stop without writing", () => {
	test("execute at ready stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "execute ABC-1234", status: "[ready !740]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		if (result.kind !== "stop") return;
		expect(result.reason.length).toBeGreaterThan(0);
		expect(result.reason).not.toMatch(/mutate|kind:|writeLedger/i);
		expect(calls).toEqual([]);
	});

	test("an unknown command stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "frobnicate ABC-1234", status: "[drafted]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		expect(calls).toEqual([]);
	});

	test("a status with nothing next stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "ABC-1234", status: "[stopped: gate failed]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		expect(calls).toEqual([]);
	});

	test("a confirmed failed stop is never retried as execute", () => {
		const result = selectNextAction({
			args: "execute ABC-1234",
			status: "[stopped: gate failed]",
		});
		expect(result.kind).toBe("stop");
		if (result.kind !== "stop") return;
		expect(result.reason).not.toMatch(/retry/i);
	});
});

const KEY = "ABC-1234";

function recovery(
	overrides: Partial<ExecuteRecoveryEvidence> = {},
): ExecuteRecoveryEvidence {
	return {
		key: KEY,
		owner: { status: "none" },
		mergeRequest: { status: "none" },
		...overrides,
	};
}

describe("selectNextAction executing recovery", () => {
	test("a matching open merge request records the iid and selects review", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: KEY,
				status: "[executing]",
				recovery: recovery({
					mergeRequest: { status: "matching", iid: 740 },
				}),
			},
			writer,
		);
		expect(result).toMatchObject({
			kind: "run",
			verb: "review",
			singleStep: true,
			iid: 740,
		});
		expect(calls).toEqual([]);
	});

	test("a matching merge request still proceeds to review when the owner is gone", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: KEY,
				status: "[executing]",
				recovery: recovery({
					owner: { status: "inactive" },
					mergeRequest: { status: "matching", iid: 12 },
				}),
			},
			writer,
		);
		expect(result).toMatchObject({
			kind: "run",
			verb: "review",
			singleStep: true,
			iid: 12,
		});
		expect(calls).toEqual([]);
	});

	test("no active owner and no merge request stops and offers the execute-resume command", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: KEY,
				status: "[executing]",
				recovery: recovery({ owner: { status: "none" } }),
			},
			writer,
		);
		expect(result.kind).toBe("stop");
		if (result.kind !== "stop") return;
		expect(result.nextCommand).toBe("/delivery execute ABC-1234");
		expect(result.reason).toMatch(/interrupt/i);
		expect(calls).toEqual([]);
	});

	test("a bare key does not run execute for an interrupted execute", () => {
		const result = selectNextAction({
			args: KEY,
			status: "[executing]",
			recovery: recovery(),
		});
		expect(result.kind).toBe("stop");
		if (result.kind === "run") {
			expect(result.verb).not.toBe("execute");
		}
	});

	test("explicit execute at an interrupted executing status runs only execute", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: "execute ABC-1234",
				status: "[executing]",
				recovery: recovery({ owner: { status: "inactive" } }),
			},
			writer,
		);
		expect(result).toMatchObject({
			kind: "run",
			verb: "execute",
			singleStep: true,
		});
		expect(calls).toEqual([]);
	});

	test("continuous delivery resumes an interrupted execute without another approval", () => {
		const result = selectNextAction({
			args: "auto ABC-1234",
			status: "[executing]",
			recovery: recovery({ owner: { status: "inactive" } }),
			continuousDelivery: true,
		});
		expect(result).toEqual({
			kind: "run",
			verb: "execute",
			singleStep: false,
		});
	});

	test("unattributable dirty worktree escalates and does not discard or guess", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: KEY,
				status: "[executing]",
				recovery: recovery({
					dirtyWorktree: { present: true, attributed: false },
				}),
			},
			writer,
		);
		expect(result.kind).toBe("escalate");
		if (result.kind !== "escalate") return;
		expect(result.reason).toMatch(/working tree|dirty/i);
		expect(calls).toEqual([]);
	});

	test("unattributable branch evidence escalates", () => {
		const result = selectNextAction({
			args: KEY,
			status: "[executing]",
			recovery: recovery({
				branch: { present: true, attributed: false },
			}),
		});
		expect(result.kind).toBe("escalate");
	});

	test("unattributable gate evidence escalates", () => {
		const result = selectNextAction({
			args: KEY,
			status: "[executing]",
			recovery: recovery({
				gate: { present: true, attributed: false },
			}),
		});
		expect(result.kind).toBe("escalate");
	});

	test("unattributable evidence escalates even when a matching merge request exists", () => {
		const result = selectNextAction({
			args: KEY,
			status: "[executing]",
			recovery: recovery({
				mergeRequest: { status: "matching", iid: 740 },
				dirtyWorktree: { present: true, attributed: false },
			}),
		});
		expect(result.kind).toBe("escalate");
		if (result.kind === "run") {
			expect(result.verb).not.toBe("review");
		}
	});

	test("an active owner with no merge request waits and does not run execute", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: KEY,
				status: "[executing]",
				recovery: recovery({ owner: { status: "active" } }),
			},
			writer,
		);
		expect(result.kind).toBe("wait");
		if (result.kind !== "wait") return;
		expect(result.reason).not.toMatch(/interrupt/i);
		expect(calls).toEqual([]);
	});

	test("explicit execute while a live owner still builds does not start a second run", () => {
		const result = selectNextAction({
			args: "execute ABC-1234",
			status: "[executing]",
			recovery: recovery({ owner: { status: "active" } }),
		});
		expect(result.kind).toBe("wait");
		if (result.kind === "run") {
			expect(result.verb).not.toBe("execute");
		}
	});

	test("an unknown owner with no merge request escalates rather than waiting or restarting", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{
				args: KEY,
				status: "[executing]",
				recovery: recovery({ owner: { status: "unknown" } }),
			},
			writer,
		);
		expect(result.kind).toBe("escalate");
		expect(calls).toEqual([]);
	});

	test("missing recovery evidence at executing does not guess review or wait from the table", () => {
		const result = selectNextAction({
			args: KEY,
			status: "[executing]",
		});
		expect(result.kind).not.toBe("run");
		expect(result.kind).not.toBe("wait");
	});
});

describe("guarded transitions", () => {
	test("groomed work cannot draft until every blocker is merged", () => {
		const missing = selectNextAction({ args: KEY, status: "[groomed]" });
		expect(missing).toMatchObject({
			kind: "stop",
		});
		expect(missing.kind === "stop" ? missing.reason : "").toMatch(
			/blockersMerged.*blockedBy/,
		);
		expect(
			selectNextAction({
				args: KEY,
				status: "[groomed]",
				blockersMerged: true,
			}),
		).toMatchObject({ kind: "run", verb: "draft" });
	});

	test("no-go needs an explicit blocker classification", () => {
		expect(
			selectNextAction({ args: KEY, status: "[no-go !12]" }),
		).toMatchObject({ kind: "stop" });
		expect(
			selectNextAction({
				args: KEY,
				status: "[no-go !12]",
				noGoNext: "wait",
			}),
		).toMatchObject({ kind: "wait" });
		expect(
			selectNextAction({
				args: KEY,
				status: "[no-go !12]",
				noGoNext: "address",
			}),
		).toMatchObject({ kind: "run", verb: "address" });
	});

	test("verified work starts retro only when no run keys remain", () => {
		expect(
			selectNextAction({ args: KEY, status: "[verified !12]" }),
		).toMatchObject({ kind: "stop" });
		expect(
			selectNextAction({
				args: KEY,
				status: "[verified !12]",
				remainingKeys: 1,
			}),
		).toMatchObject({ kind: "stop" });
		expect(
			selectNextAction({
				args: KEY,
				status: "[verified !12]",
				remainingKeys: 0,
			}),
		).toMatchObject({ kind: "run", verb: "retro" });
	});
});

test("the CLI consumes recovery and continuous-delivery context", async () => {
	const root = await mkdtemp(join(tmpdir(), "next-action-context-"));
	try {
		const context = join(root, "context.json");
		await writeFile(
			context,
			JSON.stringify({
				recovery: recovery({ owner: { status: "inactive" } }),
				continuousDelivery: true,
			}),
		);
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "next-action.ts"),
				`auto ${KEY}`,
				"[executing]",
				context,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		expect(JSON.parse(await new Response(proc.stdout).text())).toEqual({
			kind: "run",
			verb: "execute",
			singleStep: false,
		});
		expect(NEXT_ACTION_INVOCATION).toContain("[context.json]");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

describe("no-go with an open needs-validation item", () => {
	test("acknowledgement stops with a reason about acknowledging a fact before merging", () => {
		const result = selectNextAction({
			args: KEY,
			status: "[no-go !12]",
			noGoNext: "acknowledgement",
		});
		expect(result.kind).toBe("stop");
		if (result.kind !== "stop") return;
		expect(result.reason).toMatch(/acknowledge/i);
		expect(result.reason).toMatch(/before merging/i);
		expect(result.reason).not.toMatch(/classify/i);
	});

	test("acknowledgement never selects address comments and never waits", () => {
		for (const args of [KEY, `address ${KEY}`]) {
			const result = selectNextAction({
				args,
				status: "[no-go !12]",
				noGoNext: "acknowledgement",
			});
			expect([args, result.kind]).toEqual([args, "stop"]);
		}
	});

	test("acknowledgement and risk acceptance stop for different reasons", () => {
		const acknowledgement = selectNextAction({
			args: KEY,
			status: "[no-go !12]",
			noGoNext: "acknowledgement",
		});
		const acceptance = selectNextAction({
			args: KEY,
			status: "[no-go !12]",
			noGoNext: "risk-acceptance",
		});
		expect(acknowledgement.kind).toBe("stop");
		expect(acceptance.kind).toBe("stop");
		if (acknowledgement.kind !== "stop" || acceptance.kind !== "stop") return;
		expect(acknowledgement.reason).not.toBe(acceptance.reason);
		expect(acceptance.reason).toMatch(/risk acceptance/i);
		expect(acknowledgement.reason).not.toMatch(/risk acceptance/i);
	});

	test("the other no-go classifications behave as before", () => {
		expect(
			selectNextAction({ args: KEY, status: "[no-go !12]", noGoNext: "wait" }),
		).toMatchObject({
			kind: "wait",
			reason: "Release readiness is waiting on pipeline or conflict evidence.",
		});
		expect(
			selectNextAction({
				args: KEY,
				status: "[no-go !12]",
				noGoNext: "risk-acceptance",
			}),
		).toEqual({
			kind: "stop",
			reason:
				"Release readiness needs an explicit head-scoped risk acceptance.",
		});
		expect(
			selectNextAction({
				args: KEY,
				status: "[no-go !12]",
				noGoNext: "address",
			}),
		).toMatchObject({ kind: "run", verb: "address", singleStep: true });
		expect(selectNextAction({ args: KEY, status: "[no-go !12]" })).toEqual({
			kind: "stop",
			reason: "Classify the NO-GO blocker before selecting the next action.",
		});
	});

	async function runCli(
		noGoNext: string,
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const root = await mkdtemp(join(tmpdir(), "next-action-acknowledgement-"));
		try {
			const context = join(root, "context.json");
			await writeFile(context, JSON.stringify({ noGoNext }));
			const proc = Bun.spawn(
				[
					"bun",
					join(import.meta.dir, "next-action.ts"),
					KEY,
					"[no-go !12]",
					context,
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			return { exitCode, stdout, stderr };
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}

	test("the command line accepts acknowledgement in the context", async () => {
		const run = await runCli("acknowledgement");
		const result = JSON.parse(run.stdout);
		expect(result.kind).toBe("stop");
		expect(result.reason).toMatch(/acknowledge/i);
		expect(run.exitCode).toBe(1);
	});

	test("the command line rejects an unknown classification", async () => {
		const run = await runCli("fix-later");
		expect(run.exitCode).not.toBe(0);
		expect(run.stdout.trim()).toBe("");
		expect(run.stderr).toMatch(/noGoNext/);
	});
});
