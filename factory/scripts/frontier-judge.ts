import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { helpText, isHelpRequest } from "./cli-help";
import {
	FRONTIER_FIXTURES,
	FRONTIER_KEYS,
	type FrontierFixture,
	Judgement,
	type RubricItem,
	answerId,
	judgementProblem,
	parseFrontierAnswer,
	scoreFrontierAnswer,
	stripFences,
} from "./frontier-eval-score";
import { type JudgeSelfTest, judgeSelfTestProblem } from "./judge-self-test";

// The judge that decides whether a frontier answer's gaps find the planted problems. It reads only
// the rubric and the answer's gaps, never the fixture, and its scores count only after it agrees
// with every label in the fixture's calibration set.

export const FRONTIER_JUDGE_USAGE = [
	"frontier-judge.ts prompt <fixture> <answer.json>",
	"frontier-judge.ts calibration <fixture> <out-dir>",
	"frontier-judge.ts self-test <fixture> <judge-model> <judgements-dir> <self-test.json>",
];

const FACTORY_ROOT = join(import.meta.dir, "..");

export const CALIBRATION_PATHS: Record<FrontierFixture, string> = {
	"rate-limit": "evaluations/frontier/judge-calibration.json",
	webhook: "evaluations/frontier/webhook/judge-calibration.json",
	renewals: "evaluations/frontier/renewals/judge-calibration.json",
};

// Answers with known decisions. `good` meets every planted item and raises no false alarm; `bad`
// meets no planted item. A `labelled` case decides only the items it lists, so an answer whose
// reading is honestly arguable on one item can still calibrate the others.
export const JudgeCalibration = z
	.object({
		fixture: z.enum(FRONTIER_FIXTURES),
		cases: z.array(
			z
				.object({
					name: z.string().regex(/^[a-z0-9.-]+$/),
					role: z.enum(["good", "bad", "labelled"]),
					source: z.string().min(1),
					answer: z.unknown(),
					expected: z.record(z.boolean()),
				})
				.strict(),
		),
	})
	.strict();
export type JudgeCalibration = z.infer<typeof JudgeCalibration>;

export function calibrationAnswerText(answer: unknown): string {
	return `${JSON.stringify(answer, null, 2)}\n`;
}

// Why a calibration set cannot test a judge, or undefined when it can.
export function calibrationProblem(
	calibration: JudgeCalibration,
): string | undefined {
	const key = FRONTIER_KEYS[calibration.fixture];
	const planted = key.gaps.map((item) => item.id);
	const alarms = key.falseAlarms.map((item) => item.id);
	const names = calibration.cases.map((entry) => entry.name);
	if (new Set(names).size !== names.length) return "case names must be unique";
	for (const role of ["good", "bad"] as const) {
		const count = calibration.cases.filter(
			(entry) => entry.role === role,
		).length;
		if (count !== 1) return `the set needs exactly one ${role} case`;
	}
	for (const entry of calibration.cases) {
		const answer = parseFrontierAnswer(calibrationAnswerText(entry.answer));
		if (!answer) return `${entry.name} is not a valid answer`;
		if (answer.approach.gaps.length === 0) {
			return `${entry.name} has no gaps to judge`;
		}
		const labels = Object.keys(entry.expected);
		const unknown = labels.find((id) => ![...planted, ...alarms].includes(id));
		if (unknown)
			return `${entry.name} labels ${unknown}, which is not in the rubric`;
		if (labels.length === 0) return `${entry.name} labels nothing`;
		if (entry.role === "good") {
			const wrong = [...planted, ...alarms].find(
				(id) => entry.expected[id] !== planted.includes(id),
			);
			if (wrong)
				return `the good case must meet every planted item and no false alarm (${wrong})`;
		}
		if (entry.role === "bad") {
			const wrong = planted.find((id) => entry.expected[id] !== false);
			if (wrong) return `the bad case must meet no planted item (${wrong})`;
		}
	}
	return undefined;
}

function rubricSection(item: RubricItem, kind: string): string {
	return [
		`### ${item.id} (${kind})`,
		"",
		`Counts when: ${item.counts}`,
		"",
		`Does not count when: ${item.doesNotCount}`,
	].join("\n");
}

export function judgePrompt(fixture: FrontierFixture, raw: string): string {
	const key = FRONTIER_KEYS[fixture];
	const answer = parseFrontierAnswer(raw);
	if (!answer)
		throw new Error(
			"the answer is outside the output contract; it needs no judge",
		);
	const id = answerId(raw);
	const items = [...key.gaps, ...key.falseAlarms];
	return [
		"# Judge one answer",
		"",
		"An answer to a code-review task lists gaps it found in a planned change. Decide, for each rubric item below, whether any of the answer's gaps meets it.",
		"",
		"Decide by substance, not wording. A gap that describes the problem in its own words meets the item. A gap that only names the topic, or describes a different problem, does not. Judge only the gaps listed here, and use nothing else you know.",
		"",
		"For a planted problem, `met` is true when at least one gap finds it. For a false alarm, `met` is true when at least one gap raises it.",
		"",
		"## Rubric",
		"",
		...key.gaps.map((item) => rubricSection(item, "planted problem")),
		...key.falseAlarms.map((item) => rubricSection(item, "false alarm")),
		"",
		`## The answer's gaps (answer ${id})`,
		"",
		...answer.approach.gaps.map(
			(gap, index) =>
				`${index}. case: ${gap.case}\n   evidence: ${gap.evidence}`,
		),
		"",
		"## Reply",
		"",
		"Reply with only this JSON object: no prose and no code fences.",
		"",
		JSON.stringify({
			answerId: id,
			items: [{ id: "<rubric id>", met: true, gap: 0, reason: "one sentence" }],
		}),
		"",
		`Give one item per rubric id, in this order: ${items.map((item) => item.id).join(", ")}. \`gap\` is the index of the gap that meets the item, or null when \`met\` is false.`,
		"",
	].join("\n");
}

export type SelfTestOutcome =
	| { selfTest: JudgeSelfTest }
	| { problems: string[] };

export function judgeSelfTest(
	calibration: JudgeCalibration,
	judgeModel: string,
	judgements: Readonly<Record<string, string | undefined>>,
): SelfTestOutcome {
	const setProblem = calibrationProblem(calibration);
	if (setProblem) return { problems: [setProblem] };
	const { fixture } = calibration;
	const problems: string[] = [];
	const utilities: Record<string, number> = {};
	for (const entry of calibration.cases) {
		const raw = calibrationAnswerText(entry.answer);
		const text = judgements[entry.name];
		if (text === undefined) {
			problems.push(`${entry.name}: no judgement`);
			continue;
		}
		let judgement: Judgement;
		try {
			judgement = Judgement.parse(JSON.parse(stripFences(text)));
		} catch {
			problems.push(`${entry.name}: the judgement is outside its contract`);
			continue;
		}
		const unusable = judgementProblem(raw, fixture, judgement);
		if (unusable) {
			problems.push(`${entry.name}: ${unusable}`);
			continue;
		}
		for (const [id, expected] of Object.entries(entry.expected)) {
			const met = judgement.items.find((item) => item.id === id)?.met;
			if (met !== expected) {
				problems.push(
					`${entry.name}: ${id} should be ${expected ? "met" : "not met"}, the judge said ${met ? "met" : "not met"}`,
				);
			}
		}
		utilities[entry.name] = scoreFrontierAnswer(
			raw,
			judgeModel,
			fixture,
			judgement,
		).utility;
	}
	if (problems.length > 0) return { problems };
	const good = calibration.cases.find((entry) => entry.role === "good");
	const bad = calibration.cases.find((entry) => entry.role === "bad");
	const selfTest: JudgeSelfTest = {
		model: judgeModel,
		goodReference: `${fixture}:${good?.name}`,
		badReference: `${fixture}:${bad?.name}`,
		goodScore: utilities[good?.name ?? ""] ?? 0,
		badScore: utilities[bad?.name ?? ""] ?? 0,
	};
	const refused = judgeSelfTestProblem({ scoredBy: "judge", selfTest });
	return refused ? { problems: [refused] } : { selfTest };
}

export async function loadCalibration(
	fixture: FrontierFixture,
): Promise<JudgeCalibration> {
	const calibration = JudgeCalibration.parse(
		JSON.parse(
			await readFile(join(FACTORY_ROOT, CALIBRATION_PATHS[fixture]), "utf8"),
		),
	);
	if (calibration.fixture !== fixture) {
		throw new Error(
			`${CALIBRATION_PATHS[fixture]} is the ${calibration.fixture} calibration`,
		);
	}
	return calibration;
}

async function readIfPresent(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return undefined;
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const usage = () => {
		console.error(
			FRONTIER_JUDGE_USAGE.map((line, index) =>
				index === 0 ? `usage: ${line}` : `       ${line}`,
			).join("\n"),
		);
		process.exit(2);
	};
	if (isHelpRequest(args)) {
		console.log(
			helpText({
				usage: FRONTIER_JUDGE_USAGE,
				inputs: { prompt: null, calibration: null, "self-test": Judgement },
				notes: [
					"prompt prints the judge's prompt for one answer. Start a judge with only that prompt and save its reply as the run's judgement.",
					"calibration writes <case>.answer.json and <case>.prompt.md for every calibration case. Judge each prompt with the same judge model, saving <case>.judgement.json in one directory.",
					"self-test checks those judgements against the labels and writes the self-test the scorer requires, or lists every disagreement and exits 1.",
				],
			}),
		);
		process.exit(0);
	}
	const [command, fixtureArg] = args;
	const fixture = fixtureArg as FrontierFixture;
	if (!FRONTIER_FIXTURES.includes(fixture)) usage();
	if (command === "prompt" && args[2]) {
		process.stdout.write(judgePrompt(fixture, await readFile(args[2], "utf8")));
	} else if (command === "calibration" && args[2]) {
		const outDir = args[2];
		await mkdir(outDir, { recursive: true });
		const calibration = await loadCalibration(fixture);
		for (const entry of calibration.cases) {
			const raw = calibrationAnswerText(entry.answer);
			await writeFile(join(outDir, `${entry.name}.answer.json`), raw);
			await writeFile(
				join(outDir, `${entry.name}.prompt.md`),
				judgePrompt(fixture, raw),
			);
		}
		console.log(`${calibration.cases.length} calibration prompts in ${outDir}`);
	} else if (command === "self-test" && args[2] && args[3] && args[4]) {
		const [, , judgeModel, judgementsDir, outPath] = args;
		const calibration = await loadCalibration(fixture);
		const judgements: Record<string, string | undefined> = {};
		for (const entry of calibration.cases) {
			judgements[entry.name] = await readIfPresent(
				join(judgementsDir as string, `${entry.name}.judgement.json`),
			);
		}
		const outcome = judgeSelfTest(
			calibration,
			judgeModel as string,
			judgements,
		);
		if ("problems" in outcome) {
			console.error(
				`the judge ${judgeModel} failed its self-test on ${fixture}:\n${outcome.problems.map((problem) => `- ${problem}`).join("\n")}`,
			);
			process.exit(1);
		}
		await writeFile(
			outPath as string,
			`${JSON.stringify(outcome.selfTest, null, 2)}\n`,
		);
		console.log(JSON.stringify(outcome.selfTest));
	} else {
		usage();
	}
}
