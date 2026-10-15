import { sanitizeHumanText } from "./human-text";
import { type ReviewVerdict, parseReviewVerdict } from "./verdicts";

// Render a holdout verdict for a human reader (Jira comment / MR note).
// Internal field names (specFaithful, testsMeaningful, ...) never appear; each
// boolean becomes a Yes/No against a plain-language question, and findings are
// listed as bullets. See the human-output rules in CLAUDE.md.
const HEADING: Record<ReviewVerdict["satisfied"], string> = {
	yes: "Satisfied",
	changes_requested: "Changes requested",
	reject: "Rejected",
};

function yesNo(value: boolean): string {
	return value ? "Yes" : "No";
}

export function formatReviewSummary(v: ReviewVerdict): string {
	const lines = [
		`Holdout review - ${HEADING[v.satisfied]}`,
		"",
		`Spec is faithful to the ticket: ${yesNo(v.specFaithful)}`,
		`Tests are meaningful: ${yesNo(v.testsMeaningful)}`,
		`Code matches the spec: ${yesNo(v.codeMatchesSpec)}`,
		`Code is ready for main: ${yesNo(v.readyForMain)}`,
		"",
	];
	if (v.findings.length === 0) {
		lines.push("No outstanding findings.");
	} else {
		lines.push("Outstanding findings:");
		for (const f of v.findings) lines.push(`- ${sanitizeHumanText(f)}`);
	}
	return lines.join("\n");
}

if (import.meta.main) {
	const input =
		process.argv[2] ?? (await new Response(Bun.stdin.stream()).text());
	try {
		console.log(formatReviewSummary(parseReviewVerdict(input)));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
