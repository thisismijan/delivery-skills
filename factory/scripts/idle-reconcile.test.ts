import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDLE_RECONCILE_INVOCATION, decideIdle } from "./idle-reconcile";

const HEAD = "a".repeat(40);
function change(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "change-7",
		state: "open",
		draft: true,
		branches: { source: "work-1-fee", target: "main" },
		revisions: { head: HEAD },
		title: "Fee",
		description: "",
		author: "factory",
		url: "https://example.invalid/changes/7",
		pipeline: { available: false },
		mergeability: { available: false },
		...overrides,
	};
}
const find = (...changes: unknown[]) => ({
	version: 1,
	provider: "sample-forge",
	changes,
});

test("an open change whose head the journal names resumes at review", () => {
	expect(
		decideIdle({
			key: "WORK-1",
			journal: `| WORK-1 | Fee | 2 | !7 | - | [executing] |\nhead ${HEAD}\n`,
			find: find(change()),
			greenGates: [],
		}),
	).toEqual({
		resume: "review",
		ref: "change-7",
		head: HEAD,
		reason: "the journal names the change's head",
	});
});

test("a green gate at the change's head is enough when the journal predates it", () => {
	expect(
		decideIdle({
			key: "WORK-1",
			journal: null,
			find: find(change()),
			greenGates: [
				{ passed: false, evidence: { commit: HEAD } },
				{ passed: true, evidence: { commit: HEAD } },
			],
		}),
	).toMatchObject({
		resume: "review",
		reason: "a green gate passed at the change's head",
	});
});

test("no open change, several, or an unproven head keeps the stop", () => {
	expect(
		decideIdle({ key: "WORK-1", journal: HEAD, find: find(), greenGates: [] }),
	).toMatchObject({
		resume: "stopped",
		reason: "no open change for WORK-1",
	});
	expect(
		decideIdle({
			key: "WORK-1",
			journal: HEAD,
			find: find(change({ state: "merged" })),
			greenGates: [],
		}).resume,
	).toBe("stopped");
	expect(
		decideIdle({
			key: "WORK-1",
			journal: HEAD,
			find: find(change(), change({ ref: "change-8" })),
			greenGates: [],
		}),
	).toMatchObject({
		resume: "stopped",
		reason: "2 open changes for WORK-1, so none is assumed",
	});
	expect(
		decideIdle({
			key: "WORK-1",
			journal: "no head here",
			find: find(change()),
			greenGates: [{ passed: true, evidence: { commit: "b".repeat(40) } }],
		}).resume,
	).toBe("stopped");
	expect(() =>
		decideIdle({
			key: "WORK-1",
			journal: null,
			find: { changes: [] },
			greenGates: [],
		}),
	).toThrow();
});

test("auto reconciles an idle worker's change with the helper before keeping the stop", () => {
	const auto = readFileSync(
		join(import.meta.dir, "../../skills/delivery/workflows/auto.md"),
		"utf8",
	)
		.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
		.replaceAll('.ts"', ".ts");
	expect(auto).toContain(IDLE_RECONCILE_INVOCATION);
	const flat = auto.replace(/\s+/g, " ");
	expect(flat).toContain(
		"Exit 0 means its open change is the worker's own: set the key to `[executing]` with that change",
	);
	expect(flat).toContain(
		"Before choosing its status, find the key's open change",
	);
	expect(flat).toContain(
		"Exit 3 means nothing is proven: set its key to `[stopped: <reason>]` with the reason worker idle",
	);
});
