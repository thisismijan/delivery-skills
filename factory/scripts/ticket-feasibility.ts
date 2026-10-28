import type { FeasibilityVerdict } from "./verdicts";
import { hasOpenQuestion, sectionBody, verifyTicket } from "./verify-ticket";
import { WorkItem } from "./work-item-provider";

export type TicketFeasibilityResult =
	| { skipAnalyst: false }
	| { skipAnalyst: true; verdict: FeasibilityVerdict };

const SENSITIVE_PATTERNS = [
	/\bauthentication\b/i,
	/\bauthorization\b/i,
	/\bsecrets?\b/i,
	/\bcredentials?\b/i,
	/\boauth\b/i,
	/\boidc\b/i,
	/\bjwt\b/i,
	/\bdata migrations?\b/i,
	/\bschema migrations?\b/i,
	/\bdatabase migrations?\b/i,
] as const;

const SCOPED_SECTIONS = ["What to build", "Acceptance criteria"] as const;

function approachSketch(body: string): string {
	const text = sectionBody(body, "What to build").replace(/\s+/g, " ").trim();
	return text || "Implement the behaviour named in the ticket.";
}

export async function inspectTicketFeasibility(
	item: WorkItem,
): Promise<TicketFeasibilityResult> {
	const body = `${item.body}\n`;
	const scoped = SCOPED_SECTIONS.map((name) => sectionBody(body, name)).join(
		"\n",
	);
	const hit = SENSITIVE_PATTERNS.find((pattern) => pattern.test(scoped));
	if (hit) {
		return {
			skipAnalyst: true,
			verdict: {
				feasible: "needs_human",
				approachSketch:
					"This ticket names authentication, authorization, secrets, credentials, a token protocol, or a migration. A human must confirm a safe approach before it is specified.",
				affectedAreas: [],
				contractsTouched: [],
				risks: [
					"Named authentication, authorization, secrets, credentials, a token protocol, or a migration in what to build or the acceptance criteria",
				],
				complexitySignal: "high",
			},
		};
	}
	const result = await verifyTicket(body);
	if (!result.ok || result.warnings.length > 0) {
		return { skipAnalyst: false };
	}
	if (hasOpenQuestion(body)) return { skipAnalyst: false };
	return {
		skipAnalyst: true,
		verdict: {
			feasible: "yes",
			approachSketch: approachSketch(body),
			affectedAreas: [],
			contractsTouched: [],
			risks: [],
			complexitySignal: "medium",
		},
	};
}

if (import.meta.main) {
	const inputPath = process.argv[2];
	if (!inputPath) {
		console.error("usage: ticket-feasibility.ts <work-item.json>");
		process.exit(2);
	}
	try {
		const item = WorkItem.parse(await Bun.file(inputPath).json());
		console.log(JSON.stringify(await inspectTicketFeasibility(item), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
