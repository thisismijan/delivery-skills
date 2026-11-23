import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

// Scores one run of a frontier fixture under `factory/evaluations/frontier`: an approach challenge
// with planted gaps and an adjudication of review candidates, some real and some false. The
// checks are hidden from the model under test; each fixture's answer key lives only here.

export const FRONTIER_EVAL_USAGE =
	"frontier-eval-score.ts <answer.json> <result.json> <model> [rate-limit|webhook]";
export const FRONTIER_FIXTURES = ["rate-limit", "webhook"] as const;
export type FrontierFixture = (typeof FRONTIER_FIXTURES)[number];

const Gap = z.object({ case: z.string(), evidence: z.string() }).strict();
type Gap = z.infer<typeof Gap>;

export const FrontierAnswer = z
	.object({
		approach: z
			.object({
				verdict: z.enum(["sound", "gaps", "rethink"]),
				gaps: z.array(Gap),
				rethink: z
					.object({ problem: z.string(), alternative: z.string() })
					.strict()
					.nullable(),
				reasoning: z.string(),
			})
			.strict(),
		adjudication: z
			.object({
				decisions: z.array(
					z
						.object({
							id: z.string(),
							verdict: z.enum(["confirmed", "rejected"]),
							evidence: z.string(),
						})
						.strict(),
				),
			})
			.strict(),
	})
	.strict();
export type FrontierAnswer = z.infer<typeof FrontierAnswer>;

const text = (gap: Gap) => `${gap.case} ${gap.evidence}`;

// A fixture's answer key: the planted gaps (missing one is a critical miss), findings that would
// be false alarms, and which review candidates are real.
interface AnswerKey {
	gaps: Array<{ id: string; found: (gap: Gap) => boolean }>;
	falseAlarms: Array<{ id: string; raised: (gap: Gap) => boolean }>;
	real: readonly string[];
	notReal: readonly string[];
	file: string;
	evidenceCheck: string;
}

const KEYS: Record<FrontierFixture, AnswerKey> = {
	"rate-limit": {
		gaps: [
			{
				id: "approach-cites-multi-process-server",
				found: (gap) => /src\/server\.ts/.test(gap.evidence),
			},
			{
				id: "approach-names-anonymous-clients",
				found: (gap) =>
					/anonymous|unauthenticated|signed[- ]out|no user|user (is )?undefined|undefined user|ip address|per address|client address|src\/auth\.ts|src\/routes\.ts/i.test(
						text(gap),
					),
			},
		],
		falseAlarms: [],
		real: ["C1", "C2"],
		notReal: ["C3", "C4"],
		file: "src/fees.ts",
		evidenceCheck: "adjudication-confirmed-evidence-cites-fees",
	},
	webhook: {
		gaps: [
			{
				id: "approach-finds-concurrent-duplicate-race",
				found: (gap) =>
					/concurren|race|in parallel|simultaneous|at the same time|at once|overlap/i.test(
						text(gap),
					) && /src\/(queue|webhook)\.ts/.test(gap.evidence),
			},
			{
				id: "approach-finds-unsigned-event-id-header",
				found: (gap) =>
					(/x-event-id|header/i.test(text(gap)) &&
						/sign|hmac|forg|spoof|attacker|replay|tamper|not covered/i.test(
							text(gap),
						)) ||
					/src\/signature\.ts/.test(gap.evidence),
			},
			{
				id: "approach-finds-refund-event-name-mismatch",
				found: (gap) =>
					/charge\.refunded/.test(text(gap)) ||
					/docs\/provider-events\.md/.test(gap.evidence),
			},
		],
		falseAlarms: [
			{
				id: "approach-raises-no-multi-process-false-alarm",
				raised: (gap) =>
					/cluster|worker process|multiple (processes|instances)|multi-?process|several instances|horizontal/i.test(
						gap.case,
					),
			},
		],
		real: ["C3", "C5"],
		notReal: ["C1", "C2", "C4"],
		file: "src/ledger.ts",
		evidenceCheck: "adjudication-confirmed-evidence-cites-ledger",
	},
};

export interface FrontierCheck {
	id: string;
	hidden: boolean;
	passed: boolean;
}

export interface FrontierScore {
	utility: number;
	criticalMisses: number;
	repairAttempts: number;
	checks: FrontierCheck[];
	selectedWorkerModel: string;
}

function stripFences(raw: string): string {
	const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return fenced?.[1] ?? raw.trim();
}

export function scoreFrontierAnswer(
	raw: string,
	model: string,
	fixture: FrontierFixture = "rate-limit",
): FrontierScore {
	const key = KEYS[fixture];
	let parsed: FrontierAnswer | null = null;
	try {
		parsed = FrontierAnswer.parse(JSON.parse(stripFences(raw)));
	} catch {
		parsed = null;
	}
	const checks: FrontierCheck[] = [
		{ id: "output-contract", hidden: false, passed: parsed !== null },
		{
			id: "approach-not-sound",
			hidden: true,
			passed: parsed !== null && parsed.approach.verdict !== "sound",
		},
	];
	let criticalMisses = 0;
	const gaps = parsed?.approach.gaps ?? [];
	for (const planted of key.gaps) {
		const found = gaps.some((gap) => planted.found(gap));
		checks.push({ id: planted.id, hidden: true, passed: found });
		if (!found) criticalMisses += 1;
	}
	for (const alarm of key.falseAlarms) {
		checks.push({
			id: alarm.id,
			hidden: true,
			passed: parsed !== null && !gaps.some((gap) => alarm.raised(gap)),
		});
	}
	const decisions = new Map(
		(parsed?.adjudication.decisions ?? []).map((decision) => [
			decision.id,
			decision,
		]),
	);
	for (const id of key.real) {
		const passed = decisions.get(id)?.verdict === "confirmed";
		checks.push({ id: `adjudication-confirms-${id}`, hidden: true, passed });
		if (!passed) criticalMisses += 1;
	}
	for (const id of key.notReal) {
		checks.push({
			id: `adjudication-rejects-${id}`,
			hidden: true,
			passed: decisions.get(id)?.verdict === "rejected",
		});
	}
	checks.push({
		id: key.evidenceCheck,
		hidden: true,
		passed: key.real.every(
			(id) =>
				decisions.get(id)?.verdict === "confirmed" &&
				(decisions.get(id)?.evidence ?? "").includes(key.file),
		),
	});
	const passedCount = checks.filter((check) => check.passed).length;
	return {
		utility: Math.max(passedCount / checks.length, 0.01),
		criticalMisses,
		repairAttempts: 0,
		checks,
		selectedWorkerModel: model,
	};
}

if (import.meta.main) {
	const [answerPath, resultPath, model, fixtureArg] = process.argv.slice(2);
	const fixture = (fixtureArg ?? "rate-limit") as FrontierFixture;
	if (
		!answerPath ||
		!resultPath ||
		!model ||
		!FRONTIER_FIXTURES.includes(fixture)
	) {
		console.error(`usage: ${FRONTIER_EVAL_USAGE}`);
		process.exit(2);
	}
	const score = scoreFrontierAnswer(
		await readFile(answerPath, "utf8"),
		model,
		fixture,
	);
	await writeFile(resultPath, `${JSON.stringify(score, null, 2)}\n`);
	console.log(
		JSON.stringify({
			utility: score.utility,
			criticalMisses: score.criticalMisses,
		}),
	);
}
