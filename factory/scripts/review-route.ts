import { type ReviewVerdict, parseReviewVerdict } from "./verdicts";

// No merge request exists while review runs. Only approve opens one, and it
// is left for a person to merge; nothing in the factory merges or closes it.
export type ReviewAction = ReviewRouting["action"];

export interface ReviewRouting {
	action: "approve" | "fix" | "escalate";
	state: string;
	reason: string;
}

function escalation(reason: string): ReviewRouting {
	return { action: "escalate", state: "ESCALATED", reason };
}

function fixOrGiveUp(
	verdict: ReviewVerdict,
	attempt: number,
	maxAttempts: number,
): ReviewRouting {
	const open = verdict.findings.join("; ");
	if (attempt >= maxAttempts) {
		return escalation(
			`No fix attempts remain after ${maxAttempts}; handing over to a person. Still open: ${open}`,
		);
	}
	return {
		action: "fix",
		state: "IMPLEMENTED",
		reason: `The reviewer asked for changes on attempt ${attempt} of ${maxAttempts}: ${open}`,
	};
}

export function routeReview(
	verdict: ReviewVerdict,
	attempt: number,
	maxAttempts: number,
): ReviewRouting {
	if (verdict.shouldEscalate) {
		return escalation(
			verdict.reasoning || "The reviewer asked for a person to take over.",
		);
	}
	// Checked apart from the schema so a verdict that slips past it with a
	// failed dimension still cannot be approved.
	const ready =
		verdict.specFaithful &&
		verdict.testsMeaningful &&
		verdict.codeMatchesSpec &&
		verdict.readyForMain;
	if (ready && verdict.satisfied === "yes") {
		return {
			action: "approve",
			state: "APPROVED",
			reason:
				verdict.reasoning ||
				"The review is satisfied; the merge request waits for a person to merge it.",
		};
	}
	if (ready && verdict.satisfied === "reject") {
		return escalation(verdict.reasoning || "The reviewer rejected the change.");
	}
	return fixOrGiveUp(verdict, attempt, maxAttempts);
}

async function verdictText(argument: string): Promise<string> {
	if (argument === "") return argument;
	const file = Bun.file(argument);
	return (await file.exists()) ? file.text() : argument;
}

if (import.meta.main) {
	const [source = "", attemptArg = "1", ceilingArg = "2"] =
		process.argv.slice(2);
	try {
		const verdict = parseReviewVerdict(await verdictText(source));
		const routing = routeReview(
			verdict,
			Number.parseInt(attemptArg, 10),
			Number.parseInt(ceilingArg, 10),
		);
		console.log(JSON.stringify(routing));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
