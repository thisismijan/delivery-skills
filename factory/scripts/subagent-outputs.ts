// Every subagent output, by whether it decides a stage. A gating output that
// fails to parse stops the run at once. An advisory output gets one repair
// turn from the same subagent, with no new work, before it fails closed.
export type OutputKind = "gating" | "advisory";

export const REPAIR_TURNS = 1;

export const SUBAGENT_OUTPUTS: Readonly<Record<string, OutputKind>> = {
	"ticket-assessor": "gating",
	"feasibility-analyst": "gating",
	"approach-challenger": "gating",
	"explain-back-reader": "gating",
	"first-pass-reviewer": "gating",
	"holdout-reviewer": "gating",
	"comment-assessor": "gating",
	adjudication: "gating",
	"review-lens": "advisory",
	"focused-pass": "advisory",
	"groom-explorer": "advisory",
	"task-profile-controller": "advisory",
	"test-writer": "advisory",
	implementer: "advisory",
	"implementer-opus": "advisory",
	"groom-writer": "advisory",
	"conflict-resolver": "advisory",
};

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SUBAGENT_POLICY_INVOCATION = "scripts/subagent-outputs.ts policy <subagent>";

export function repairPolicy(subagent: string): {
	subagent: string;
	kind: OutputKind;
	repairTurns: number;
} {
	const kind = SUBAGENT_OUTPUTS[subagent];
	if (!kind) {
		throw new Error(
			`${subagent} is not in the subagent output list, so it is treated as gating and fails closed.`,
		);
	}
	return {
		subagent,
		kind,
		repairTurns: kind === "advisory" ? REPAIR_TURNS : 0,
	};
}

if (import.meta.main) {
	const [command, subagent] = process.argv.slice(2);
	if (command !== "policy" || !subagent) {
		console.error(`usage: ${SUBAGENT_POLICY_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(JSON.stringify(repairPolicy(subagent)));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
