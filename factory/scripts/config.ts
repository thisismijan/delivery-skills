import { z } from "zod";

export const DEFAULT_MAX_FIX_ATTEMPTS = 2;
export const DEFAULT_MAX_PARALLEL_WORKTREES = 4;

const ConfigSchema = z.object({
	commandDraft: z.literal("/draft").default("/draft"),
	commandExecute: z.literal("/execute").default("/execute"),
	maxFixAttempts: z.coerce
		.number()
		.int()
		.positive()
		.default(DEFAULT_MAX_FIX_ATTEMPTS),
	maxParallelWorktrees: z.coerce
		.number()
		.int()
		.positive()
		.default(DEFAULT_MAX_PARALLEL_WORKTREES),
	modelDefault: z.enum(["sonnet", "opus"]).default("sonnet"),
	codeHost: z.string().min(1).optional(),
	specTool: z.string().min(1).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function selectReadyWave<T>(
	keys: readonly T[],
	maxParallelWorktrees: number,
): { dispatch: T[]; queued: T[] } {
	if (!Number.isInteger(maxParallelWorktrees) || maxParallelWorktrees < 1) {
		throw new Error("maxParallelWorktrees must be a positive integer");
	}
	return {
		dispatch: keys.slice(0, maxParallelWorktrees),
		queued: keys.slice(maxParallelWorktrees),
	};
}

export function loadConfig(
	env: Record<string, string | undefined> = process.env,
): Config {
	return ConfigSchema.parse({
		commandDraft: env.COMMAND_DRAFT,
		commandExecute: env.COMMAND_EXECUTE,
		maxFixAttempts: env.MAX_FIX_ATTEMPTS,
		maxParallelWorktrees: env.MAX_PARALLEL_WORKTREES,
		modelDefault: env.MODEL_DEFAULT,
		codeHost: env.CODE_HOST,
		specTool: env.SPEC_TOOL,
	});
}

if (import.meta.main) {
	try {
		const command = process.argv[2];
		if (command === "ready-wave") {
			const keys = z
				.array(z.string().min(1))
				.parse(JSON.parse(process.argv[3] ?? "[]"));
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
