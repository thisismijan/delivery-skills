import { sanitizeHumanText } from "./human-text";

export const AUDIT_PREFIX = "**delivery** ·";

export function auditComment(event: string, detail: string): string {
	const heading = [AUDIT_PREFIX, event].join(" ");
	return [heading, sanitizeHumanText(detail)].join("\n\n");
}

if (import.meta.main) {
	const [event, body = ""] = process.argv.slice(2);
	if (!event) {
		console.error("usage: audit <event> [body]");
		process.exit(2);
	}
	console.log(auditComment(event, body));
}
