import { describe, expect, test } from "bun:test";
import type { ExecuteRecoveryEvidence } from "./execute-recovery";
import { classifyEntry, selectNextAction } from "./next-action";

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
		expect(classifyEntry("MDF-1234")).toEqual({
			kind: "bare-key",
			key: "MDF-1234",
		});
		expect(classifyEntry("  SMAI-740  ")).toEqual({
			kind: "bare-key",
			key: "SMAI-740",
		});
	});

	test("a known lifecycle verb is an explicit verb", () => {
		expect(classifyEntry("execute MDF-1234")).toMatchObject({
			kind: "explicit-verb",
			verb: "execute",
		});
		expect(classifyEntry("draft MDF-2101")).toMatchObject({
			kind: "explicit-verb",
			verb: "draft",
		});
		expect(classifyEntry("build MDF-2101")).toMatchObject({
			kind: "explicit-verb",
			verb: "execute",
		});
	});

	test("an unmatched command word is unknown", () => {
		expect(classifyEntry("frobnicate MDF-1234").kind).toBe("unknown");
		expect(classifyEntry("publish").kind).toBe("unknown");
		expect(classifyEntry("deploy 740").kind).toBe("unknown");
	});
});

describe("selectNextAction resume", () => {
	test("a bare key at drafted selects execute and does not continue the span", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "MDF-1234", status: "[drafted]" },
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
			args: "MDF-1234",
			status: "[ready !740]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("ship");
		expect(result.singleStep).toBe(true);
	});

	test("a bare key at reviewed-blocked selects address comments", () => {
		const result = selectNextAction({
			args: "MDF-1234",
			status: "[reviewed-blocked !12]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("address");
		expect(result.singleStep).toBe(true);
	});

	test("a bare key at addressed selects review, not address comments", () => {
		const result = selectNextAction({
			args: "MDF-1234",
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
			args: "execute MDF-1234",
			status: "[drafted]",
		});
		expect(result.kind).toBe("run");
		if (result.kind !== "run") return;
		expect(result.verb).toBe("execute");
		expect(result.singleStep).toBe(true);
	});

	test("draft at groomed runs only draft", () => {
		const result = selectNextAction({
			args: "draft MDF-1234",
			status: "[groomed]",
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
			{ args: "execute MDF-1234", status: "[ready !740]" },
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
			{ args: "frobnicate MDF-1234", status: "[drafted]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		expect(calls).toEqual([]);
	});

	test("a status with nothing next stops and does not call the writer", () => {
		const { writer, calls } = recordingWriter();
		const result = selectNextAction(
			{ args: "MDF-1234", status: "[stopped: gate failed]" },
			writer,
		);
		expect(result.kind).toBe("stop");
		expect(calls).toEqual([]);
	});

	test("a confirmed failed stop is never retried as execute", () => {
		const result = selectNextAction({
			args: "execute MDF-1234",
			status: "[stopped: gate failed]",
		});
		expect(result.kind).toBe("stop");
		if (result.kind !== "stop") return;
		expect(result.reason).not.toMatch(/retry/i);
	});
});

const KEY = "MDF-1234";

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
		expect(result.nextCommand).toBe("/delivery execute MDF-1234");
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
				args: "execute MDF-1234",
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
			args: "execute MDF-1234",
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
