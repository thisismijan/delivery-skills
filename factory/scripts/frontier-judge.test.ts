import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	FRONTIER_FIXTURES,
	FRONTIER_KEYS,
	type FrontierFixture,
	answerId,
	parseFrontierAnswer,
	rubricIds,
	scoreFrontierAnswer,
} from "./frontier-eval-score";
import {
	type JudgeCalibration,
	calibrationAnswerText,
	calibrationProblem,
	judgePrompt,
	judgeSelfTest,
	loadCalibration,
} from "./frontier-judge";

// What a judge that agrees with every label would reply for one calibration case. Unlabelled
// items are decided as not met, which the self-test does not check.
function faithfulReply(
	fixture: FrontierFixture,
	entry: JudgeCalibration["cases"][number],
	flip?: string,
): string {
	const raw = calibrationAnswerText(entry.answer);
	return JSON.stringify({
		answerId: answerId(raw),
		items: rubricIds(fixture).map((id) => {
			const met = (entry.expected[id] ?? false) !== (id === flip);
			return { id, met, gap: met ? 0 : null, reason: "r" };
		}),
	});
}

function faithfulReplies(
	calibration: JudgeCalibration,
	flip?: { name: string; id: string },
): Record<string, string> {
	return Object.fromEntries(
		calibration.cases.map((entry) => [
			entry.name,
			faithfulReply(
				calibration.fixture,
				entry,
				flip?.name === entry.name ? flip.id : undefined,
			),
		]),
	);
}

test("every fixture has a valid calibration set whose good reference scores full utility", async () => {
	for (const fixture of FRONTIER_FIXTURES) {
		const calibration = await loadCalibration(fixture);
		expect(calibrationProblem(calibration)).toBeUndefined();
		const good = calibration.cases.find((entry) => entry.role === "good");
		if (!good) throw new Error(`${fixture} has no good case`);
		const raw = calibrationAnswerText(good.answer);
		const reply = JSON.parse(faithfulReply(fixture, good));
		expect(scoreFrontierAnswer(raw, "judge", fixture, reply).utility).toBe(1);
	}
});

test("the webhook calibration holds each benchmark answer the keyword key misread", async () => {
	const calibration = await loadCalibration("webhook");
	const names = calibration.cases.map((entry) => entry.name);
	for (const name of [
		"composer-2.5-run-2",
		"kimi-k2.7-code-run-2",
		"gemini-3.1-pro-run-2",
		"gemini-3.1-pro-run-3",
	]) {
		expect(names).toContain(name);
	}
	const gemini = calibration.cases.find(
		(entry) => entry.name === "gemini-3.1-pro-run-2",
	);
	expect(gemini?.expected["approach-finds-refund-event-name-mismatch"]).toBe(
		false,
	);
});

test("the judge's prompt carries the rubric, every gap, and the answer's id, and refuses an answer outside the contract", async () => {
	const calibration = await loadCalibration("renewals");
	const good = calibration.cases[0];
	const raw = calibrationAnswerText(good?.answer);
	const prompt = judgePrompt("renewals", raw);
	for (const item of [
		...FRONTIER_KEYS.renewals.gaps,
		...FRONTIER_KEYS.renewals.falseAlarms,
	]) {
		expect(prompt).toContain(`### ${item.id}`);
		expect(prompt).toContain(item.counts);
		expect(prompt).toContain(item.doesNotCount);
	}
	const gaps = parseFrontierAnswer(raw)?.approach.gaps ?? [];
	gaps.forEach((gap, index) => {
		expect(prompt).toContain(`${index}. case: ${gap.case}`);
	});
	expect(prompt).toContain(answerId(raw));
	expect(prompt).not.toContain("C4");
	expect(() => judgePrompt("renewals", "not json")).toThrow(
		"outside the output contract",
	);
});

test("the prompt command says plainly when an answer needs no judge", async () => {
	const dir = await mkdtemp(join(tmpdir(), "frontier-judge-"));
	await writeFile(join(dir, "answer.json"), "Looking at this: {}");
	const result = Bun.spawnSync(
		[
			"bun",
			join(import.meta.dir, "frontier-judge.ts"),
			"prompt",
			"webhook",
			join(dir, "answer.json"),
		],
		{ env: process.env },
	);
	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString().trim()).toBe(
		"the answer is outside the output contract, so it scores without a judge",
	);
});

test("a judge that agrees with every label passes its self-test, ranked good above bad", async () => {
	for (const fixture of FRONTIER_FIXTURES) {
		const calibration = await loadCalibration(fixture);
		const outcome = judgeSelfTest(
			calibration,
			"judge-model",
			faithfulReplies(calibration),
		);
		if (!("selfTest" in outcome)) throw new Error(outcome.problems.join("; "));
		expect(outcome.selfTest).toMatchObject({
			model: "judge-model",
			goodReference: `${fixture}:good`,
			badReference: `${fixture}:bad`,
			goodScore: 1,
		});
		expect(outcome.selfTest.badScore).toBeLessThan(1);
	}
});

test("one disagreement, a missing judgement, or a judgement of the wrong answer fails the self-test", async () => {
	const calibration = await loadCalibration("webhook");
	const flipped = judgeSelfTest(
		calibration,
		"j",
		faithfulReplies(calibration, {
			name: "composer-2.5-run-2",
			id: "approach-finds-concurrent-duplicate-race",
		}),
	);
	expect(flipped).toEqual({
		problems: [
			"composer-2.5-run-2: approach-finds-concurrent-duplicate-race should be met, the judge said not met",
		],
	});
	const replies: Record<string, string | undefined> =
		faithfulReplies(calibration);
	replies["near-misses"] = undefined;
	replies.bad = replies.good;
	const outcome = judgeSelfTest(calibration, "j", replies);
	expect("problems" in outcome && outcome.problems).toEqual([
		expect.stringContaining("bad: the judgement is for answer"),
		"near-misses: no judgement",
	]);
	const fenced = faithfulReplies(calibration);
	fenced.good = `\`\`\`json\n${fenced.good}\n\`\`\``;
	expect("selfTest" in judgeSelfTest(calibration, "j", fenced)).toBe(true);
});

test("a calibration set is refused when its good or bad case is malformed or a label is not in the rubric", async () => {
	const calibration = await loadCalibration("rate-limit");
	const good = calibration.cases.find((entry) => entry.role === "good");
	if (!good) throw new Error("rate-limit has no good case");
	const withCase = (
		change: (copy: JudgeCalibration) => void,
	): string | undefined => {
		const copy = structuredClone(calibration);
		change(copy);
		return calibrationProblem(copy);
	};
	expect(
		withCase((copy) => {
			copy.cases.push({ ...good, name: "second-good" });
		}),
	).toBe("the set needs exactly one good case");
	expect(
		withCase((copy) => {
			const entry = copy.cases.find((item) => item.role === "good");
			if (entry) entry.expected["approach-names-anonymous-clients"] = false;
		}),
	).toContain("the good case must meet every planted item");
	expect(
		withCase((copy) => {
			const entry = copy.cases.find((item) => item.role === "labelled");
			if (entry) entry.expected["approach-finds-something-else"] = true;
		}),
	).toContain("not in the rubric");
});
