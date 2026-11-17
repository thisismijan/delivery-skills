import { existsSync, readFileSync } from "node:fs";
import { ForgeFindResult } from "./forge-provider";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const IDLE_RECONCILE_INVOCATION = "scripts/idle-reconcile.ts <KEY> <journal.md> <find-result.json> [green-gate.json...]";

export type IdleDecision =
	| { resume: "review"; ref: string; head: string; reason: string }
	| { resume: "stopped"; reason: string };

interface GreenGate {
	passed?: unknown;
	evidence?: { commit?: unknown };
}

// A worker stopped as idle keeps its open change only when the change's head is
// proven to be the worker's own: named in its journal, or green under its gate.
export function decideIdle(input: {
	key: string;
	journal: string | null;
	find: unknown;
	greenGates: GreenGate[];
}): IdleDecision {
	const open = ForgeFindResult.parse(input.find).changes.filter(
		(change) => change.state === "open",
	);
	if (open.length === 0) {
		return { resume: "stopped", reason: `no open change for ${input.key}` };
	}
	if (open.length > 1) {
		return {
			resume: "stopped",
			reason: `${open.length} open changes for ${input.key}, so none is assumed`,
		};
	}
	const change = open[0] as (typeof open)[number];
	const head = change.revisions.head;
	const inJournal = input.journal?.includes(head) ?? false;
	const green = input.greenGates.some(
		(gate) => gate.passed === true && gate.evidence?.commit === head,
	);
	if (!inJournal && !green) {
		return {
			resume: "stopped",
			reason: `open change ${change.ref} is at ${head.slice(0, 12)}, which neither the journal nor a green gate names`,
		};
	}
	return {
		resume: "review",
		ref: change.ref,
		head,
		reason: inJournal
			? "the journal names the change's head"
			: "a green gate passed at the change's head",
	};
}

if (import.meta.main) {
	const [key, journalPath, findPath, ...gates] = process.argv.slice(2);
	if (!key || !journalPath || !findPath) {
		console.error(`usage: ${IDLE_RECONCILE_INVOCATION}`);
		process.exit(2);
	}
	try {
		const decision = decideIdle({
			key,
			journal: existsSync(journalPath)
				? readFileSync(journalPath, "utf8")
				: null,
			find: JSON.parse(readFileSync(findPath, "utf8")),
			greenGates: gates.map(
				(path) => JSON.parse(readFileSync(path, "utf8")) as GreenGate,
			),
		});
		console.log(JSON.stringify(decision, null, 2));
		process.exit(decision.resume === "review" ? 0 : 3);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
