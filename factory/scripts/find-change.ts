import { readdir } from "node:fs/promises";
import { normalizeTicketKey } from "./ticket-key";

export interface ChangeMatch {
	match: string | null;
	ambiguous: boolean;
	candidates: string[];
}

export function findChange(jiraKey: string, entries: string[]): ChangeMatch {
	const key = normalizeTicketKey(jiraKey).toLowerCase();
	const candidates = entries.filter((entry) => {
		const normalized = entry.toLowerCase();
		return (
			entry !== "archive" &&
			(normalized === key || normalized.startsWith(`${key}-`))
		);
	});
	if (candidates.length === 1) {
		return { match: candidates[0] as string, ambiguous: false, candidates };
	}
	return { match: null, ambiguous: candidates.length > 1, candidates };
}

if (import.meta.main) {
	const key = process.argv[2];
	const changesDir = process.argv[3];
	if (!key || !changesDir) {
		console.error("usage: find-change <JIRA-KEY> <changesDir>");
		process.exit(2);
	}
	let entries: string[] = [];
	try {
		entries = await readdir(changesDir);
	} catch {
		// missing dir => no candidates
	}
	const result = findChange(key, entries);
	console.log(JSON.stringify(result));
	// fail closed: a unique match is the only success
	process.exit(result.match ? 0 : 1);
}
