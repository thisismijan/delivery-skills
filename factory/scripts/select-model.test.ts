import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type ModelSelectionInput, selectModel } from "./select-model";

const implement = (
	extra: Omit<ModelSelectionInput, "step">,
): ModelSelectionInput => ({ step: "implement", ...extra });

describe("selectModel", () => {
	test("review runs on opus", () => {
		const reviewer = selectModel({ step: "review" });
		expect(reviewer).toBe("opus");
	});

	test.each(["assess", "write-tests", "implement"] as const)(
		"%s runs on sonnet with nothing extra",
		(step) => {
			expect(selectModel({ step })).toBe("sonnet");
		},
	);

	test("high complexity with a written reason moves implementation to opus", () => {
		expect(
			selectModel(
				implement({
					complexitySignal: "high",
					frontierJustification: "lock ordering across two queues",
				}),
			),
		).toBe("opus");
	});

	test.each([
		["no reason", implement({ complexitySignal: "high" })],
		[
			"a blank reason",
			implement({ complexitySignal: "high", frontierJustification: "  \t " }),
		],
		[
			"complexity below high",
			implement({ complexitySignal: "low", frontierJustification: "because" }),
		],
	])("implementation stays on sonnet with %s", (_label, input) => {
		expect(selectModel(input)).toBe("sonnet");
	});

	test("a frontier implementer level raises implementation but no other step", () => {
		expect(selectModel(implement({ implementerTier: "frontier" }))).toBe(
			"opus",
		);
		expect(
			selectModel({ step: "write-tests", implementerTier: "frontier" }),
		).toBe("sonnet");
		expect(selectModel(implement({ implementerTier: "measured" }))).toBe(
			"sonnet",
		);
	});

	test("live selection only ever names sonnet or opus", () => {
		const picked = [
			selectModel({ step: "assess" }),
			selectModel(implement({})),
			selectModel(
				implement({ complexitySignal: "high", frontierJustification: "why" }),
			),
			selectModel({ step: "review" }),
		];
		for (const model of picked) expect(["sonnet", "opus"]).toContain(model);
		for (const fast of ["composer-1", "haiku"]) {
			expect(picked).not.toContain(fast);
		}
	});
});

describe("select-model command", () => {
	const script = join(import.meta.dir, "select-model.ts");

	test("prints the model for a step and exits 2 without one", () => {
		const review = Bun.spawnSync(["bun", script, "review"], { stdout: "pipe" });
		expect(review.exitCode).toBe(0);
		expect(review.stdout.toString().trim()).toBe("opus");
		const bare = Bun.spawnSync(["bun", script], { stderr: "pipe" });
		expect(bare.exitCode).toBe(2);
		expect(bare.stderr.toString()).toContain("usage: select-model");
	});
});
