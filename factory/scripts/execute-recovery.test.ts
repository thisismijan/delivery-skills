import { describe, expect, test } from "bun:test";
import {
	type ExecuteRecoveryEvidence,
	executeResumeCommand,
	recoverExecuting,
} from "./execute-recovery";

const KEY = "MDF-1234";

function evidence(
	overrides: Partial<ExecuteRecoveryEvidence> = {},
): ExecuteRecoveryEvidence {
	return {
		key: KEY,
		owner: { status: "none" },
		mergeRequest: { status: "none" },
		...overrides,
	};
}

function isJargon(text: string): boolean {
	return /attributed:|writeLedger|kind:|mutate|recovery evidence/i.test(text);
}

describe("recoverExecuting matching merge request", () => {
	test("a matching open merge request records the iid and continues to review", () => {
		const result = recoverExecuting(
			evidence({
				mergeRequest: { status: "matching", iid: 740 },
			}),
		);
		expect(result).toEqual({ kind: "review", iid: 740 });
	});

	test("a matching merge request still continues to review when the owner is gone", () => {
		const result = recoverExecuting(
			evidence({
				owner: { status: "inactive" },
				mergeRequest: { status: "matching", iid: 12 },
			}),
		);
		expect(result).toEqual({ kind: "review", iid: 12 });
	});
});

describe("recoverExecuting interrupted stop", () => {
	test("no active owner and no merge request is an interrupted stop with the execute-resume command", () => {
		const result = recoverExecuting(evidence({ owner: { status: "none" } }));
		expect(result.kind).toBe("interrupted");
		if (result.kind !== "interrupted") return;
		expect(result.nextCommand).toBe(executeResumeCommand(KEY));
		expect(result.nextCommand).toBe("/delivery execute MDF-1234");
		expect(result.reason.length).toBeGreaterThan(0);
		expect(result.reason).toMatch(/interrupt/i);
		expect(isJargon(result.reason)).toBe(false);
	});

	test("an inactive owner with no merge request is also interrupted", () => {
		const result = recoverExecuting(
			evidence({ owner: { status: "inactive" } }),
		);
		expect(result.kind).toBe("interrupted");
		if (result.kind !== "interrupted") return;
		expect(result.nextCommand).toBe("/delivery execute MDF-1234");
	});
});

describe("recoverExecuting unattributable evidence", () => {
	test("an unattributable dirty worktree escalates and does not guess", () => {
		const result = recoverExecuting(
			evidence({
				dirtyWorktree: { present: true, attributed: false },
			}),
		);
		expect(result.kind).toBe("escalate");
		if (result.kind !== "escalate") return;
		expect(result.reason).toMatch(/working tree|dirty/i);
		expect(result.reason).toMatch(/cannot be attributed|will not discard|will not guess/i);
		expect(isJargon(result.reason)).toBe(false);
	});

	test("an unattributable stale or conflicting branch escalates", () => {
		const result = recoverExecuting(
			evidence({
				branch: { present: true, attributed: false },
			}),
		);
		expect(result.kind).toBe("escalate");
		if (result.kind !== "escalate") return;
		expect(result.reason).toMatch(/branch/i);
		expect(isJargon(result.reason)).toBe(false);
	});

	test("unattributable stale or conflicting gate evidence escalates", () => {
		const result = recoverExecuting(
			evidence({
				gate: { present: true, attributed: false },
			}),
		);
		expect(result.kind).toBe("escalate");
		if (result.kind !== "escalate") return;
		expect(result.reason).toMatch(/gate/i);
		expect(isJargon(result.reason)).toBe(false);
	});

	test("unattributable evidence escalates even when a matching open merge request exists", () => {
		const result = recoverExecuting(
			evidence({
				mergeRequest: { status: "matching", iid: 740 },
				dirtyWorktree: { present: true, attributed: false },
			}),
		);
		expect(result.kind).toBe("escalate");
	});

	test("a conflicting merge request escalates rather than guessing", () => {
		const result = recoverExecuting(
			evidence({
				mergeRequest: { status: "conflicting" },
			}),
		);
		expect(result.kind).toBe("escalate");
		if (result.kind !== "escalate") return;
		expect(result.reason).toMatch(/merge request/i);
		expect(isJargon(result.reason)).toBe(false);
	});
});

describe("recoverExecuting live wait", () => {
	test("an active owner with no merge request waits and is not interrupted", () => {
		const result = recoverExecuting(
			evidence({ owner: { status: "active" } }),
		);
		expect(result.kind).toBe("wait");
		if (result.kind !== "wait") return;
		expect(result.reason).toMatch(/still running|wait/i);
		expect(result.reason).not.toMatch(/interrupt/i);
		expect(isJargon(result.reason)).toBe(false);
	});

	test("an unknown owner with no merge request escalates rather than waiting or restarting", () => {
		const result = recoverExecuting(
			evidence({ owner: { status: "unknown" } }),
		);
		expect(result.kind).toBe("escalate");
		if (result.kind !== "escalate") return;
		expect(result.reason.length).toBeGreaterThan(0);
		expect(isJargon(result.reason)).toBe(false);
	});

	test("attributed dirty worktree with no owner and no merge request is still interrupted, not a guess", () => {
		const result = recoverExecuting(
			evidence({
				dirtyWorktree: { present: true, attributed: true },
			}),
		);
		expect(result.kind).toBe("interrupted");
		if (result.kind !== "interrupted") return;
		expect(result.nextCommand).toBe("/delivery execute MDF-1234");
	});
});
