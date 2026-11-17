import { loadConfig } from "./config";
import type { ImplementerTier } from "./levels";

export type Model = "sonnet" | "opus";

export type Step =
	| "assess"
	| "feasibility"
	| "author"
	| "validate"
	| "write-tests"
	| "implement"
	| "self-review"
	| "review";

export interface ModelSelectionInput {
	step: Step;
	complexitySignal?: "low" | "medium" | "high";
	frontierJustification?: string;
	implementerTier?: ImplementerTier;
}

const USAGE = "usage: select-model <step> [complexitySignal] [justification]";

function earnsFrontierImplementer(input: ModelSelectionInput): boolean {
	if (input.implementerTier === "frontier") return true;
	const justified = (input.frontierJustification ?? "").trim() !== "";
	return input.complexitySignal === "high" && justified;
}

// Every step runs on sonnet except two cases. Review is always opus.
// Implementation moves to opus when the run's level asks for a frontier
// implementer, or when feasibility rated the work high and a reason was
// written down. A level can raise a step to opus but never lowers one.
export function selectModel(selection: ModelSelectionInput): Model {
	if (selection.step === "review") return "opus";
	if (selection.step !== "implement") return "sonnet";
	return earnsFrontierImplementer(selection) ? "opus" : "sonnet";
}

if (import.meta.main) {
	const [step, complexity, frontierJustification] = process.argv.slice(2);
	if (!step) {
		console.error(USAGE);
		process.exit(2);
	}
	try {
		const model = selectModel({
			step: step as Step,
			complexitySignal: complexity as ModelSelectionInput["complexitySignal"],
			frontierJustification,
			implementerTier: loadConfig().implementerTier,
		});
		console.log(model);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
