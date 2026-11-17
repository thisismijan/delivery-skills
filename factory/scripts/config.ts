import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { DeliveryLevel, LEVEL_SETTINGS, parseLevel } from "./levels";
import { parseQuietHours } from "./quiet-hours";

// These mirror LEVEL_SETTINGS.standard (levels.test.ts compares them) and the
// skill checks parse them out of this file as text, so keep each on one line.
export const DEFAULT_MAX_FIX_ATTEMPTS = 2;
export const DEFAULT_MAX_PARALLEL_WORKTREES = 4;
export const DEFAULT_MAX_REVIEW_ROUNDS = 3;
export const DEFAULT_ROUTING_PROFILING = "off" as const;
export const DEFAULT_WORKER_IDLE_MINUTES = 20;
export const DEFAULT_REVIEW_SETTLE_MINUTES = 30;
export const DEFAULT_REVIEW_TIMEZONE = "UTC";
// The cap on changes awaiting the operator, counting workers that will open
// one, before auto holds back new dispatches.
export const DEFAULT_MAX_AWAITING_REVIEW = 5;

// An environment variable named here, when present, wins over the level.
export const LEVEL_OVERRIDES = {
	MAX_PARALLEL_WORKTREES: "maxParallelWorktrees",
	MAX_FIX_ATTEMPTS: "maxFixAttempts",
	MAX_REVIEW_ROUNDS: "maxReviewRounds",
} as const;

const DEFAULT_FACTORY_AUTHORS = "factory,delivery-bot";
const MODEL_TIERS = ["sonnet", "opus"] as const;
const PLAIN_DECIMAL = /^[1-9]\d*$/;

type Environment = Record<string, string | undefined>;

const countFromText = (input: unknown) =>
	typeof input === "string" && PLAIN_DECIMAL.test(input)
		? Number(input)
		: input;

const strictCount = z.preprocess(
	countFromText,
	z.number().int().safe().positive(),
);

const settings = z.object({
	level: DeliveryLevel,
	commandDraft: z.literal("/draft").default("/draft"),
	commandExecute: z.literal("/execute").default("/execute"),
	maxFixAttempts: z.coerce.number().int().positive(),
	maxParallelWorktrees: strictCount,
	maxReviewRounds: strictCount,
	reviewBreadth: z.enum(["size-trimmed", "measured", "every-lens"]),
	implementerTier: z.enum(["measured", "frontier"]),
	overrides: z.array(z.string()),
	workerIdleMinutes: z.coerce
		.number()
		.int()
		.positive()
		.default(DEFAULT_WORKER_IDLE_MINUTES),
	reviewSettleMinutes: strictCount,
	maxAwaitingReview: strictCount,
	reviewQuietHours: z.string().optional(),
	reviewTimeZone: z.string().min(1),
	factoryAuthors: z.array(z.string().min(1)),
	modelDefault: z.enum(MODEL_TIERS).default("sonnet"),
	routingProfiling: z
		.enum(["off", "always"])
		.default(DEFAULT_ROUTING_PROFILING),
	codeHost: z.string().min(1).optional(),
	specTool: z.string().min(1).optional(),
});

export type Config = z.infer<typeof settings>;

export interface ReviewQueue {
	awaiting: number;
	maxAwaitingReview: number;
}

function splitAuthors(list: string): string[] {
	return list
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
}

function ensureKnownZone(zone: string): void {
	try {
		new Intl.DateTimeFormat("en-GB", { timeZone: zone });
	} catch {
		throw new Error(`unknown REVIEW_TIMEZONE "${zone}"`);
	}
}

export function selectReadyWave<T>(
	keys: readonly T[],
	maxParallelWorktrees: number,
	live: readonly T[] = [],
	review?: ReviewQueue,
): { dispatch: T[]; queued: T[]; heldForReview?: true } {
	const limitIsValid =
		Number.isSafeInteger(maxParallelWorktrees) && maxParallelWorktrees >= 1;
	if (!limitIsValid) {
		throw new Error("maxParallelWorktrees must be a positive safe integer");
	}
	if (new Set(keys).size < keys.length) {
		throw new Error("ready-wave keys must be unique");
	}
	const busy = new Set(live);
	const rerun = keys.filter((key) => busy.has(key));
	if (rerun.length === 1) {
		throw new Error(`${rerun[0]} already has a worker running`);
	}
	if (rerun.length > 1) {
		throw new Error(`${rerun.join(", ")} already have workers running`);
	}
	const freeWorkers = Math.max(0, maxParallelWorktrees - busy.size);
	// A busy worker is going to open a change of its own, so the review queue
	// has to make room for it as well.
	const freeReviews =
		review === undefined
			? freeWorkers
			: Math.max(0, review.maxAwaitingReview - review.awaiting - busy.size);
	const take = Math.min(freeWorkers, freeReviews);
	const wave = { dispatch: keys.slice(0, take), queued: keys.slice(take) };
	const reviewIsTheLimit = freeReviews < freeWorkers && take < keys.length;
	return reviewIsTheLimit ? { ...wave, heldForReview: true } : wave;
}

export function loadConfig(env: Environment = process.env): Config {
	const level = parseLevel(env.DELIVERY_LEVEL);
	const fromLevel = LEVEL_SETTINGS[level];
	const parsed = settings.parse({
		level,
		commandDraft: env.COMMAND_DRAFT,
		commandExecute: env.COMMAND_EXECUTE,
		maxFixAttempts: env.MAX_FIX_ATTEMPTS ?? fromLevel.maxFixAttempts,
		maxParallelWorktrees:
			env.MAX_PARALLEL_WORKTREES ?? fromLevel.maxParallelWorktrees,
		maxReviewRounds: env.MAX_REVIEW_ROUNDS ?? fromLevel.maxReviewRounds,
		reviewBreadth: fromLevel.reviewBreadth,
		implementerTier: fromLevel.implementerTier,
		overrides: Object.keys(LEVEL_OVERRIDES).filter(
			(variable) => env[variable] !== undefined,
		),
		workerIdleMinutes: env.WORKER_IDLE_MINUTES,
		reviewSettleMinutes:
			env.REVIEW_SETTLE_MINUTES ?? DEFAULT_REVIEW_SETTLE_MINUTES,
		maxAwaitingReview: env.MAX_AWAITING_REVIEW ?? DEFAULT_MAX_AWAITING_REVIEW,
		reviewQuietHours: env.REVIEW_QUIET_HOURS?.trim() || undefined,
		reviewTimeZone: env.REVIEW_TIMEZONE?.trim() || DEFAULT_REVIEW_TIMEZONE,
		factoryAuthors: splitAuthors(
			env.DELIVERY_FACTORY_AUTHORS ?? DEFAULT_FACTORY_AUTHORS,
		),
		modelDefault: env.MODEL_DEFAULT,
		routingProfiling: env.ROUTING_PROFILING,
		codeHost: env.CODE_HOST,
		specTool: env.SPEC_TOOL,
	});
	ensureKnownZone(parsed.reviewTimeZone);
	parseQuietHours(parsed.reviewQuietHours, parsed.reviewTimeZone);
	return parsed;
}

const USAGE =
	"usage: config.ts [ready-wave <keys-json> [<dispatch.json> [<ledger.md>]]]";

async function readyWaveReport(
	keysJson: string | undefined,
	dispatchFile: string | undefined,
	ledgerFile: string | undefined,
): Promise<Record<string, unknown>> {
	if (keysJson === undefined) {
		throw new Error("ready-wave requires a JSON array of keys");
	}
	const keys = z.array(z.string().trim().min(1)).parse(JSON.parse(keysJson));
	const { maxParallelWorktrees, maxAwaitingReview } = loadConfig();
	const { WorkerDispatch, liveWorkers } = await import("./worker-watch");
	const { awaitingReview } = await import("./review-queue");
	let live: string[] = [];
	if (dispatchFile && existsSync(dispatchFile)) {
		const dispatch = WorkerDispatch.parse(
			JSON.parse(readFileSync(dispatchFile, "utf8")),
		);
		live = liveWorkers(dispatch).map((worker) => worker.key);
	}
	const awaiting = ledgerFile
		? awaitingReview(readFileSync(ledgerFile, "utf8"))
		: undefined;
	const queue =
		awaiting === undefined
			? undefined
			: { awaiting: awaiting.length, maxAwaitingReview };
	return {
		...selectReadyWave(keys, maxParallelWorktrees, live, queue),
		maxParallelWorktrees,
		...(dispatchFile ? { live } : {}),
		...(awaiting === undefined
			? {}
			: { awaitingReview: awaiting, maxAwaitingReview }),
	};
}

if (import.meta.main) {
	const [command, keysJson, dispatchFile, ledgerFile] = process.argv.slice(2);
	const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
	try {
		if (command === undefined) {
			print(loadConfig());
		} else if (command === "ready-wave") {
			print(await readyWaveReport(keysJson, dispatchFile, ledgerFile));
		} else {
			console.error(USAGE);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
