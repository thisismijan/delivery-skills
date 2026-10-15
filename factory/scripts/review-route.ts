import { type ReviewVerdict, parseReviewVerdict } from "./verdicts";

// "approve" = review satisfied → the command opens the MR now, ready for a HUMAN to merge.
// (No MR exists before review; "fix"/"escalate" never open one.)
// The factory never merges or closes MRs itself.
export type ReviewAction = "approve" | "fix" | "escalate";

export interface ReviewRouting {
	action: ReviewAction;
	state: string;
	reason: string;
}

export function routeReview(
	v: ReviewVerdict,
	attempt: number,
	maxAttempts: number,
): ReviewRouting {
	// Safety first: an explicit escalation flag is never approved.
	if (v.shouldEscalate) {
		return {
			action: "escalate",
			state: "ESCALATED",
			reason: v.reasoning || "Reviewer flagged for human escalation.",
		};
	}
	// Every independent readiness dimension must hold before approval.
	if (
		!v.specFaithful ||
		!v.testsMeaningful ||
		!v.codeMatchesSpec ||
		!v.readyForMain
	) {
		if (attempt < maxAttempts) {
			return {
				action: "fix",
				state: "IMPLEMENTED",
				reason: `Changes requested (attempt ${attempt}/${maxAttempts}): ${v.findings.join("; ")}`,
			};
		}
		return {
			action: "escalate",
			state: "ESCALATED",
			reason: `Fix attempts exhausted (${maxAttempts}); escalating. Outstanding: ${v.findings.join("; ")}`,
		};
	}
	if (v.satisfied === "yes") {
		return {
			action: "approve",
			state: "APPROVED",
			reason: v.reasoning || "Review satisfied; MR ready for a human to merge.",
		};
	}
	if (v.satisfied === "reject") {
		return {
			action: "escalate",
			state: "ESCALATED",
			reason: v.reasoning || "Review rejected the change.",
		};
	}
	// changes_requested
	if (attempt < maxAttempts) {
		return {
			action: "fix",
			state: "IMPLEMENTED",
			reason: `Changes requested (attempt ${attempt}/${maxAttempts}): ${v.findings.join("; ")}`,
		};
	}
	return {
		action: "escalate",
		state: "ESCALATED",
		reason: `Fix attempts exhausted (${maxAttempts}); escalating. Outstanding: ${v.findings.join("; ")}`,
	};
}

if (import.meta.main) {
	const input = process.argv[2] ?? "";
	const attempt = Number.parseInt(process.argv[3] ?? "1", 10);
	const maxAttempts = Number.parseInt(process.argv[4] ?? "2", 10);
	try {
		const json =
			input && (await Bun.file(input).exists())
				? await Bun.file(input).text()
				: input;
		console.log(
			JSON.stringify(
				routeReview(parseReviewVerdict(json), attempt, maxAttempts),
			),
		);
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
