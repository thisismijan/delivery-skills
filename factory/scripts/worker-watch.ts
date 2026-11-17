import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "./config";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const WORKER_WATCH_INVOCATION =
	"scripts/worker-watch.ts <workers-dir> <dispatch.json>";

export const WorkerDispatch = z
	.object({
		workers: z
			.array(
				z
					.object({
						key: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/),
						dispatchedAt: z.string().datetime(),
						finishedAt: z.string().datetime().optional(),
					})
					.strict(),
			)
			.min(1),
	})
	.strict()
	.superRefine((dispatch, ctx) => {
		const keys = dispatch.workers.map((worker) => worker.key);
		if (new Set(keys).size !== keys.length) {
			ctx.addIssue({
				code: "custom",
				path: ["workers"],
				message: "each key is watched once",
			});
		}
	});
export type WorkerDispatch = z.infer<typeof WorkerDispatch>;

// A worker the coordinator has reconciled or stopped carries finishedAt; only
// the rest are still running and count against the cap.
export function liveWorkers(
	dispatch: WorkerDispatch,
): WorkerDispatch["workers"] {
	return dispatch.workers.filter((worker) => !worker.finishedAt);
}

// Statuses after which a worker has nothing left to do in its own run: it may
// not land, so `[go !N]` is as far as it goes. `[waiting: ...]` is not here
// because the worker is still expected to resume.
const TERMINAL_STATUS =
	/^\[(go !\d+|merged !\d+|verified !\d+|regressed !\d+|retro done|stopped: .+|triage: (wont-fix|duplicate [A-Z][A-Z0-9]+-\d+))\]$/;

// The status cell of the key's row in a journal's Keys table, or null.
export function journalStatus(markdown: string, key: string): string | null {
	for (const line of markdown.split("\n")) {
		const cells = line.split("|").map((cell) => cell.trim());
		if (cells[0] !== "" || cells[1] !== key || cells.length < 8) continue;
		return cells[6] ?? null;
	}
	return null;
}

export function isTerminalStatus(status: string | null): boolean {
	return status !== null && TERMINAL_STATUS.test(status);
}

export interface WorkerWatchEntry {
	key: string;
	state: "active" | "idle" | "finished";
	lastActivity: string;
	idleMinutes: number;
	journal: boolean;
	status?: string;
}

export interface WorkerWatchResult {
	idleLimitMinutes: number;
	workers: WorkerWatchEntry[];
	idle: string[];
	finished: string[];
}

export function watchWorkers(options: {
	workersDir: string;
	dispatch: unknown;
	now: Date;
	idleLimitMinutes: number;
}): WorkerWatchResult {
	const dispatch = WorkerDispatch.parse(options.dispatch);
	if (
		!Number.isSafeInteger(options.idleLimitMinutes) ||
		options.idleLimitMinutes < 1
	) {
		throw new Error(
			"the idle limit must be a positive whole number of minutes",
		);
	}
	const workers = liveWorkers(dispatch).map((worker): WorkerWatchEntry => {
		const journal = join(options.workersDir, `${worker.key}.md`);
		const dispatched = Date.parse(worker.dispatchedAt);
		const present = existsSync(journal);
		const last = present
			? Math.max(dispatched, statSync(journal).mtimeMs)
			: dispatched;
		const idleMinutes = Math.max(
			0,
			Math.floor((options.now.getTime() - last) / 60_000),
		);
		const status = present
			? journalStatus(readFileSync(journal, "utf8"), worker.key)
			: null;
		const state = isTerminalStatus(status)
			? "finished"
			: idleMinutes >= options.idleLimitMinutes
				? "idle"
				: "active";
		return {
			key: worker.key,
			state,
			lastActivity: new Date(last).toISOString(),
			idleMinutes,
			journal: present,
			...(status === null ? {} : { status }),
		};
	});
	const named = (state: WorkerWatchEntry["state"]) =>
		workers.filter((worker) => worker.state === state).map((w) => w.key);
	return {
		idleLimitMinutes: options.idleLimitMinutes,
		workers,
		idle: named("idle"),
		finished: named("finished"),
	};
}

if (import.meta.main) {
	const [workersDir, dispatchPath] = process.argv.slice(2);
	if (!workersDir || !dispatchPath) {
		console.error(`usage: ${WORKER_WATCH_INVOCATION}`);
		process.exit(2);
	}
	try {
		const result = watchWorkers({
			workersDir,
			dispatch: await Bun.file(dispatchPath).json(),
			now: new Date(),
			idleLimitMinutes: loadConfig().workerIdleMinutes,
		});
		console.log(JSON.stringify(result, null, 2));
		process.exit(
			result.idle.length > 0 ? 3 : result.finished.length > 0 ? 4 : 0,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
