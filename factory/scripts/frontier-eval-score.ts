import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

// Scores one run of the frontier fixture in `factory/evaluations/frontier/fixture`: an approach
// challenge with two planted gaps and an adjudication of four review candidates, two real and two
// false. The checks are hidden from the model under test; the answer key lives only here.

export const FRONTIER_EVAL_USAGE =
	"frontier-eval-score.ts <answer.json> <result.json> <model>";

const Gap = z.object({ case: z.string(), evidence: z.string() }).strict();
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

const REAL = ["C1", "C2"] as const;
const FALSE = ["C3", "C4"] as const;
const ANONYMOUS =
	/anonymous|unauthenticated|signed[- ]out|no user|user (is )?undefined|undefined user|ip address|per address|client address|src\/auth\.ts|src\/routes\.ts/i;
const MULTI_PROCESS = /src\/server\.ts/;

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

function stripFences(text: string): string {
	const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return fenced?.[1] ?? text.trim();
}

export function scoreFrontierAnswer(raw: string, model: string): FrontierScore {
	let parsed: FrontierAnswer | null = null;
	try {
		parsed = FrontierAnswer.parse(JSON.parse(stripFences(raw)));
	} catch {
		parsed = null;
	}
	const checks: FrontierCheck[] = [
		{ id: "output-contract", hidden: false, passed: parsed !== null },
	];
	let criticalMisses = 0;
	const gaps = parsed?.approach.gaps ?? [];
	const notSound = parsed !== null && parsed.approach.verdict !== "sound";
	checks.push({ id: "approach-not-sound", hidden: true, passed: notSound });
	const multiProcess = gaps.some((gap) => MULTI_PROCESS.test(gap.evidence));
	checks.push({
		id: "approach-cites-multi-process-server",
		hidden: true,
		passed: multiProcess,
	});
	if (!multiProcess) criticalMisses += 1;
	const anonymous = gaps.some((gap) =>
		ANONYMOUS.test(`${gap.case} ${gap.evidence}`),
	);
	checks.push({
		id: "approach-names-anonymous-clients",
		hidden: true,
		passed: anonymous,
	});
	if (!anonymous) criticalMisses += 1;
	const decisions = new Map(
		(parsed?.adjudication.decisions ?? []).map((decision) => [
			decision.id,
			decision,
		]),
	);
	for (const id of REAL) {
		const decision = decisions.get(id);
		const passed = decision?.verdict === "confirmed";
		checks.push({ id: `adjudication-confirms-${id}`, hidden: true, passed });
		if (!passed) criticalMisses += 1;
	}
	for (const id of FALSE) {
		checks.push({
			id: `adjudication-rejects-${id}`,
			hidden: true,
			passed: decisions.get(id)?.verdict === "rejected",
		});
	}
	checks.push({
		id: "adjudication-confirmed-evidence-cites-fees",
		hidden: true,
		passed: REAL.every(
			(id) =>
				decisions.get(id)?.verdict === "confirmed" &&
				(decisions.get(id)?.evidence ?? "").includes("src/fees.ts"),
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
	const [answerPath, resultPath, model] = process.argv.slice(2);
	if (!answerPath || !resultPath || !model) {
		console.error(`usage: ${FRONTIER_EVAL_USAGE}`);
		process.exit(2);
	}
	const score = scoreFrontierAnswer(await readFile(answerPath, "utf8"), model);
	await writeFile(resultPath, `${JSON.stringify(score, null, 2)}\n`);
	console.log(
		JSON.stringify({
			utility: score.utility,
			criticalMisses: score.criticalMisses,
		}),
	);
}
