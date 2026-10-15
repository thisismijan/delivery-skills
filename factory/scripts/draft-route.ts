import {
	type AssessmentVerdict,
	type FeasibilityVerdict,
	parseAssessmentVerdict,
	parseFeasibilityVerdict,
} from "./verdicts";

export type DraftDecision = "clarify" | "reject" | "escalate" | "proceed";

export interface DraftRouting {
	decision: DraftDecision;
	state: string;
	reason: string;
}

// null => assessment is good; the command continues to feasibility.
export function routeAfterAssessment(
	a: AssessmentVerdict,
): DraftRouting | null {
	if (a.scopeFit === "too_large") {
		return {
			decision: "clarify",
			state: "SPLIT_REQUIRED",
			reason: a.splitRecommendation.length
				? `Ticket is too large for one small-context implementation. Split it into: ${a.splitRecommendation.join("; ")}`
				: "Ticket is too large for one small-context implementation. Split it into atomic, independently completable tickets before drafting.",
		};
	}
	if (a.quality === "needs_clarification") {
		return {
			decision: "clarify",
			state: "CLARIFICATION_REQUESTED",
			reason: a.gaps.length
				? `Needs clarification: ${a.gaps.join("; ")}`
				: "Ticket needs clarification.",
		};
	}
	if (a.quality === "reject") {
		return {
			decision: "reject",
			state: "REJECTED",
			reason: a.gaps.length
				? `Rejected: ${a.gaps.join("; ")}`
				: "Ticket rejected as out of scope or not actionable.",
		};
	}
	return null;
}

export function routeAfterFeasibility(f: FeasibilityVerdict): DraftRouting {
	if (f.feasible === "yes") {
		return {
			decision: "proceed",
			state: "FEASIBLE",
			reason: f.approachSketch || "Feasible; proceed to authoring.",
		};
	}
	return {
		decision: "escalate",
		state: "ESCALATED",
		reason: f.risks.length
			? `Escalated: ${f.risks.join("; ")}`
			: `Escalated (feasible=${f.feasible}).`,
	};
}

if (import.meta.main) {
	const mode = process.argv[2];
	const input = process.argv[3] ?? "";
	try {
		const json = input && (await Bun.file(input).exists())
			? await Bun.file(input).text()
			: input;
		if (mode === "assessment") {
			const routing = routeAfterAssessment(parseAssessmentVerdict(json));
			console.log(
				JSON.stringify(
					routing ?? {
						decision: "proceed",
						state: "ASSESSED_OK",
						reason: "Ticket is good; continue to feasibility.",
					},
				),
			);
		} else if (mode === "feasibility") {
			console.log(
				JSON.stringify(routeAfterFeasibility(parseFeasibilityVerdict(json))),
			);
		} else {
			console.error("usage: draft-route <assessment|feasibility> '<json>'");
			process.exit(2);
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
