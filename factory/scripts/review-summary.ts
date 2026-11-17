import { sanitizeHumanText } from "./human-text";
import { type ReviewVerdict, parseReviewVerdict } from "./verdicts";

// The summary goes into tracker comments and merge request notes, so it names
// each check in plain words and never prints a verdict field name.
const OUTCOME_TITLE: Record<ReviewVerdict["satisfied"], string> = {
	yes: "Satisfied",
	changes_requested: "Changes requested",
	reject: "Rejected",
};

type Dimension =
	| "specFaithful"
	| "testsMeaningful"
	| "codeMatchesSpec"
	| "readyForMain";

const QUESTIONS: ReadonlyArray<readonly [Dimension, string]> = [
	["specFaithful", "Spec is faithful to the ticket"],
	["testsMeaningful", "Tests are meaningful"],
	["codeMatchesSpec", "Code matches the spec"],
	["readyForMain", "Code is ready for main"],
];

function findingsBlock(findings: string[]): string[] {
	if (findings.length === 0) return ["No outstanding findings."];
	const bullets = findings.map((finding) => `- ${sanitizeHumanText(finding)}`);
	return ["Outstanding findings:", ...bullets];
}

export function formatReviewSummary(verdict: ReviewVerdict): string {
	const answers = QUESTIONS.map(
		([dimension, question]) =>
			`${question}: ${verdict[dimension] ? "Yes" : "No"}`,
	);
	return [
		`Holdout review - ${OUTCOME_TITLE[verdict.satisfied]}`,
		"",
		...answers,
		"",
		...findingsBlock(verdict.findings),
	].join("\n");
}

if (import.meta.main) {
	const [inline] = process.argv.slice(2);
	const text = inline ?? (await Bun.stdin.text());
	try {
		const verdict = parseReviewVerdict(text);
		console.log(formatReviewSummary(verdict));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
