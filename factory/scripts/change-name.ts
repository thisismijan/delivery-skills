import { normalizeTicketKey } from "./ticket-key";

const SLUG_WORD_LIMIT = 6;

export function changeName(workItemKey: string, summary: string): string {
	const key = normalizeTicketKey(workItemKey).toLowerCase();
	const words = summary
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");
	const slug = words.slice(0, SLUG_WORD_LIMIT).join("-");
	return `${key}-${slug || "change"}`;
}

if (import.meta.main) {
	const [key, summary = ""] = process.argv.slice(2);
	if (!key) {
		console.error("usage: change-name <work-item-key> [summary]");
		process.exit(2);
	}
	console.log(changeName(key, summary));
}
