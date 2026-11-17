import { readdir } from "node:fs/promises";
import { normalizeTicketKey } from "./ticket-key";

export interface ChangeMatch {
	match: string | null;
	ambiguous: boolean;
	candidates: string[];
}

const ARCHIVE_DIR = "archive";

function belongsTo(entry: string, key: string): boolean {
	if (entry === ARCHIVE_DIR) return false;
	const name = entry.toLowerCase();
	return name === key || name.startsWith(`${key}-`);
}

export function findChange(
	workItemKey: string,
	entries: string[],
): ChangeMatch {
	const key = normalizeTicketKey(workItemKey).toLowerCase();
	const candidates = entries.filter((entry) => belongsTo(entry, key));
	const [first] = candidates;
	const unique = candidates.length === 1 && first !== undefined;
	return {
		match: unique ? first : null,
		ambiguous: candidates.length > 1,
		candidates,
	};
}

if (import.meta.main) {
	const [key, changesDir] = process.argv.slice(2);
	if (!key || !changesDir) {
		console.error("usage: find-change <work-item-key> <changesDir>");
		process.exit(2);
	}
	const entries = await readdir(changesDir).catch((): string[] => []);
	const result = findChange(key, entries);
	console.log(JSON.stringify(result));
	// Only a single match counts as found; none or several both exit 1.
	process.exit(result.match === null ? 1 : 0);
}
