import { describe, expect, test } from "bun:test";
import {
	type LandGateInput,
	decideLand,
	ledgerContinuousDelivery,
	ledgerReadiness,
} from "./land-gate";

const HEAD = "a".repeat(40);
const HASH = `sha256:${"b".repeat(64)}`;

function ledger(
	options: { verdicts?: string[]; approvals?: string[]; hash?: string } = {},
): string {
	return [
		"# Ship the panel",
		"",
		"Ids: WORK-1",
		`Run contract: .delivery/runs/WORK-1.run-contract.json (${options.hash ?? HASH})`,
		"",
		"## Verdicts",
		"",
		"| Date | MR | Kind | Head | Base | Patch-id | Verdict | By |",
		"|------|----|------|------|------|----------|---------|----|",
		...(options.verdicts ?? [
			`| 2026-10-29 | !12 | review | ${HEAD} | base | patch | ready | factory |`,
			`| 2026-10-29 | !12 | readiness | ${HEAD} | base | patch | go | factory |`,
		]),
		"",
		"## Approvals",
		"",
		...(options.approvals ?? [
			'- 2026-10-29 run — continuous-delivery: yes — operator — "ship it"',
		]),
		"",
		"## Stops",
		"",
	].join("\n");
}

function input(overrides: Partial<LandGateInput> = {}): LandGateInput {
	return {
		request: {
			ref: "12",
			headRevision: HEAD,
			kind: "change",
			ticketKey: "WORK-1",
			readNoteIds: ["n1"],
		},
		change: {
			state: "open",
			draft: false,
			revisions: { head: HEAD },
			pipeline: {
				available: true,
				status: "success",
				revision: HEAD,
				current: true,
			},
			mergeability: { available: true, conflicts: false, status: "mergeable" },
		},
		approvals: {
			headRevision: HEAD,
			approval: { available: true, approvedBy: ["reviewer"], rulesMet: true },
		},
		discussions: {
			headRevision: HEAD,
			discussions: [
				{
					notes: [
						{ id: "n1", system: false },
						{ id: "s1", system: true },
					],
				},
			],
		},
		ledger: ledger(),
		contract: { ok: true },
		contractHash: HASH,
		...overrides,
	};
}

describe("decideLand", () => {
	test("lands an approved, green change at the GO head", () => {
		expect(decideLand(input())).toEqual({ decision: "land", reasons: [] });
	});

	test("waits for a running pipeline", () => {
		const result = decideLand(
			input({
				change: {
					...input().change,
					pipeline: {
						available: true,
						status: "running",
						revision: HEAD,
						current: true,
					},
				},
			}),
		);
		expect(result.decision).toBe("wait");
		expect(result.reasons.join(" ")).toMatch(/still running/);
	});

	test("waits for a person to approve", () => {
		for (const approval of [
			{ available: true as const, approvedBy: [], rulesMet: true },
			{ available: true as const, approvedBy: ["reviewer"], rulesMet: false },
		]) {
			const result = decideLand(
				input({ approvals: { headRevision: HEAD, approval } }),
			);
			expect(result.decision).toBe("wait");
			expect(result.reasons.join(" ")).toMatch(/approve/);
		}
	});

	test("waits while mergeability is still being computed", () => {
		const result = decideLand(
			input({
				change: {
					...input().change,
					mergeability: {
						available: true,
						conflicts: false,
						status: "checking",
					},
				},
			}),
		);
		expect(result.decision).toBe("wait");
	});

	test("a stop outranks a wait", () => {
		const result = decideLand(
			input({
				change: {
					...input().change,
					draft: true,
					pipeline: {
						available: true,
						status: "running",
						revision: HEAD,
						current: true,
					},
				},
			}),
		);
		expect(result.decision).toBe("stop");
		expect(result.reasons.join(" ")).toMatch(/draft/);
	});

	const stops: Array<[string, Partial<LandGateInput>, RegExp]> = [
		[
			"head moved",
			{ change: { ...input().change, revisions: { head: "c".repeat(40) } } },
			/new commits/,
		],
		[
			"failed pipeline",
			{
				change: {
					...input().change,
					pipeline: {
						available: true,
						status: "failed",
						revision: HEAD,
						current: true,
					},
				},
			},
			/did not pass/,
		],
		[
			"pipeline on another commit",
			{
				change: {
					...input().change,
					pipeline: {
						available: true,
						status: "success",
						revision: "d".repeat(40),
						current: false,
					},
				},
			},
			/did not run on the head/,
		],
		[
			"no pipeline",
			{ change: { ...input().change, pipeline: { available: false } } },
			/No pipeline/,
		],
		[
			"conflicts",
			{
				change: {
					...input().change,
					mergeability: {
						available: true,
						conflicts: true,
						status: "conflict",
					},
				},
			},
			/conflicts/,
		],
		[
			"mergeability unknown",
			{ change: { ...input().change, mergeability: { available: false } } },
			/can merge/,
		],
		[
			"already merged",
			{ change: { ...input().change, state: "merged" } },
			/already merged/,
		],
		["closed", { change: { ...input().change, state: "closed" } }, /not open/],
		[
			"approvals unavailable",
			{ approvals: { headRevision: HEAD, approval: { available: false } } },
			/did not report approvals/,
		],
		[
			"approvals at another head",
			{
				approvals: {
					headRevision: "e".repeat(40),
					approval: { available: true, approvedBy: ["r"], rulesMet: true },
				},
			},
			/Approvals were not read/,
		],
		[
			"new comment",
			{
				discussions: {
					headRevision: HEAD,
					discussions: [
						{
							notes: [
								{ id: "n1", system: false },
								{ id: "n2", system: false },
							],
						},
					],
				},
			},
			/1 comment arrived/,
		],
		[
			"no continuous delivery",
			{ ledger: ledger({ approvals: [] }) },
			/continuous-delivery/,
		],
		[
			"no readiness verdict",
			{ ledger: ledger({ verdicts: [] }) },
			/no readiness verdict/,
		],
		[
			"latest readiness is no-go",
			{
				ledger: ledger({
					verdicts: [
						`| 2026-10-29 | !12 | readiness | ${HEAD} | b | p | go | factory |`,
						`| 2026-10-29 | !12 | readiness | ${HEAD} | b | p | no-go | factory |`,
					],
				}),
			},
			/not GO/,
		],
		[
			"GO at another head",
			{
				ledger: ledger({
					verdicts: [
						`| 2026-10-29 | !12 | readiness | ${"f".repeat(40)} | b | p | go | factory |`,
					],
				}),
			},
			/different commit/,
		],
		[
			"contract refused",
			{ contract: { ok: false, reason: "write 'change-land' is outside" } },
			/change-land/,
		],
		[
			"ledger names another contract",
			{ ledger: ledger({ hash: `sha256:${"9".repeat(64)}` }) },
			/does not name the frozen run contract/,
		],
	];
	for (const [name, overrides, reason] of stops) {
		test(`stops on ${name}`, () => {
			const result = decideLand(input(overrides));
			expect(result.decision).toBe("stop");
			expect(result.reasons.join(" ")).toMatch(reason);
		});
	}

	test("an archive change lands without readiness when it only touches openspec", () => {
		const result = decideLand(
			input({
				request: { ...input().request, kind: "archive", readNoteIds: [] },
				discussions: { headRevision: HEAD, discussions: [] },
				ledger: ledger({ verdicts: [] }),
				files: {
					headRevision: HEAD,
					files: [
						{
							path: "openspec/changes/archive/2026-10-29-x/proposal.md",
							previousPath: "openspec/changes/x/proposal.md",
						},
						{ path: "openspec/specs/x/spec.md" },
					],
				},
			}),
		);
		expect(result).toEqual({ decision: "land", reasons: [] });
	});

	test("an archive change touching code stops", () => {
		const result = decideLand(
			input({
				request: { ...input().request, kind: "archive", readNoteIds: [] },
				discussions: { headRevision: HEAD, discussions: [] },
				files: {
					headRevision: HEAD,
					files: [{ path: "openspec/specs/x/spec.md" }, { path: "src/a.ts" }],
				},
			}),
		);
		expect(result.decision).toBe("stop");
		expect(result.reasons.join(" ")).toMatch(/src\/a\.ts/);
	});

	test("an archive change with no file evidence stops", () => {
		const result = decideLand(
			input({ request: { ...input().request, kind: "archive" } }),
		);
		expect(result.decision).toBe("stop");
	});
});

describe("ledger readers", () => {
	test("readiness matches the change reference in a link", () => {
		const text = ledger({
			verdicts: [
				`| 2026-10-29 | [!120](https://x/120) | readiness | ${HEAD} | b | p | go | f |`,
				`| 2026-10-29 | [!12](https://x/12) | readiness | ${HEAD} | b | p | GO | f |`,
			],
		});
		expect(ledgerReadiness(text, "12")).toEqual({ head: HEAD, verdict: "go" });
		expect(ledgerReadiness(text, "!120")?.head).toBe(HEAD);
		expect(ledgerReadiness(text, "7")).toBeUndefined();
	});

	test("continuous delivery is read only from Approvals", () => {
		expect(ledgerContinuousDelivery(ledger())).toBe(true);
		expect(
			ledgerContinuousDelivery(
				ledger({ approvals: [] }).replace(
					"## Stops",
					"## Stops\n\n- continuous-delivery: yes",
				),
			),
		).toBe(false);
	});
});
