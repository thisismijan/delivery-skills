import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumanOwnedAction } from "./sdlc-constitution";
import {
	CONSTITUTION_CHECK_INVOCATION,
	CONSTITUTION_FREEZE_INVOCATION,
	CONSTITUTION_PREFLIGHT_INVOCATION,
	CONSTITUTION_REPORT_INVOCATION,
	CONSTITUTION_SUPERSEDE_INVOCATION,
	buildConformanceReport,
	checkRunContract,
	freezeAgainstLiveConstitution,
	freezeRunContract,
	loadConstitution,
	parseConstitutionDocument,
	parseFrozenRunContract,
	sha256Canonical,
} from "./sdlc-constitution";

const script = join(import.meta.dir, "sdlc-constitution.ts");

const HUMAN_OWNED = [
	"merge",
	"tracker-status",
	"release-risk",
	"gate-override",
	"skill-install",
] as const;

function sampleDraft(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		runId: "discover-2026-10-18-costs",
		planVersion: 1,
		goal: "Show spend by repository on the costs page",
		scope: ["Add a spend-by-repository panel"],
		nonGoals: ["Billing ingestion"],
		tickets: [
			{
				key: "WORK-2101",
				title: "Add a spend-by-repository panel",
				acceptance: [
					"Given costs exist, when the page loads, then spend is grouped by repository",
				],
				blockedBy: [],
			},
		],
		permittedWrites: [
			"spec-branch",
			"tracker-comment",
			"routing-artifacts",
			"implementation",
			"tests",
			"gates",
			"draft-change-request",
			"review-artifacts",
			"review-notes",
			"addressed-change-request",
			"readiness-brief",
			"spec-archive",
			"verify-verdict",
		],
		humanOwned: [...HUMAN_OWNED],
		approval: {
			who: "operator",
			words: "yes, ship that plan",
			at: "2026-10-18T00:00:00.000Z",
		},
		...overrides,
	};
}

async function runCli(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["bun", script, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

describe("live constitution", () => {
	test("loads, hashes stably, and keeps markdown in step", () => {
		const live = loadConstitution();
		expect(live.document.version).toBe(1);
		expect(live.document.precedence[0]).toBe("constitution");
		expect(live.document.precedence.at(-1)).toBe("historical");
		expect(live.document.humanOwned).toEqual([...HUMAN_OWNED]);
		expect(live.hash).toBe(sha256Canonical(live.document));
		expect(live.hash).toBe(
			sha256Canonical(parseConstitutionDocument(live.document)),
		);
		expect(
			new Set(live.document.commandments.map((item) => item.id)).size,
		).toBe(live.document.commandments.length);
		for (const commandment of live.document.commandments) {
			expect(live.markdown).toContain(`Id \`${commandment.id}\``);
		}
		for (const stage of [
			"groom",
			"draft",
			"execute",
			"review",
			"address-comments",
			"ship",
			"archive",
			"auto",
		]) {
			expect(live.document.stages[stage]).toBeDefined();
		}
	});

	test("no stage may write a human-owned action", () => {
		const live = loadConstitution();
		for (const [stage, contract] of Object.entries(live.document.stages)) {
			for (const write of contract.writes) {
				expect([
					stage,
					write,
					HumanOwnedAction.options.includes(write as never),
				]).toEqual([stage, write, false]);
			}
		}
	});
});

describe("frozen run contract", () => {
	test("freeze hashes the body and check accepts the current constitution", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		expect(frozen.constitutionHash).toBe(live.hash);
		expect(frozen.contractHash).toBe(
			sha256Canonical({
				...sampleDraft(),
				constitutionHash: live.hash,
			}),
		);
		expect(
			checkRunContract({
				frozen,
				constitution: live,
				stage: "draft",
				ticketKey: "WORK-2101",
			}).ok,
		).toBe(true);
	});

	test("tampering with a frozen field fails closed", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		expect(() =>
			parseFrozenRunContract({
				...frozen,
				goal: "also rebuild billing",
			}),
		).toThrow(/hash does not match/);
		expect(
			checkRunContract({
				frozen: { ...frozen, constitutionHash: `sha256:${"a".repeat(64)}` },
				constitution: live,
				stage: "draft",
			}).ok,
		).toBe(false);
	});

	test("a ticket outside the frozen plan is rejected", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		expect(
			checkRunContract({
				frozen,
				constitution: live,
				stage: "execute",
				ticketKey: "WORK-9999",
			}).reason,
		).toMatch(/outside the frozen run contract/);
	});

	test("an unknown stage fails closed", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		expect(
			checkRunContract({
				frozen,
				constitution: live,
				stage: "invent",
			}).ok,
		).toBe(false);
	});

	test("a scope change needs a new plan version, hash, and approval", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		const silent = freezeRunContract(
			sampleDraft({
				goal: "also rebuild billing",
			}),
			live.hash,
		);
		expect(
			checkRunContract({
				frozen,
				constitution: live,
				stage: "draft",
				ticketKey: "WORK-2101",
				proposal: silent,
			}).reason,
		).toMatch(/new plan version/);
		const next = freezeAgainstLiveConstitution(
			sampleDraft({
				planVersion: 2,
				goal: "also rebuild billing",
				supersedesHash: frozen.contractHash,
				reason: "billing is now in scope",
				affectedInvariant: "approved-scope",
				approval: {
					who: "operator",
					words: "yes, add billing",
					at: "2026-10-18T01:00:00.000Z",
				},
			}),
		);
		expect(
			checkRunContract({
				frozen,
				constitution: live,
				stage: "draft",
				ticketKey: "WORK-2101",
				proposal: next,
			}).ok,
		).toBe(true);
	});

	test("a tampered supersession proposal fails closed", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		const proposal = freezeAgainstLiveConstitution(
			sampleDraft({
				planVersion: 2,
				goal: "also rebuild billing",
				supersedesHash: frozen.contractHash,
				reason: "billing is now in scope",
				affectedInvariant: "approved-scope",
				approval: {
					who: "operator",
					words: "yes, add billing",
					at: "2026-10-18T01:00:00.000Z",
				},
			}),
		);
		const result = checkRunContract({
			frozen,
			constitution: live,
			stage: "draft",
			ticketKey: "WORK-2101",
			proposal: { ...proposal, goal: "unapproved replacement" },
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/hash does not match/);
	});

	test("plan version 2 without a superseding hash is invalid", () => {
		expect(() =>
			freezeAgainstLiveConstitution(sampleDraft({ planVersion: 2 })),
		).toThrow(/supersedes/);
	});

	test("human-owned actions cannot be permitted writes", () => {
		expect(() =>
			freezeAgainstLiveConstitution(
				sampleDraft({ permittedWrites: ["merge"] }),
			),
		).toThrow(/human-owned/);
	});

	test("stage writes and ticket identity are enforced", () => {
		const live = loadConstitution();
		const restricted = freezeAgainstLiveConstitution(
			sampleDraft({ permittedWrites: ["spec-branch"] }),
		);
		expect(
			checkRunContract({
				frozen: restricted,
				constitution: live,
				stage: "execute",
				ticketKey: "WORK-2101",
			}).reason,
		).toMatch(/write .* outside/);
		const complete = freezeAgainstLiveConstitution(sampleDraft());
		expect(
			checkRunContract({
				frozen: complete,
				constitution: live,
				stage: "execute",
			}).reason,
		).toMatch(/requires a ticket key/);
	});

	test("initial approval cannot be whitespace", () => {
		expect(() =>
			freezeAgainstLiveConstitution(
				sampleDraft({
					approval: {
						who: "operator",
						words: "   ",
						at: "2026-10-18T00:00:00.000Z",
					},
				}),
			),
		).toThrow();
	});
});

describe("conformance report", () => {
	test("a failed gate cannot be overridden by passing prose", () => {
		const live = loadConstitution();
		const frozen = freezeAgainstLiveConstitution(sampleDraft());
		const report = buildConformanceReport({
			frozen,
			constitution: live,
			stage: "execute",
			ticketKey: "WORK-2101",
			results: [
				{ id: "gate", ok: false, detail: "red gate failed" },
				{ id: "reviewer-prose", ok: true, detail: "looks fine" },
			],
		});
		expect(report.allRequiredPassed).toBe(false);
		expect(
			report.checks.find((check) => check.id === "prose-cannot-override-gate")
				?.ok,
		).toBe(false);
	});
});

describe("CLI", () => {
	test("preflight and hash use the live constitution", async () => {
		const live = loadConstitution();
		const preflight = await runCli(["preflight"]);
		expect(preflight.code).toBe(0);
		expect(preflight.stdout).toContain(live.hash);
		const hashed = await runCli(["hash"]);
		expect(hashed.code).toBe(0);
		expect(hashed.stdout.trim()).toBe(live.hash);
	});

	test("freeze, check, and report round-trip a contract file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "sdlc-constitution-"));
		try {
			const draftPath = join(dir, "draft.json");
			const frozenPath = join(dir, "frozen.json");
			const resultsPath = join(dir, "results.json");
			await writeFile(draftPath, JSON.stringify(sampleDraft()));
			const frozen = await runCli(["freeze", draftPath]);
			expect(frozen.code).toBe(0);
			await writeFile(frozenPath, frozen.stdout);
			const check = await runCli(["check", frozenPath, "draft", "WORK-2101"]);
			expect(check.code).toBe(0);
			expect(JSON.parse(check.stdout).ok).toBe(true);
			const outside = await runCli(["check", frozenPath, "draft", "WORK-2"]);
			expect(outside.code).toBe(1);
			await writeFile(
				resultsPath,
				JSON.stringify([{ id: "gate", ok: true, detail: "green" }]),
			);
			const report = await runCli([
				"report",
				frozenPath,
				"execute",
				resultsPath,
				"WORK-2101",
			]);
			expect(report.code).toBe(0);
			expect(JSON.parse(report.stdout).allRequiredPassed).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("supersede validates current and proposed contract files", async () => {
		const dir = await mkdtemp(join(tmpdir(), "sdlc-supersede-"));
		try {
			const current = freezeAgainstLiveConstitution(sampleDraft());
			const proposal = freezeAgainstLiveConstitution(
				sampleDraft({
					planVersion: 2,
					goal: "also rebuild billing",
					supersedesHash: current.contractHash,
					reason: "billing is now in scope",
					affectedInvariant: "approved-scope",
					approval: {
						who: "operator",
						words: "yes, add billing",
						at: "2026-10-18T01:00:00.000Z",
					},
				}),
			);
			const currentPath = join(dir, "current.json");
			const proposalPath = join(dir, "proposal.json");
			await writeFile(currentPath, JSON.stringify(current));
			await writeFile(proposalPath, JSON.stringify(proposal));
			const accepted = await runCli(["supersede", currentPath, proposalPath]);
			expect(accepted.code).toBe(0);
			expect(JSON.parse(accepted.stdout).ok).toBe(true);

			await writeFile(
				proposalPath,
				JSON.stringify({ ...proposal, goal: "unapproved replacement" }),
			);
			const rejected = await runCli(["supersede", currentPath, proposalPath]);
			expect(rejected.code).not.toBe(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("exports the workflow invocations as one double-quoted literal each", () => {
		expect(CONSTITUTION_PREFLIGHT_INVOCATION).toBe(
			"scripts/sdlc-constitution.ts preflight",
		);
		expect(CONSTITUTION_FREEZE_INVOCATION).toBe(
			"scripts/sdlc-constitution.ts freeze <draft.json>",
		);
		expect(CONSTITUTION_CHECK_INVOCATION).toBe(
			"scripts/sdlc-constitution.ts check <run-contract.json> <stage> [ticket-key]",
		);
		expect(CONSTITUTION_REPORT_INVOCATION).toBe(
			"scripts/sdlc-constitution.ts report <run-contract.json> <stage> <results.json> [ticket-key]",
		);
		expect(CONSTITUTION_SUPERSEDE_INVOCATION).toBe(
			"scripts/sdlc-constitution.ts supersede <current.json> <proposal.json>",
		);
	});
});
