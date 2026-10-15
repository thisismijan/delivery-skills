import { sanitizeHumanText } from "./human-text";

// Build an MR title that always opens with the Jira reference, e.g.
//   "SMAI-123 - Add new fireworks feature"
// so a human scanning the MR list sees the ticket up front. Fails closed on
// empty inputs rather than emitting a half-formed title.
export function mrTitle(key: string, summary: string): string {
	const ref = sanitizeHumanText(key).toUpperCase();
	const title = sanitizeHumanText(summary);
	if (!ref) throw new Error("mr-title: Jira key is required");
	if (!title) throw new Error("mr-title: summary is required");
	// Don't double-prefix if the summary already leads with the reference.
	if (title.toUpperCase().startsWith(ref)) return title;
	return `${ref} - ${title}`;
}

if (import.meta.main) {
	const key = process.argv[2] ?? "";
	const summary = process.argv[3] ?? "";
	try {
		console.log(mrTitle(key, summary));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
