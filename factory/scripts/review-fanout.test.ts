import { expect, test } from "bun:test";
import { join } from "node:path";
import {
	REVIEW_LENSES,
	type ReviewFanoutInput,
	measureReviewableDiff,
	planAdjudication,
	planReviewFanout,
} from "./review-fanout";

const smallInput: ReviewFanoutInput = {
	changedFiles: 2,
	changedLines: 49,
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-facing"],
};

test("small reversible changes use the two essential lenses", () => {
	expect(planReviewFanout(smallInput)).toEqual({
		mode: "small",
		lenses: ["correctness-security", "tests-specification"],
		reason: "small reversible change with no sensitive surface",
	});
});

test("every threshold boundary fails to the full review", () => {
	for (const input of [
		{ ...smallInput, changedFiles: 3 },
		{ ...smallInput, changedLines: 50 },
		{ ...smallInput, reversible: false },
		{ ...smallInput, classificationComplete: false },
	]) {
		const plan = planReviewFanout(input);
		expect(plan.mode).toBe("full");
		expect(plan.lenses).toEqual([...REVIEW_LENSES]);
	}
});

test("every sensitive surface forces all four lenses", () => {
	for (const surface of [
		"data",
		"contract",
		"config",
		"auth",
		"infra",
	] as const) {
		const plan = planReviewFanout({ ...smallInput, surfaces: [surface] });
		expect(plan.mode).toBe("full");
		expect(plan.lenses).toEqual([...REVIEW_LENSES]);
		expect(plan.reason).toContain(surface);
	}
});

test("invalid and unknown classifications fail closed", () => {
	expect(() => planReviewFanout({ ...smallInput, changedFiles: -1 })).toThrow();
	expect(() =>
		planReviewFanout({
			...smallInput,
			surfaces: ["unknown"],
		} as never),
	).toThrow();
});

test("the CLI emits the deterministic plan", async () => {
	const inputPath = join(import.meta.dir, ".review-fanout-input.test.json");
	try {
		await Bun.write(inputPath, JSON.stringify(smallInput));
		const proc = Bun.spawn(
			["bun", join(import.meta.dir, "review-fanout.ts"), inputPath],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		expect(JSON.parse(await new Response(proc.stdout).text())).toMatchObject({
			mode: "small",
			lenses: ["correctness-security", "tests-specification"],
		});
	} finally {
		await Bun.file(inputPath).delete();
	}
});

test("spec and delivery artefacts do not count toward the measured diff", () => {
	const numstat = [
		"4\t2\tsrc/slug.ts",
		"30\t0\ttest/slug.test.ts",
		"60\t0\topenspec/changes/change-tb-1/proposal.md",
		"2\t0\topenspec/changes/change-tb-1/.openspec.yaml",
		"1\t0\t.delivery/routing/model-inventory.json",
		"-\t-\tassets/logo.png",
	].join("\n");
	expect(measureReviewableDiff(numstat)).toEqual({
		changedFiles: 3,
		changedLines: 37,
		paths: ["src/slug.ts", "test/slug.test.ts", "assets/logo.png"],
		excluded: [
			"openspec/changes/change-tb-1/proposal.md",
			"openspec/changes/change-tb-1/.openspec.yaml",
			".delivery/routing/model-inventory.json",
		],
	});
});

test("a path that only resembles a spec directory is still counted", () => {
	expect(
		measureReviewableDiff("3\t1\tsrc/openspec/parser.ts\n").changedFiles,
	).toBe(1);
});

test("an unreadable numstat line fails closed", () => {
	expect(() => measureReviewableDiff("garbage")).toThrow();
});

test("adjudication escalates only when a candidate can block", () => {
	expect(planAdjudication({ candidates: [] }).mode).toBe("none");
	expect(
		planAdjudication({
			candidates: [{ severity: "Low" }, { severity: "Low" }],
		}).mode,
	).toBe("standard");
	for (const severity of ["Medium", "High", "Critical"] as const) {
		expect(
			planAdjudication({
				candidates: [{ severity: "Low" }, { severity }],
			}).mode,
		).toBe("main");
	}
});

test("an unknown candidate severity fails closed", () => {
	expect(() =>
		planAdjudication({ candidates: [{ severity: "Nit" }] } as never),
	).toThrow();
});
