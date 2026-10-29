import { z } from "zod";
import { DeliveryLevel, LEVEL_SETTINGS, parseLevel } from "./levels";

// The standard level's values. levels.test.ts holds LEVEL_SETTINGS.standard
// equal to these, and the skill checks read them from this file's source.
export const DEFAULT_MAX_FIX_ATTEMPTS = 2;
export const DEFAULT_MAX_PARALLEL_WORKTREES = 4;
export const DEFAULT_MAX_REVIEW_ROUNDS = 3;
export const DEFAULT_ROUTING_PROFILING = "off" as const;
export const DEFAULT_WORKER_IDLE_MINUTES = 20;

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
	modelDefault: z.enum(["sonnet", "opus"]).default("sonnet"),
	routingProfiling: z
		.enum(["off", "always"])
		.default(DEFAULT_ROUTING_PROFILING),
	codeHost: z.string().min(1).optional(),
	specTool: z.string().min(1).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function selectReadyWave<T>(
	keys: readonly T[],
	maxParallelWorktrees: number,
): { dispatch: T[]; queued: T[] } {
	if (!Number.isSafeInteger(maxParallelWorktrees) || maxParallelWorktrees < 1) {
		throw new Error("maxParallelWorktrees must be a positive safe integer");
	}
	if (new Set(keys).size !== keys.length) {
		throw new Error("ready-wave keys must be unique");
	}
	return {
		dispatch: keys.slice(0, maxParallelWorktrees),
		queued: keys.slice(maxParallelWorktrees),
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
	return ConfigSchema.parse({
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
		modelDefault: env.MODEL_DEFAULT,
		routingProfiling: env.ROUTING_PROFILING,
		codeHost: env.CODE_HOST,
		specTool: env.SPEC_TOOL,
	});
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
			console.log(
				JSON.stringify(
					{
						...selectReadyWave(keys, config.maxParallelWorktrees),
						maxParallelWorktrees: config.maxParallelWorktrees,
					},
					null,
					2,
				),
			);
		} else if (command === undefined) {
			console.log(JSON.stringify(loadConfig(), null, 2));
		} else {
			console.error("usage: config.ts [ready-wave <keys-json>]");
			process.exit(2);
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
