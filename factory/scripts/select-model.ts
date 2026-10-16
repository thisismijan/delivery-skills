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
}

// PRD §9: Sonnet by default; review always Opus; implementation may use Opus
// only when complexity is high AND a non-empty justification is supplied.
export function selectModel(input: ModelSelectionInput): Model {
	if (input.step === "review") return "opus";
	if (
		input.step === "implement" &&
		input.complexitySignal === "high" &&
		(input.frontierJustification?.trim().length ?? 0) > 0
	) {
		return "opus";
	}
	return "sonnet";
}

if (import.meta.main) {
	const step = process.argv[2] as Step | undefined;
	const complexitySignal = process.argv[3] as
		| "low"
		| "medium"
		| "high"
		| undefined;
	const frontierJustification = process.argv[4];
	if (!step) {
		console.error(
			"usage: select-model <step> [complexitySignal] [justification]",
		);
		process.exit(2);
	}
	console.log(selectModel({ step, complexitySignal, frontierJustification }));
}
