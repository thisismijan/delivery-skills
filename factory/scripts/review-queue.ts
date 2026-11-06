// Changes a run has opened that still need the operator: every key with a
// change that is not yet merged or past it. Stopped and waiting changes count,
// because a person has to look at them too.
export interface AwaitingChange {
	key: string;
	mr: string;
	status: string;
}

const PAST_REVIEW = /^\[(?:(?:merged|verified|regressed) !\d+|retro done)\]$/;
const CHANGE = /^!\d+$/;

function cells(row: string): string[] {
	return row
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

export function awaitingReview(ledger: string): AwaitingChange[] {
	const lines = ledger.split(/\r?\n/);
	const start = lines.findIndex((line) => /^##\s+Keys\s*$/.test(line));
	if (start < 0) throw new Error("The ledger has no Keys table.");
	const table: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^##\s/.test(line)) break;
		if (line.trim().startsWith("|")) table.push(line);
	}
	const header = table[0] ? cells(table[0]) : [];
	const key = header.indexOf("Key");
	const mr = header.indexOf("MR");
	const status = header.indexOf("Status");
	if (key < 0 || mr < 0 || status < 0) {
		throw new Error(
			"The ledger's Keys table has no Key, MR, and Status columns.",
		);
	}
	const awaiting: AwaitingChange[] = [];
	for (const row of table.slice(2)) {
		const values = cells(row);
		if (values.length !== header.length) {
			throw new Error(
				`The ledger's Keys table has a malformed row: ${row.trim()}`,
			);
		}
		const change = values[mr] as string;
		const state = values[status] as string;
		if (change === "" || change === "-") continue;
		if (!CHANGE.test(change)) {
			throw new Error(`The ledger names an unreadable change "${change}".`);
		}
		if (PAST_REVIEW.test(state)) continue;
		awaiting.push({ key: values[key] as string, mr: change, status: state });
	}
	return awaiting;
}
