export type Severity = "Critical" | "High" | "Important" | "Minor";

export interface Finding {
	id: string;
	severity: Severity;
	reproduced: boolean;
}

export interface Acceptance {
	findingId: string;
	head: string;
	acceptedBy: string;
	words: string;
}

export interface ReadinessInput {
	head: string;
	findings: Finding[];
	acceptances: Acceptance[];
}

export interface BlockingFinding {
	id: string;
	severity: Severity;
	unverified: boolean;
}

export type AcceptedFinding = BlockingFinding & {
	acceptedBy: string;
	head: string;
};

export interface ReadinessDecision {
	decision: "GO" | "NO-GO";
	blocking: BlockingFinding[];
	accepted: AcceptedFinding[];
}

function isSerious(severity: Severity): boolean {
	return severity === "Critical" || severity === "High";
}

function recorded(value: string): boolean {
	return value.trim().length > 0;
}

function matchingAcceptance(
	finding: Finding,
	head: string,
	acceptances: Acceptance[],
): Acceptance | undefined {
	return acceptances.find(
		(acceptance) =>
			acceptance.findingId === finding.id &&
			acceptance.head === head &&
			recorded(acceptance.acceptedBy) &&
			recorded(acceptance.words),
	);
}

export function decideReadiness(input: ReadinessInput): ReadinessDecision {
	const blocking: BlockingFinding[] = [];
	const accepted: AcceptedFinding[] = [];
	for (const finding of input.findings) {
		if (!isSerious(finding.severity)) continue;
		const record: BlockingFinding = {
			id: finding.id,
			severity: finding.severity,
			unverified: !finding.reproduced,
		};
		const acceptance = matchingAcceptance(
			finding,
			input.head,
			input.acceptances,
		);
		if (acceptance) {
			accepted.push({
				...record,
				acceptedBy: acceptance.acceptedBy,
				head: acceptance.head,
			});
			continue;
		}
		blocking.push(record);
	}
	return {
		decision: blocking.length === 0 ? "GO" : "NO-GO",
		blocking,
		accepted,
	};
}
