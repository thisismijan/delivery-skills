import { z } from "zod";
import {
	BoardMap,
	BoardPhase,
	SDLC_BOARD_PHASES,
	mappedColumns,
	readBoardMap,
	writeBoardMap,
} from "./board-map";
import { type RuntimeManifest, loadRuntimeManifest } from "./runtime-manifest";
import { readWorkItemSelection } from "./work-item-config";
import { WorkItemBoard, runWorkItemOperation } from "./work-item-provider";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const BOARD_PROPOSE_INVOCATION =
	"scripts/board-status.ts propose <repository-root> <runtime-manifest> <ref>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const BOARD_CONFIRM_INVOCATION =
	"scripts/board-status.ts confirm <repository-root> <board-map.json>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const BOARD_SYNC_INVOCATION =
	"scripts/board-status.ts sync <repository-root> <runtime-manifest> <ref> <phase>";

const PHASE_PATTERNS: Record<BoardPhase, RegExp> = {
	ready: /\b(to ?do|ready|selected|groomed|refined|planned|next up)\b/,
	"in-progress":
		/\b(in progress|doing|in development|in dev|developing|active|implementing|wip|started)\b/,
	"in-review":
		/\b(review|reviewing|in review|code review|qa|in qa|testing|in test|verifying|verification)\b/,
	done: /\b(done|closed|complete|completed|resolved|released|shipped|deployed|merged)\b/,
};

function phasesOf(column: string): BoardPhase[] {
	const words = column
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	return SDLC_BOARD_PHASES.filter((phase) => PHASE_PATTERNS[phase].test(words));
}

export interface BoardInterpretation {
	phases: Partial<Record<BoardPhase, string>>;
	unresolved: Array<{ phase: BoardPhase; candidates: string[] }>;
	ambiguous: string[];
	problem?: string;
}

export function interpretBoard(
	statuses: readonly string[],
): BoardInterpretation {
	const ambiguous: string[] = [];
	const candidates = new Map<BoardPhase, string[]>();
	for (const column of statuses) {
		const matched = phasesOf(column);
		if (matched.length > 1) {
			ambiguous.push(column);
			continue;
		}
		const [phase] = matched;
		if (phase)
			candidates.set(phase, [...(candidates.get(phase) ?? []), column]);
	}
	const phases: Partial<Record<BoardPhase, string>> = {};
	const unresolved: BoardInterpretation["unresolved"] = [];
	for (const phase of SDLC_BOARD_PHASES) {
		const found = candidates.get(phase) ?? [];
		if (found.length === 1) phases[phase] = found[0];
		else if (found.length > 1) unresolved.push({ phase, candidates: found });
	}
	let previous = -1;
	for (const phase of SDLC_BOARD_PHASES) {
		const column = phases[phase];
		if (!column) continue;
		const index = statuses.indexOf(column);
		if (index <= previous) {
			return {
				phases: {},
				unresolved,
				ambiguous,
				problem: `The board puts '${column}' before an earlier delivery phase, so no phase is mapped. Choose the columns by hand.`,
			};
		}
		previous = index;
	}
	return { phases, unresolved, ambiguous };
}

export type BoardMove =
	| { action: "transition"; from: string | null; to: string }
	| { action: "skip"; reason: string };

export function planBoardMove(options: {
	map: BoardMap | undefined;
	board: WorkItemBoard;
	phase: BoardPhase;
}): BoardMove {
	const { map, board, phase } = options;
	if (!map) {
		return {
			action: "skip",
			reason:
				"This repository has no confirmed board map, so ticket status is left as it is.",
		};
	}
	if (map.provider !== board.provider) {
		return {
			action: "skip",
			reason: `The board map was confirmed for ${map.provider}, not ${board.provider}. Confirm the map again.`,
		};
	}
	if (JSON.stringify(map.statuses) !== JSON.stringify(board.statuses)) {
		return {
			action: "skip",
			reason:
				"The board's columns changed since the map was confirmed. Confirm the map again.",
		};
	}
	const to = map.phases[phase];
	if (!to) {
		return {
			action: "skip",
			reason: `The board map has no column for the ${phase} phase.`,
		};
	}
	const target = board.statuses.indexOf(to);
	if (board.current !== null) {
		const current = board.statuses.indexOf(board.current);
		if (current < 0) {
			return {
				action: "skip",
				reason: `The ticket is in '${board.current}', which the board map does not know.`,
			};
		}
		if (current >= target) {
			return {
				action: "skip",
				reason: `The ticket is already in '${board.current}', at or past '${to}'.`,
			};
		}
	}
	return { action: "transition", from: board.current, to };
}

export interface BoardSyncResult {
	version: 1;
	ref: string;
	phase: BoardPhase;
	outcome: "moved" | "skipped";
	from?: string | null;
	to?: string;
	reason?: string;
}

export async function syncBoardStatus(options: {
	repositoryRoot: string;
	runtime: RuntimeManifest;
	ref: string;
	phase: BoardPhase;
}): Promise<BoardSyncResult> {
	const phase = BoardPhase.parse(options.phase);
	const map = await readBoardMap(options.repositoryRoot);
	const skipped = (reason: string): BoardSyncResult => ({
		version: 1,
		ref: options.ref,
		phase,
		outcome: "skipped",
		reason,
	});
	if (!map) {
		return skipped(
			"This repository has no confirmed board map, so ticket status is left as it is.",
		);
	}
	const board = WorkItemBoard.parse(
		await runWorkItemOperation({
			operation: "statuses",
			repositoryRoot: options.repositoryRoot,
			runtime: options.runtime,
			input: { ref: options.ref },
		}),
	);
	const move = planBoardMove({ map, board, phase });
	if (move.action === "skip") return skipped(move.reason);
	await runWorkItemOperation({
		operation: "transition",
		repositoryRoot: options.repositoryRoot,
		runtime: options.runtime,
		input: { approved: true, ref: options.ref, to: move.to },
	});
	return {
		version: 1,
		ref: options.ref,
		phase,
		outcome: "moved",
		from: move.from,
		to: move.to,
	};
}

export async function proposeBoardMap(options: {
	repositoryRoot: string;
	runtime: RuntimeManifest;
	ref: string;
}): Promise<BoardInterpretation & { provider: string; statuses: string[] }> {
	const board = WorkItemBoard.parse(
		await runWorkItemOperation({
			operation: "statuses",
			repositoryRoot: options.repositoryRoot,
			runtime: options.runtime,
			input: { ref: options.ref },
		}),
	);
	return {
		provider: board.provider,
		statuses: board.statuses,
		...interpretBoard(board.statuses),
	};
}

export async function confirmBoardMap(
	repositoryRoot: string,
	raw: unknown,
): Promise<BoardMap> {
	const map = BoardMap.parse(raw);
	const selection = await readWorkItemSelection(repositoryRoot);
	if (!selection) {
		throw new Error(
			"No confirmed work-item provider. Run work-item-config.ts first.",
		);
	}
	if (selection.provider.id !== map.provider) {
		throw new Error(
			`The board map names '${map.provider}', but this repository uses '${selection.provider.id}'.`,
		);
	}
	return writeBoardMap(repositoryRoot, map);
}

const Usage = z.enum(["propose", "confirm", "sync"]);

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	const parsed = Usage.safeParse(command);
	if (!parsed.success) {
		console.error("usage: board-status.ts <propose|confirm|sync> ...");
		process.exit(2);
	}
	try {
		switch (parsed.data) {
			case "propose": {
				const [root, manifest, ref] = args;
				if (!root || !manifest || !ref)
					throw new Error(`usage: ${BOARD_PROPOSE_INVOCATION}`);
				const proposal = await proposeBoardMap({
					repositoryRoot: root,
					runtime: await loadRuntimeManifest(manifest),
					ref,
				});
				console.log(JSON.stringify(proposal, null, 2));
				break;
			}
			case "confirm": {
				const [root, mapPath] = args;
				if (!root || !mapPath)
					throw new Error(`usage: ${BOARD_CONFIRM_INVOCATION}`);
				const map = await confirmBoardMap(root, await Bun.file(mapPath).json());
				console.log(
					`Board map confirmed for ${map.provider}: ${mappedColumns(map).join(", ")}.`,
				);
				break;
			}
			case "sync": {
				const [root, manifest, ref, phase] = args;
				if (!root || !manifest || !ref || !phase)
					throw new Error(`usage: ${BOARD_SYNC_INVOCATION}`);
				const result = await syncBoardStatus({
					repositoryRoot: root,
					runtime: await loadRuntimeManifest(manifest),
					ref,
					phase: BoardPhase.parse(phase),
				});
				console.log(JSON.stringify(result, null, 2));
				break;
			}
		}
	} catch (error) {
		console.error(
			error instanceof z.ZodError
				? error.issues.map((issue) => issue.message).join("; ")
				: error instanceof Error
					? error.message
					: String(error),
		);
		process.exit(1);
	}
}
