import { sanitizeHumanText } from "./human-text";

export function auditComment(event: string, body: string): string {
	return `**ig-spec** · ${event}\n\n${sanitizeHumanText(body)}`;
}

if (import.meta.main) {
	const event = process.argv[2];
	const body = process.argv[3] ?? "";
	if (!event) {
		console.error("usage: audit <event> [body]");
		process.exit(2);
	}
	console.log(auditComment(event, body));
}
