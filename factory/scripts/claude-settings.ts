import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export const AGENT_SUMMARY_PRELOAD_RELATIVE = "host/no-agent-summary.js";

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Claude settings must be a JSON object");
	}
	return value as JsonObject;
}

export function mergeClaudeMutationHook(
	input: unknown,
	command: string,
): JsonObject {
	const settings = structuredClone(record(input));
	const hooks = settings.hooks === undefined ? {} : record(settings.hooks);
	settings.hooks = hooks;
	const preToolUse =
		hooks.PreToolUse === undefined
			? []
			: Array.isArray(hooks.PreToolUse)
				? structuredClone(hooks.PreToolUse)
				: (() => {
						throw new Error(
							"Claude settings hooks.PreToolUse must be an array",
						);
					})();
	hooks.PreToolUse = preToolUse;

	let bashEntry = preToolUse.find(
		(entry) =>
			typeof entry === "object" &&
			entry !== null &&
			(entry as JsonObject).matcher === "Bash",
	) as JsonObject | undefined;
	if (!bashEntry) {
		bashEntry = { matcher: "Bash", hooks: [] };
		preToolUse.push(bashEntry);
	}
	const commands =
		bashEntry.hooks === undefined
			? []
			: Array.isArray(bashEntry.hooks)
				? bashEntry.hooks
				: (() => {
						throw new Error(
							"Claude settings Bash hook collection must be an array",
						);
					})();
	bashEntry.hooks = commands;
	if (
		!commands.some(
			(entry) =>
				typeof entry === "object" &&
				entry !== null &&
				(entry as JsonObject).type === "command" &&
				(entry as JsonObject).command === command,
		)
	) {
		commands.push({ type: "command", command });
	}
	return settings;
}

export function bunOptionsWithPreload(
	current: unknown,
	scriptPath: string,
): string {
	if (
		!isAbsolute(scriptPath) ||
		scriptPath.includes("\n") ||
		scriptPath.includes("\0")
	) {
		throw new Error("preload path must be an absolute file path");
	}
	const flag = `--preload ${scriptPath}`;
	if (current === undefined) return flag;
	if (typeof current !== "string") {
		throw new Error("Claude settings env.BUN_OPTIONS must be text");
	}
	const existing = current.trim();
	if (!existing) return flag;
	if (existing.includes(flag)) return existing;
	return `${existing} ${flag}`;
}

export function mergeClaudeAgentSummaryPreload(
	input: unknown,
	scriptPath: string,
): JsonObject {
	const settings = structuredClone(record(input));
	const env = settings.env === undefined ? {} : record(settings.env);
	settings.env = env;
	env.BUN_OPTIONS = bunOptionsWithPreload(env.BUN_OPTIONS, scriptPath);
	return settings;
}

export function claudeSettingsCarryPreload(
	input: unknown,
	scriptPath: string,
): boolean {
	try {
		const env = record(input).env;
		if (env === undefined) return false;
		const options = record(env).BUN_OPTIONS;
		return (
			typeof options === "string" && options.includes(`--preload ${scriptPath}`)
		);
	} catch {
		return false;
	}
}

export async function installClaudeMutationHook(
	settingsPath: string,
	factoryRoot: string,
	evidencePath: string,
	preloadPath?: string,
): Promise<void> {
	const command = `bun ${JSON.stringify(join(factoryRoot, "scripts", "commit-guard.ts"))}`;
	let current: unknown = {};
	try {
		current = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	let merged = mergeClaudeMutationHook(current, command);
	if (preloadPath) {
		merged = mergeClaudeAgentSummaryPreload(merged, preloadPath);
	}
	await mkdir(dirname(settingsPath), { recursive: true });
	try {
		await copyFile(settingsPath, `${settingsPath}.delivery-backup`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const temporary = `${settingsPath}.delivery-${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, {
		mode: 0o600,
	});
	await rename(temporary, settingsPath);

	const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
	const verified = JSON.stringify(persisted).includes(
		join(factoryRoot, "scripts", "commit-guard.ts"),
	);
	if (!verified) throw new Error("Claude mutation hook verification failed");
	if (preloadPath && !claudeSettingsCarryPreload(persisted, preloadPath)) {
		throw new Error("Claude agent-summary preload verification failed");
	}
	await writeFile(evidencePath, "verified\n");
}

if (import.meta.main) {
	const [settingsPath, factoryRoot, evidencePath, preloadPath] =
		process.argv.slice(2);
	if (!settingsPath || !factoryRoot || !evidencePath) {
		console.error(
			"usage: claude-settings.ts <settings.json> <factory-root> <evidence-file> [preload.js]",
		);
		process.exit(2);
	}
	try {
		await installClaudeMutationHook(
			settingsPath,
			factoryRoot,
			evidencePath,
			preloadPath,
		);
		console.log(`Claude mutation hook -> ${settingsPath}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
