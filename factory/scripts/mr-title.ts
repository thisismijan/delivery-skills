import { sanitizeHumanText } from "./human-text";

function required(what: string): Error {
	return new Error(`mr-title: ${what} is required`);
}

// The title leads with the ticket reference ("XYZ-123 - Add fireworks") so a
// reader scanning the merge request list sees the ticket first.
export function mrTitle(ticketKey: string, summary: string): string {
	const reference = sanitizeHumanText(ticketKey).toUpperCase();
	if (reference === "") throw required("Jira key");
	const title = sanitizeHumanText(summary);
	if (title === "") throw required("summary");
	const prefixed = title.toUpperCase().startsWith(reference);
	return prefixed ? title : `${reference} - ${title}`;
}

if (import.meta.main) {
	const [key = "", summary = ""] = process.argv.slice(2);
	try {
		console.log(mrTitle(key, summary));
	} catch (error) {
		console.error(error instanceof Error ? error.message : `${error}`);
		process.exit(1);
	}
}
