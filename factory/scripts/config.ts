import { z } from "zod";

const ConfigSchema = z.object({
	commandDraft: z.string().default("ig-spec:draft"),
	commandExecute: z.string().default("ig-spec:execute"),
	maxFixAttempts: z.coerce.number().int().positive().default(2),
	modelDefault: z.enum(["sonnet", "opus"]).default("sonnet"),
	openspecProfile: z.string().default("expanded"),
	issueSource: z.enum(["jira", "github"]).default("jira"),
	codeHost: z.enum(["gitlab", "github"]).default("gitlab"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(
	env: Record<string, string | undefined> = process.env,
): Config {
	return ConfigSchema.parse({
		commandDraft: env.COMMAND_DRAFT,
		commandExecute: env.COMMAND_EXECUTE,
		maxFixAttempts: env.MAX_FIX_ATTEMPTS,
		modelDefault: env.MODEL_DEFAULT,
		openspecProfile: env.OPENSPEC_PROFILE,
		issueSource: env.ISSUE_SOURCE,
		codeHost: env.CODE_HOST,
	});
}

if (import.meta.main) {
	try {
		console.log(JSON.stringify(loadConfig(), null, 2));
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
