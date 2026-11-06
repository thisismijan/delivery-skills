import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DeliveryLevel, LEVEL_SETTINGS, parseLevel } from "./levels";
import { parseQuietHours } from "./quiet-hours";

// The standard level's values. levels.test.ts holds LEVEL_SETTINGS.standard
// equal to these, and the skill checks read them from this file's source.
export const DEFAULT_MAX_FIX_ATTEMPTS = 2;
export const DEFAULT_MAX_PARALLEL_WORKTREES = 4;
export const DEFAULT_MAX_REVIEW_ROUNDS = 3;
export const DEFAULT_ROUTING_PROFILING = "off" as const;
export const DEFAULT_WORKER_IDLE_MINUTES = 20;
export const DEFAULT_REVIEW_SETTLE_MINUTES = 30;
export const DEFAULT_REVIEW_TIMEZONE = "UTC";
// Open changes, plus workers still building one, that may wait on the
// operator before auto starts more work.
export const DEFAULT_MAX_AWAITING_REVIEW = 5;

// Environment variables that replace a level's value when set.
export const LEVEL_OVERRIDES = {
	MAX_PARALLEL_WORKTREES: "maxParallelWorktrees",
	MAX_FIX_ATTEMPTS: "maxFixAttempts",
	MAX_REVIEW_ROUNDS: "maxReviewRounds",
} as const;

const DecimalCount = z.preprocess((value) => {
	if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
		return Number(value);
	}
	return value;
}, z.number().int().safe().positive());

const ConfigSchema = z.object({
	level: DeliveryLevel,
	commandDraft: z.literal("/draft").default("/draft"),
	commandExecute: z.literal("/execute").default("/execute"),
	maxFixAttempts: z.coerce.number().int().positive(),
	maxParallelWorktrees: DecimalCount,
	maxReviewRounds: DecimalCount,
	reviewBreadth: z.enum(["size-trimmed", "measured", "every-lens"]),
	implementerTier: z.enum(["measured", "frontier"]),
	overrides: z.array(z.string()),
	workerIdleMinutes: z.coerce
		.number()
		.int()
		.positive()
		.default(DEFAULT_WORKER_IDLE_MINUTES),
	reviewSettleMinutes: DecimalCount,
	maxAwaitingReview: DecimalCount,
	reviewQuietHours: z.string().optional(),
	reviewTimeZone: z.string().min(1),
	factoryAuthors: z.array(z.string().min(1)),
	modelDefault: z.enum(["sonnet", "opus"]).default("sonnet"),
	routingProfiling: z
		.enum(["off", "always"])
		.default(DEFAULT_ROUTING_PROFILING),
	codeHost: z.string().min(1).optional(),
	specTool: z.string().min(1).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface ReviewQueue {
	awaiting: number;
	maxAwaitingReview: number;
}

export function selectReadyWave<T>(
	keys: readonly T[],
	maxParallelWorktrees: number,
	live: readonly T[] = [],
	review?: ReviewQueue,
): { dispatch: T[]; queued: T[]; heldForReview?: true } {
	if (!Number.isSafeInteger(maxParallelWorktrees) || maxParallelWorktrees < 1) {
		throw new Error("maxParallelWorktrees must be a positive safe integer");
	}
	if (new Set(keys).size !== keys.length) {
		throw new Error("ready-wave keys must be unique");
	}
	const running = new Set(live);
	const again = keys.filter((key) => running.has(key));
	if (again.length > 0) {
		throw new Error(
			`${again.join(", ")} already ${again.length === 1 ? "has a worker" : "have workers"} running`,
		);
	}
	const workerRoom = Math.max(0, maxParallelWorktrees - running.size);
	// Each live worker will open a change too, so it counts against the queue.
	const reviewRoom = review
		? Math.max(0, review.maxAwaitingReview - review.awaiting - running.size)
		: workerRoom;
	const room = Math.min(workerRoom, reviewRoom);
	const held = reviewRoom < workerRoom && room < keys.length;
	return {
		dispatch: keys.slice(0, room),
		queued: keys.slice(room),
		...(held ? { heldForReview: true as const } : {}),
	};
}

export function loadConfig(
	env: Record<string, string | undefined> = process.env,
): Config {
	const level = parseLevel(env.DELIVERY_LEVEL);
	const preset = LEVEL_SETTINGS[level];
	const overrides = Object.keys(LEVEL_OVERRIDES).filter(
		(name) => env[name] !== undefined,
	);
	const config = ConfigSchema.parse({
		level,
		commandDraft: env.COMMAND_DRAFT,
		commandExecute: env.COMMAND_EXECUTE,
		maxFixAttempts: env.MAX_FIX_ATTEMPTS ?? preset.maxFixAttempts,
		maxParallelWorktrees:
			env.MAX_PARALLEL_WORKTREES ?? preset.maxParallelWorktrees,
		maxReviewRounds: env.MAX_REVIEW_ROUNDS ?? preset.maxReviewRounds,
		reviewBreadth: preset.reviewBreadth,
		implementerTier: preset.implementerTier,
		overrides,
		workerIdleMinutes: env.WORKER_IDLE_MINUTES,
		reviewSettleMinutes:
			env.REVIEW_SETTLE_MINUTES ?? DEFAULT_REVIEW_SETTLE_MINUTES,
		maxAwaitingReview: env.MAX_AWAITING_REVIEW ?? DEFAULT_MAX_AWAITING_REVIEW,
		reviewQuietHours: env.REVIEW_QUIET_HOURS?.trim() || undefined,
		reviewTimeZone: env.REVIEW_TIMEZONE?.trim() || DEFAULT_REVIEW_TIMEZONE,
		factoryAuthors: (env.DELIVERY_FACTORY_AUTHORS ?? "factory,delivery-bot")
			.split(",")
			.map((author) => author.trim())
			.filter(Boolean),
		modelDefault: env.MODEL_DEFAULT,
		routingProfiling: env.ROUTING_PROFILING,
		codeHost: env.CODE_HOST,
		specTool: env.SPEC_TOOL,
	});
	try {
		new Intl.DateTimeFormat("en-GB", { timeZone: config.reviewTimeZone });
	} catch {
		throw new Error(`unknown REVIEW_TIMEZONE "${config.reviewTimeZone}"`);
	}
	parseQuietHours(config.reviewQuietHours, config.reviewTimeZone);
	return config;
}

if (import.meta.main) {
	try {
		const command = process.argv[2];
		if (command === "ready-wave") {
			if (process.argv[3] === undefined) {
				throw new Error("ready-wave requires a JSON array of keys");
			}
			const keys = z
				.array(z.string().trim().min(1))
				.parse(JSON.parse(process.argv[3]));
			const config = loadConfig();
			const dispatchPath = process.argv[4];
			const ledgerPath = process.argv[5];
			const watch = await import("./worker-watch");
			const queue = await import("./review-queue");
			const awaiting = ledgerPath
				? queue.awaitingReview(readFileSync(ledgerPath, "utf8"))
				: undefined;
			const live =
				dispatchPath && existsSync(dispatchPath)
					? watch
							.liveWorkers(
								watch.WorkerDispatch.parse(
									JSON.parse(readFileSync(dispatchPath, "utf8")),
								),
							)
							.map((worker) => worker.key)
					: [];
			console.log(
				JSON.stringify(
					{
						...selectReadyWave(
							keys,
							config.maxParallelWorktrees,
							live,
							awaiting
								? {
										awaiting: awaiting.length,
										maxAwaitingReview: config.maxAwaitingReview,
									}
								: undefined,
						),
						maxParallelWorktrees: config.maxParallelWorktrees,
						...(dispatchPath ? { live } : {}),
						...(awaiting
							? {
									awaitingReview: awaiting,
									maxAwaitingReview: config.maxAwaitingReview,
								}
							: {}),
					},
					null,
					2,
				),
			);
		} else if (command === undefined) {
			console.log(JSON.stringify(loadConfig(), null, 2));
		} else {
			console.error(
				"usage: config.ts [ready-wave <keys-json> [<dispatch.json> [<ledger.md>]]]",
			);
			process.exit(2);
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
