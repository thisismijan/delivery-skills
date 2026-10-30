import {
	type ApproachChallengeVerdict,
	type AssessmentVerdict,
	type FeasibilityVerdict,
	MAX_DERIVED_ACCEPTANCE_CRITERIA,
	parseApproachChallengeVerdict,
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
	if (
		a.quality === "good" &&
		(a.derivedAcceptanceCriteria.length === 0 ||
			a.derivedAcceptanceCriteria.length > MAX_DERIVED_ACCEPTANCE_CRITERIA)
	) {
		return {
			decision: "clarify",
			state: "CLARIFICATION_REQUESTED",
			reason:
				"A good ticket must have one to three derived acceptance criteria.",
		};
	}
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

export const MAX_APPROACH_CHALLENGES = 2;

export interface ApproachRouting {
	action: "proceed" | "add-scenarios" | "revise" | "escalate";
	reason: string;
	gaps: ApproachChallengeVerdict["gaps"];
}

// One revision is allowed: a second rethink means the approach is still not
// settled, which is a decision for a person, not another draft.
export function routeApproachChallenge(
	verdict: ApproachChallengeVerdict,
	attempt: number,
): ApproachRouting {
	if (
		!Number.isSafeInteger(attempt) ||
		attempt < 1 ||
		attempt > MAX_APPROACH_CHALLENGES
	) {
		throw new Error(
			`the approach challenge attempt must be 1 to ${MAX_APPROACH_CHALLENGES}`,
		);
	}
	if (verdict.verdict === "sound") {
		return { action: "proceed", reason: verdict.reasoning, gaps: [] };
	}
	if (verdict.verdict === "gaps") {
		return {
			action: "add-scenarios",
			reason: verdict.reasoning,
			gaps: verdict.gaps,
		};
	}
	const rethink = verdict.rethink;
	const why = rethink
		? `${rethink.problem} Alternative: ${rethink.alternative}`
		: verdict.reasoning;
	if (attempt < MAX_APPROACH_CHALLENGES) {
		return { action: "revise", reason: why, gaps: verdict.gaps };
	}
	return {
		action: "escalate",
		reason: `The revised approach still cannot cover its cases. ${why}`,
		gaps: verdict.gaps,
	};
}

if (import.meta.main) {
	const mode = process.argv[2];
	const input = process.argv[3] ?? "";
	try {
		const json =
			input && (await Bun.file(input).exists())
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
		} else if (mode === "approach") {
			const routing = routeApproachChallenge(
				parseApproachChallengeVerdict(json),
				Number(process.argv[4] ?? "1"),
			);
			console.log(JSON.stringify(routing));
			if (routing.action === "escalate") process.exit(3);
		} else {
			console.error(
				"usage: draft-route <assessment|feasibility> '<json>' | draft-route approach <verdict.json> <attempt>",
			);
			process.exit(2);
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
