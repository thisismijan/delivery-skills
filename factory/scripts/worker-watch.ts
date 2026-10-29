import { existsSync, statSync } from "node:fs";
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

export interface WorkerWatchEntry {
	key: string;
	state: "active" | "idle";
	lastActivity: string;
	idleMinutes: number;
	journal: boolean;
}

export interface WorkerWatchResult {
	idleLimitMinutes: number;
	workers: WorkerWatchEntry[];
	idle: string[];
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
	const workers = dispatch.workers.map((worker): WorkerWatchEntry => {
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
		return {
			key: worker.key,
			state: idleMinutes >= options.idleLimitMinutes ? "idle" : "active",
			lastActivity: new Date(last).toISOString(),
			idleMinutes,
			journal: present,
		};
	});
	return {
		idleLimitMinutes: options.idleLimitMinutes,
		workers,
		idle: workers
			.filter((worker) => worker.state === "idle")
			.map((worker) => worker.key),
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
		process.exit(result.idle.length > 0 ? 3 : 0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
