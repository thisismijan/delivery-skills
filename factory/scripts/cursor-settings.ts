import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Cursor hooks must be a JSON object");
	}
	return value as JsonObject;
}

export function cursorHookCommand(factoryRoot: string): string {
	return `bun ${JSON.stringify(join(factoryRoot, "scripts", "commit-guard.ts"))} --protocol cursor`;
}

const HOOK_EVENTS = [
	"beforeShellExecution",
	"beforeMCPExecution",
	"preToolUse",
] as const;

function asHookList(value: unknown, event: string): unknown[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error(`Cursor hooks.${event} must be an array`);
	}
	return structuredClone(value);
}

export function mergeCursorMutationHook(
	input: unknown,
	command: string,
): JsonObject {
	const settings = structuredClone(record(input));
	if (settings.version === undefined) settings.version = 1;
	if (settings.version !== 1) {
		throw new Error("Cursor hooks version must be 1");
	}
	const hooks = settings.hooks === undefined ? {} : record(settings.hooks);
	settings.hooks = hooks;
	for (const event of HOOK_EVENTS) {
		const entries = asHookList(hooks[event], event);
		hooks[event] = entries;
		const already = entries.some(
			(entry) =>
				typeof entry === "object" &&
				entry !== null &&
				(entry as JsonObject).command === command,
		);
		if (!already) {
			entries.push({ command, failClosed: true });
		}
	}
	return settings;
}

export function cursorHooksContainGuard(
	input: unknown,
	factoryRoot: string,
): boolean {
	try {
		const serialized = JSON.stringify(record(input));
		return (
			serialized.includes(join(factoryRoot, "scripts", "commit-guard.ts")) &&
			serialized.includes("--protocol cursor") &&
			HOOK_EVENTS.every((event) => serialized.includes(event))
		);
	} catch {
		return false;
	}
}

export async function installCursorMutationHook(
	hooksPath: string,
	factoryRoot: string,
	evidencePath: string,
): Promise<void> {
	const command = cursorHookCommand(factoryRoot);
	let current: unknown = {};
	try {
		current = JSON.parse(await readFile(hooksPath, "utf8")) as unknown;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const merged = mergeCursorMutationHook(current, command);
	await mkdir(dirname(hooksPath), { recursive: true });
	try {
		await copyFile(hooksPath, `${hooksPath}.delivery-backup`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const temporary = `${hooksPath}.delivery-${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, {
		mode: 0o600,
	});
	await rename(temporary, hooksPath);

	const persisted = JSON.parse(await readFile(hooksPath, "utf8")) as unknown;
	if (!cursorHooksContainGuard(persisted, factoryRoot)) {
		throw new Error("Cursor mutation hook verification failed");
	}
	await writeFile(evidencePath, "verified\n");
}

if (import.meta.main) {
	const [hooksPath, factoryRoot, evidencePath] = process.argv.slice(2);
	if (!hooksPath || !factoryRoot || !evidencePath) {
		console.error(
			"usage: cursor-settings.ts <hooks.json> <factory-root> <evidence-file>",
		);
		process.exit(2);
	}
	try {
		await installCursorMutationHook(hooksPath, factoryRoot, evidencePath);
		console.log(`Cursor mutation hook -> ${hooksPath}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
