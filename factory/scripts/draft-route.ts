import {
	type ApproachChallengeVerdict,
	type AssessmentVerdict,
	type ExplainBackVerdict,
	type FeasibilityVerdict,
	MAX_DERIVED_ACCEPTANCE_CRITERIA,
	type ReadinessVerdict,
	parseApproachChallengeVerdict,
	parseAssessmentVerdict,
	parseExplainBackVerdict,
	parseFeasibilityVerdict,
	parseReadinessVerdict,
} from "./verdicts";

export type DraftDecision = DraftRouting["decision"];

export interface DraftRouting {
	decision: "clarify" | "reject" | "escalate" | "proceed";
	state: string;
	reason: string;
}

const listed = (parts: string[]) => parts.join("; ");

const TOO_LARGE =
	"This ticket is too big for one small-context implementation.";

// Returns null for a good ticket, which means drafting moves on to the
// feasibility check.
export function routeAfterAssessment(
	assessment: AssessmentVerdict,
): DraftRouting | null {
	const criteria = assessment.derivedAcceptanceCriteria.length;
	const criteriaFit =
		criteria >= 1 && criteria <= MAX_DERIVED_ACCEPTANCE_CRITERIA;
	if (assessment.quality === "good" && !criteriaFit) {
		return {
			decision: "clarify",
			state: "CLARIFICATION_REQUESTED",
			reason: "A good ticket needs one to three derived acceptance criteria.",
		};
	}
	if (assessment.scopeFit === "too_large") {
		const parts = assessment.splitRecommendation;
		return {
			decision: "clarify",
			state: "SPLIT_REQUIRED",
			reason:
				parts.length > 0
					? `${TOO_LARGE} Split it as follows: ${listed(parts)}`
					: `${TOO_LARGE} Break it into atomic tickets that can each be finished on their own, then draft those.`,
		};
	}
	const gaps = assessment.gaps;
	if (assessment.quality === "needs_clarification") {
		return {
			decision: "clarify",
			state: "CLARIFICATION_REQUESTED",
			reason:
				gaps.length > 0
					? `The ticket needs clarification: ${listed(gaps)}`
					: "The ticket needs clarification before it can be drafted.",
		};
	}
	if (assessment.quality === "reject") {
		return {
			decision: "reject",
			state: "REJECTED",
			reason:
				gaps.length > 0
					? `The ticket is rejected: ${listed(gaps)}`
					: "The ticket is rejected because it is out of scope or cannot be acted on.",
		};
	}
	return null;
}

const NOT_FEASIBLE: Record<
	Exclude<FeasibilityVerdict["feasible"], "yes">,
	string
> = {
	no: "The analyst judged the work not feasible.",
	needs_human:
		"The analyst needs a person to decide whether the work can go ahead.",
};

export function routeAfterFeasibility(
	feasibility: FeasibilityVerdict,
): DraftRouting {
	if (feasibility.feasible === "yes") {
		return {
			decision: "proceed",
			state: "FEASIBLE",
			reason:
				feasibility.approachSketch ||
				"The work is feasible; authoring can start.",
		};
	}
	return {
		decision: "escalate",
		state: "ESCALATED",
		reason:
			feasibility.risks.length > 0
				? `Feasibility escalated: ${listed(feasibility.risks)}`
				: NOT_FEASIBLE[feasibility.feasible],
	};
}

function requireAttempt(attempt: number, ceiling: number, check: string) {
	const inRange =
		Number.isSafeInteger(attempt) && attempt >= 1 && attempt <= ceiling;
	if (!inRange) {
		throw new Error(
			`the ${check} attempt has to be a whole number from 1 to ${ceiling}`,
		);
	}
}

export const MAX_APPROACH_CHALLENGES = 2;

export interface ApproachRouting {
	action: "proceed" | "add-scenarios" | "revise" | "escalate";
	reason: string;
	gaps: ApproachChallengeVerdict["gaps"];
}

const APPROACH_UNSETTLED = "The revised approach still cannot cover its cases.";

// A rethink earns one revision. A second rethink means the approach itself
// is in question, and choosing another one is a person's call.
export function routeApproachChallenge(
	challenge: ApproachChallengeVerdict,
	attempt: number,
): ApproachRouting {
	requireAttempt(attempt, MAX_APPROACH_CHALLENGES, "approach challenge");
	const { reasoning, gaps, rethink } = challenge;
	switch (challenge.verdict) {
		case "sound":
			return { action: "proceed", reason: reasoning, gaps: [] };
		case "gaps":
			return { action: "add-scenarios", reason: reasoning, gaps };
	}
	const detail = rethink
		? `${rethink.problem} Alternative: ${rethink.alternative}`
		: reasoning;
	return attempt < MAX_APPROACH_CHALLENGES
		? { action: "revise", reason: detail, gaps }
		: { action: "escalate", reason: `${APPROACH_UNSETTLED} ${detail}`, gaps };
}

export const MAX_COMPREHENSION_CHECKS = 2;
export const UNSETTLED_COMPREHENSION_STOP = "unsettled-comprehension";

export interface ComprehensionRouting {
	action: "proceed" | "revise" | "escalate";
	reason: string;
	gaps: ExplainBackVerdict["gaps"];
	stop?: string;
}

const COMPREHENSION_UNSETTLED =
	"The revised change still does not stand on its own.";

function comprehensionProblem(reading: ExplainBackVerdict): string {
	if (reading.verdict === "gaps") {
		const questions = reading.gaps.map(
			(gap) => `${gap.question} (should be answered in ${gap.file})`,
		);
		return `The reader was left with questions the change files do not answer: ${listed(questions)}`;
	}
	return `The reader's restatement disagrees with the change files: ${reading.contradiction}`;
}

// A failed read earns one revision. If the reader still cannot follow the
// change after it, the change leans on context that only a person holds.
export function routeComprehension(
	reading: ExplainBackVerdict,
	attempt: number,
): ComprehensionRouting {
	requireAttempt(attempt, MAX_COMPREHENSION_CHECKS, "explain-back");
	if (reading.verdict === "understood") {
		return {
			action: "proceed",
			reason: "The reader followed the change using only its files.",
			gaps: [],
		};
	}
	const problem = comprehensionProblem(reading);
	if (attempt < MAX_COMPREHENSION_CHECKS) {
		return { action: "revise", reason: problem, gaps: reading.gaps };
	}
	return {
		action: "escalate",
		reason: `${COMPREHENSION_UNSETTLED} ${problem}`,
		gaps: reading.gaps,
		stop: UNSETTLED_COMPREHENSION_STOP,
	};
}

export const MAX_READINESS_CHECKS = 2;
export const UNREADY_CHANGE_STOP = "unready-change";

type ReadinessItem = ReadinessVerdict["items"][number];

export interface ReadinessRouting {
	action: "proceed" | "revise" | "escalate";
	reason: string;
	items: Array<Omit<ReadinessItem, "kind"> & { kind: string }>;
	stop?: string;
}

// A not ready change earns one revision. Still not ready after it, a person
// has to settle what the implementer is meant to build from.
export function routeReadiness(
	readiness: ReadinessVerdict,
	attempt: number,
): ReadinessRouting {
	requireAttempt(attempt, MAX_READINESS_CHECKS, "readiness");
	if (readiness.verdict === "ready") {
		return { action: "proceed", reason: readiness.reasoning, items: [] };
	}
	const blockers = readiness.items.map(
		(item) => `${item.detail} (${item.where})`,
	);
	const problem = `A first-pass implementer would get stuck on: ${listed(blockers)}`;
	if (attempt < MAX_READINESS_CHECKS) {
		return { action: "revise", reason: problem, items: readiness.items };
	}
	return {
		action: "escalate",
		reason: `Even after one revision the change is not ready to build from. ${problem}`,
		items: readiness.items,
		stop: UNREADY_CHANGE_STOP,
	};
}

const USAGE =
	"usage: draft-route <assessment|feasibility> '<json>' | draft-route approach <verdict.json> <attempt> | draft-route comprehension <verdict.json> <attempt> | draft-route readiness <verdict.json> <attempt>";

type Routing =
	| DraftRouting
	| ApproachRouting
	| ComprehensionRouting
	| ReadinessRouting;
type Mode = (text: string, attempt: number) => Routing;

const ASSESSED_OK: DraftRouting = {
	decision: "proceed",
	state: "ASSESSED_OK",
	reason: "The ticket is good; drafting moves on to the feasibility check.",
};

const MODES = new Map<string, Mode>([
	[
		"assessment",
		(text) => routeAfterAssessment(parseAssessmentVerdict(text)) ?? ASSESSED_OK,
	],
	[
		"feasibility",
		(text) => routeAfterFeasibility(parseFeasibilityVerdict(text)),
	],
	[
		"approach",
		(text, attempt) =>
			routeApproachChallenge(parseApproachChallengeVerdict(text), attempt),
	],
	[
		"comprehension",
		(text, attempt) =>
			routeComprehension(parseExplainBackVerdict(text), attempt),
	],
	[
		"readiness",
		(text, attempt) => routeReadiness(parseReadinessVerdict(text), attempt),
	],
]);

async function verdictText(argument: string): Promise<string> {
	if (argument === "") return argument;
	const file = Bun.file(argument);
	return (await file.exists()) ? file.text() : argument;
}

if (import.meta.main) {
	const [mode = "", source = "", attemptArg = "1"] = process.argv.slice(2);
	const route = MODES.get(mode);
	if (!route) {
		console.error(USAGE);
		process.exit(2);
	}
	try {
		const routing = route(await verdictText(source), Number(attemptArg));
		console.log(JSON.stringify(routing));
		if ("action" in routing && routing.action === "escalate") process.exit(3);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
