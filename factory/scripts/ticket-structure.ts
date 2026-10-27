import type { AssessmentVerdict } from "./verdicts";
import { verifyTicket } from "./verify-ticket";
import { WorkItem } from "./work-item-provider";

export type TicketStructureResult =
	| { skipAssessor: false }
	| { skipAssessor: true; verdict: AssessmentVerdict };

const SPLIT_GAPS = [
	"Too many acceptance criteria",
	"Too many user stories",
] as const;

const SPLIT_RECOMMENDATION =
	"Split each extra user story or acceptance-criteria cluster into its own ticket with at most one story and at most three Given/When/Then criteria.";

export async function inspectTicketStructure(
	item: WorkItem,
): Promise<TicketStructureResult> {
	if (item.blockedBy.length > 0) {
		return {
			skipAssessor: true,
			verdict: {
				quality: "needs_clarification",
				scopeFit: "atomic",
				splitRecommendation: [],
				gaps: [
					`This work item is blocked by ${item.blockedBy.join(", ")}. Draft it after those blockers merge.`,
				],
				derivedAcceptanceCriteria: [],
				confidence: "high",
			},
		};
	}
	const result = await verifyTicket(`${item.body}\n`);
	if (result.ok) return { skipAssessor: false };
	const tooLarge = result.missing.some((gap) =>
		SPLIT_GAPS.some((marker) => gap.includes(marker)),
	);
	return {
		skipAssessor: true,
		verdict: {
			quality: "needs_clarification",
			scopeFit: tooLarge ? "too_large" : "atomic",
			splitRecommendation: tooLarge ? [SPLIT_RECOMMENDATION] : [],
			gaps: result.missing,
			derivedAcceptanceCriteria: [],
			confidence: "high",
		},
	};
}

if (import.meta.main) {
	const inputPath = process.argv[2];
	if (!inputPath) {
		console.error("usage: ticket-structure.ts <work-item.json>");
		process.exit(2);
	}
	try {
		const item = WorkItem.parse(await Bun.file(inputPath).json());
		console.log(JSON.stringify(await inspectTicketStructure(item), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
