import { normalizeTicketKey } from "./ticket-key";

export function changeName(workItemKey: string, summary: string): string {
	const key = normalizeTicketKey(workItemKey).toLowerCase();
	const slug = summary
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.filter((w) => w.length > 0)
		.slice(0, 6)
		.join("-");
	return `${key}-${slug || "change"}`;
}

if (import.meta.main) {
	const key = process.argv[2];
	const summary = process.argv[3] ?? "";
	if (!key) {
		console.error("usage: change-name <work-item-key> [summary]");
		process.exit(2);
	}
	console.log(changeName(key, summary));
}
