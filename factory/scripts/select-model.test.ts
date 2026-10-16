import { expect, test } from "bun:test";
import { selectModel } from "./select-model";

test("review always uses opus", () => {
	expect(selectModel({ step: "review" })).toBe("opus");
});

test("default steps use sonnet", () => {
	expect(selectModel({ step: "assess" })).toBe("sonnet");
	expect(selectModel({ step: "write-tests" })).toBe("sonnet");
	expect(selectModel({ step: "implement" })).toBe("sonnet");
});

test("implement uses opus only with high complexity AND a justification", () => {
	expect(
		selectModel({
			step: "implement",
			complexitySignal: "high",
			opusJustification: "intricate locking",
		}),
	).toBe("opus");
	expect(selectModel({ step: "implement", complexitySignal: "high" })).toBe(
		"sonnet",
	); // no justification
	expect(
		selectModel({
			step: "implement",
			complexitySignal: "high",
			opusJustification: "   ",
		}),
	).toBe("sonnet"); // blank
	expect(
		selectModel({
			step: "implement",
			complexitySignal: "low",
			opusJustification: "x",
		}),
	).toBe("sonnet"); // not high
});

test("live selection never returns a fast catalogue model", () => {
	const models = [
		selectModel({ step: "assess" }),
		selectModel({ step: "implement" }),
		selectModel({
			step: "implement",
			complexitySignal: "high",
			opusJustification: "intricate locking",
		}),
		selectModel({ step: "review" }),
	];
	expect(models.every((model) => model === "sonnet" || model === "opus")).toBe(
		true,
	);
	expect(models).not.toContain("composer-1");
	expect(models).not.toContain("haiku");
});
