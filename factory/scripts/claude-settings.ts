import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

export async function installClaudeMutationHook(
	settingsPath: string,
	factoryRoot: string,
	evidencePath: string,
): Promise<void> {
	const command = `bun ${JSON.stringify(join(factoryRoot, "scripts", "commit-guard.ts"))}`;
	let current: unknown = {};
	try {
		current = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const merged = mergeClaudeMutationHook(current, command);
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
	await writeFile(evidencePath, "verified\n");
}

if (import.meta.main) {
	const [settingsPath, factoryRoot, evidencePath] = process.argv.slice(2);
	if (!settingsPath || !factoryRoot || !evidencePath) {
		console.error(
			"usage: claude-settings.ts <settings.json> <factory-root> <evidence-file>",
		);
		process.exit(2);
	}
	try {
		await installClaudeMutationHook(settingsPath, factoryRoot, evidencePath);
		console.log(`Claude mutation hook -> ${settingsPath}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
