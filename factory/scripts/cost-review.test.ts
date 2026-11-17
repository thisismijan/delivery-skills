import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	COST_REVIEW_INVOCATION,
	PACKET_CHARS_FLAG,
	ledgerKeys,
	reviewCosts,
} from "./cost-review";
import type { RoutingObservation } from "./routing-observation";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function put(root: string, path: string, text: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

const LEDGER = [
	"# Run",
	"",
	"## Keys",
	"",
	"| Key | Title | Stage | MR | Blocked by | Status |",
	"|-----|-------|-------|----|------------|--------|",
	"| ABC-1 | Fees | 3 | !7 | - | [merged !7] |",
	"| ABC-2 | Copy | 2 | - | - | [stopped: scope] |",
	"",
	"## Decisions",
	"",
	"| ABC-9 | not a key row |",
].join("\n");

function repo() {
	const root = mkdtempSync(join(tmpdir(), "cost-review-"));
	roots.push(root);
	put(root, "openspec/changes/archive/2026-11-01-abc-1-fees/proposal.md", "x");
	for (const head of ["a1", "b2", "c3"]) {
		put(
			root,
			`.review/mr-7/${head}/lens-coverage.json`,
			JSON.stringify({ lenses: ["l1", "l2", "l3", "l4"] }),
		);
	}
	put(root, ".review/mr-7/c3/focused-pass-1.md", "pass");
	put(root, ".review/mr-7/rejected.json", "[]");
	for (const run of ["a", "b", "c"])
		put(root, `.review/abc-1-fees/green-gate-${run}.json`, "{}");
	put(
		root,
		".review/abc-1-fees/implement-packet.md",
		"x".repeat(PACKET_CHARS_FLAG + 5),
	);
	put(root, ".review/abc-1-fees/test-packet.md", "small");
	return root;
}

function observation(
	run: string,
	stage: string,
	work: string,
	tier: string,
	input: number,
	output: number,
	shadow = tier,
) {
	return {
		runId: run,
		currentTier: tier,
		shadowTier: shadow,
		floorApplied: false,
		profile: { stage, workType: work },
		context: {
			usage: {
				source: "tokens",
				inputTokens: input,
				outputTokens: output,
				costUsd: 0.5,
			},
		},
	} as unknown as RoutingObservation;
}

test("ledger keys come only from the Keys table, with their change refs", () => {
	expect(ledgerKeys(LEDGER)).toEqual([
		{ key: "ABC-1", mr: "7" },
		{ key: "ABC-2", mr: null },
	]);
});

test("an unmeasured run reports its cost drivers and says it was not measured", () => {
	const root = repo();
	const review = reviewCosts({
		repoRoot: root,
		ledger: LEDGER,
		observations: [],
		skipsByRun: new Map([["abc-1-fees", 2]]),
	});
	expect(review.keys[0]).toMatchObject({
		key: "ABC-1",
		change: "abc-1-fees",
		mr: "7",
		reviewRounds: 3,
		lensRuns: 12,
		focusedPasses: 1,
		greenAttempts: 3,
		workersAvoided: 2,
		measured: null,
	});
	expect(review.keys[0]?.largestPacket?.chars).toBe(PACKET_CHARS_FLAG + 5);
	expect(review.keys[1]).toMatchObject({
		key: "ABC-2",
		change: null,
		reviewRounds: 0,
		greenAttempts: 0,
	});
	expect(review.measuredTotal).toBeNull();
	expect(review.findings.map((finding) => finding.driver)).toEqual([
		"review-rounds",
		"repairs",
		"packet-size",
		"unmeasured",
	]);
});

test("measured usage is totalled, ranked by kind of work, and flags a dominant share and cheaper suggestions", () => {
	const root = repo();
	const review = reviewCosts({
		repoRoot: root,
		ledger: LEDGER,
		observations: [
			observation(
				"abc-1-fees",
				"execute",
				"implement",
				"frontier",
				80_000,
				10_000,
				"standard",
			),
			observation("review-mr-7", "review", "review", "standard", 8_000, 2_000),
			observation("other-run", "execute", "implement", "frontier", 1, 1),
		],
		skipsByRun: new Map(),
	});
	expect(review.measuredTotal).toEqual({
		tasks: 2,
		inputTokens: 88_000,
		outputTokens: 12_000,
		costUsd: 1,
		cheaperSuggested: 1,
	});
	expect(review.byWork[0]).toEqual({
		work: "execute implement on the frontier tier",
		tokens: 90_000,
		share: 0.9,
	});
	const drivers = review.findings.map((finding) => finding.driver);
	expect(drivers).toContain("measured-share");
	expect(drivers).toContain("cheaper-suggested");
	expect(drivers).not.toContain("unmeasured");
});

test("the command prints the review as JSON", () => {
	const root = repo();
	put(root, ".delivery/runs/run-1.md", LEDGER);
	const run = Bun.spawnSync(
		[
			process.execPath,
			join(import.meta.dir, "cost-review.ts"),
			root,
			join(root, ".delivery/runs/run-1.md"),
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	expect(run.exitCode).toBe(0);
	expect(JSON.parse(run.stdout.toString()).keys).toHaveLength(2);
});

test("retro reviews token cost before Present and never trades a gate for a saving", () => {
	const retro = readFileSync(
		join(import.meta.dir, "../../skills/delivery/workflows/retro.md"),
		"utf8",
	);
	const flat = retro.replace(/\s+/g, " ");
	const step = retro.indexOf("### 11. Review token cost");
	expect(step).toBeGreaterThan(retro.indexOf("### 10. Measure look-away"));
	expect(step).toBeLessThan(retro.indexOf("### 12. Present"));
	expect(
		retro
			.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
			.replaceAll('.ts"', ".ts"),
	).toContain(COST_REVIEW_INVOCATION);
	expect(flat).toContain("Never estimate a token figure.");
	expect(flat).toContain(
		"may never remove or weaken a gate, a review, a holdout, or a quality check",
	);
	expect(flat).toContain(
		"Show the look-away figures from step 10 and the token cost from step 11 first",
	);
	expect(flat).toContain(
		"Lessons: one line per token-cost finding presented, with its decision.",
	);
	expect(flat).toContain(
		"Trade a gate, a review, a holdout, or a quality check for a token saving.",
	);
});
