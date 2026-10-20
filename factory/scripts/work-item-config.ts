import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { loadMcpInventory } from "./mcp-inventory";
import { routeMcpInventory, trackerProvidersFromMcp } from "./mcp-route";
import { REQUIRED_REPOSITORY_SETTINGS } from "./provider-contract";
import { type RuntimeManifest, loadRuntimeManifest } from "./runtime-manifest";

export const WORK_ITEM_CONFIG_PATH = ".delivery/work-items.json";
export const LOCAL_WORK_ITEM_PROVIDER = "local-files";

const ProviderId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

// Per-repository provider settings, such as the tracker project this repository files work items
// in. Values are plain configuration, never credentials: they are written to a file in the
// repository and handed to the provider on every call.
const SettingKey = z.string().regex(/^[a-z][a-zA-Z0-9]*$/);
const SettingValue = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.refine(
		(value) =>
			![...value].some((character) => {
				const code = character.charCodeAt(0);
				return code < 32 || code === 127;
			}),
		"setting value contains control characters",
	);
export const ProviderSettings = z.record(SettingKey, SettingValue);
export type ProviderSettings = z.infer<typeof ProviderSettings>;

export const WorkItemSelection = z
	.object({
		version: z.literal(1),
		provider: z
			.object({
				id: ProviderId,
				kind: z.enum(["local-files", "remote"]),
				settings: ProviderSettings.optional(),
			})
			.strict(),
		confirmed: z.literal(true),
	})
	.strict();

export type WorkItemSelection = z.infer<typeof WorkItemSelection>;

export interface WorkItemOption {
	id: string;
	kind: "local-files" | "remote";
	label: string;
	invocation?: string;
}

export interface WorkItemSelectionStatus {
	state: "missing" | "ready" | "unavailable";
	selection?: WorkItemSelection;
	remedy?: string;
}

export function workItemOptions(
	runtime: RuntimeManifest,
	mcpProviders: readonly string[] = [],
): WorkItemOption[] {
	const options: WorkItemOption[] = [
		{
			id: LOCAL_WORK_ITEM_PROVIDER,
			kind: "local-files",
			label: "Local files in .delivery/work-items",
		},
	];
	const seen = new Set<string>([LOCAL_WORK_ITEM_PROVIDER]);
	const tracker = runtime.capabilities["tracker.item"];
	if (tracker?.available && tracker.provider && tracker.invocation) {
		seen.add(tracker.provider);
		options.push({
			id: tracker.provider,
			kind: "remote",
			label: `${tracker.provider} through the configured runtime provider`,
			invocation: tracker.invocation,
		});
	}
	for (const provider of mcpProviders) {
		if (seen.has(provider)) continue;
		seen.add(provider);
		options.push({
			id: provider,
			kind: "remote",
			label: `${provider} through session tools`,
			invocation: "mcp",
		});
	}
	return options;
}

// The checkout that owns a linked worktree, or null when `repositoryRoot` is itself that checkout
// or not a git repository. The selection file is gitignored, so a worktree never has its own copy.
export function primaryCheckoutOf(repositoryRoot: string): string | null {
	const result = Bun.spawnSync(
		["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
		{ cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
	);
	if (result.exitCode !== 0) return null;
	const commonDir = result.stdout.toString().trim();
	if (!commonDir.endsWith("/.git")) return null;
	const primary = dirname(commonDir);
	return primary === resolve(repositoryRoot) ? null : primary;
}

async function readSelectionFile(
	repositoryRoot: string,
): Promise<WorkItemSelection | null> {
	try {
		return WorkItemSelection.parse(
			JSON.parse(
				await readFile(join(repositoryRoot, WORK_ITEM_CONFIG_PATH), "utf8"),
			),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

// A worktree's own selection wins; without one it inherits the selection of the checkout it
// belongs to, so every worktree of a repository files work items in the same place.
export async function readWorkItemSelection(
	repositoryRoot: string,
): Promise<WorkItemSelection | null> {
	const own = await readSelectionFile(repositoryRoot);
	if (own) return own;
	const primary = primaryCheckoutOf(repositoryRoot);
	return primary ? readSelectionFile(primary) : null;
}

export function parseSettingArguments(
	args: readonly string[],
): ProviderSettings {
	const settings: Record<string, string> = {};
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] !== "--setting") continue;
		const pair = args[index + 1] ?? "";
		const equals = pair.indexOf("=");
		if (equals <= 0) {
			throw new Error(
				"--setting requires key=value, e.g. --setting project=MDF",
			);
		}
		const key = pair.slice(0, equals);
		if (key in settings) throw new Error(`--setting ${key} given twice`);
		settings[key] = pair.slice(equals + 1);
		index += 1;
	}
	return ProviderSettings.parse(settings);
}

export async function workItemSelectionStatus(
	repositoryRoot: string,
	runtime: RuntimeManifest,
): Promise<WorkItemSelectionStatus> {
	const selection = await readWorkItemSelection(repositoryRoot);
	if (!selection) {
		return {
			state: "missing",
			remedy:
				"confirm a work-item provider with /delivery init before starting lifecycle work",
		};
	}
	const mcpProviders = trackerProvidersFromMcp(
		routeMcpInventory(await loadMcpInventory(repositoryRoot)),
	);
	if (
		!workItemOptions(runtime, mcpProviders).some(
			(option) =>
				option.id === selection.provider.id &&
				option.kind === selection.provider.kind,
		)
	) {
		return {
			state: "unavailable",
			selection,
			remedy: `configure ${selection.provider.id} in this runtime or explicitly select another provider`,
		};
	}
	const recorded = selection.provider.settings ?? {};
	const required = REQUIRED_REPOSITORY_SETTINGS[selection.provider.id] ?? [];
	const missing = required.filter((key) => !recorded[key]);
	if (missing.length > 0) {
		return {
			state: "unavailable",
			selection,
			remedy: `record this repository's ${selection.provider.id} ${missing.join(" and ")} with delivery init --work-items ${selection.provider.id} ${missing
				.map((key) => `--setting ${key}=<value>`)
				.join(" ")}`,
		};
	}
	return { state: "ready", selection };
}

async function refuseSymlink(path: string, description: string): Promise<void> {
	try {
		if ((await lstat(path)).isSymbolicLink()) {
			throw new Error(`refusing to write a symlinked ${description}`);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

export async function configureWorkItemProvider(options: {
	repositoryRoot: string;
	providerId: string;
	runtime: RuntimeManifest;
	replace?: boolean;
	settings?: ProviderSettings;
}): Promise<WorkItemSelection> {
	const requested = ProviderSettings.parse(options.settings ?? {});
	const mcpProviders = trackerProvidersFromMcp(
		routeMcpInventory(await loadMcpInventory(options.repositoryRoot)),
	);
	const available = workItemOptions(options.runtime, mcpProviders);
	const selected = available.find((option) => option.id === options.providerId);
	if (!selected) {
		throw new Error(
			`work-item provider '${options.providerId}' is not available; choose ${available.map((option) => option.id).join(", ")}`,
		);
	}
	const deliveryDirectory = join(options.repositoryRoot, ".delivery");
	const configPath = join(options.repositoryRoot, WORK_ITEM_CONFIG_PATH);
	await refuseSymlink(deliveryDirectory, ".delivery directory");
	await refuseSymlink(configPath, WORK_ITEM_CONFIG_PATH);
	const existing = await readWorkItemSelection(options.repositoryRoot);
	if (existing && existing.provider.id !== selected.id && !options.replace) {
		throw new Error(
			`work-item provider is already ${existing.provider.id}; pass --replace only after explicit operator confirmation`,
		);
	}
	if (selected.kind === "local-files" && Object.keys(requested).length > 0) {
		throw new Error(`${LOCAL_WORK_ITEM_PROVIDER} takes no settings`);
	}
	const sameProvider =
		existing?.provider.id === selected.id &&
		existing.provider.kind === selected.kind;
	const recorded = sameProvider ? (existing.provider.settings ?? {}) : {};
	if (sameProvider && !options.replace) {
		// Adding a setting the repository never recorded is configuration; changing one it did
		// would silently move where this repository files work items, so it needs --replace.
		for (const [key, value] of Object.entries(requested)) {
			if (key in recorded && recorded[key] !== value) {
				throw new Error(
					`work-item setting ${key} is already ${recorded[key]}; pass --replace only after explicit operator confirmation`,
				);
			}
		}
	}
	const settings =
		sameProvider && !options.replace
			? { ...recorded, ...requested }
			: requested;
	if (sameProvider && sameSettings(recorded, settings)) {
		return existing;
	}

	await mkdir(deliveryDirectory, { recursive: true });
	const selection = WorkItemSelection.parse({
		version: 1,
		provider: {
			id: selected.id,
			kind: selected.kind,
			...(Object.keys(settings).length > 0 ? { settings } : {}),
		},
		confirmed: true,
	});
	const temporary = `${configPath}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(selection, null, 2)}\n`, {
		mode: 0o600,
	});
	await rename(temporary, configPath);
	return selection;
}

// The provider and any repository settings, e.g. "jira (project=MDF)".
export function describeSelection(selection: WorkItemSelection): string {
	const settings = Object.entries(selection.provider.settings ?? {})
		.map(([key, value]) => `${key}=${value}`)
		.join(", ");
	return `${selection.provider.id}${settings ? ` (${settings})` : ""}`;
}

function sameSettings(
	left: ProviderSettings,
	right: ProviderSettings,
): boolean {
	const keys = Object.keys(left);
	return (
		keys.length === Object.keys(right).length &&
		keys.every((key) => left[key] === right[key])
	);
}

function formatOptions(
	runtime: RuntimeManifest,
	mcpProviders: readonly string[] = [],
): string {
	return workItemOptions(runtime, mcpProviders)
		.map((option) => `${option.id}\t${option.label}`)
		.join("\n");
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const [command, first, second, third] = args;
	try {
		if (command === "options" && first) {
			const inventory = await loadMcpInventory(process.cwd());
			console.log(
				formatOptions(
					await loadRuntimeManifest(first),
					trackerProvidersFromMcp(routeMcpInventory(inventory)),
				),
			);
		} else if (command === "check" && first && second) {
			const status = await workItemSelectionStatus(
				first,
				await loadRuntimeManifest(second),
			);
			if (status.state !== "ready") {
				console.error(status.remedy);
				process.exit(1);
			}
			if (status.selection) {
				console.log(
					`Work-item provider: ${describeSelection(status.selection)}`,
				);
			}
		} else if (command === "configure" && first && second && third) {
			const selection = await configureWorkItemProvider({
				repositoryRoot: first,
				providerId: second,
				runtime: await loadRuntimeManifest(third),
				replace: args.slice(4).includes("--replace"),
				settings: parseSettingArguments(args.slice(4)),
			});
			console.log(`Work-item provider: ${describeSelection(selection)}`);
		} else {
			console.error(
				"usage: work-item-config.ts options <runtime-manifest> | check <repo> <runtime-manifest> | configure <repo> <provider-id> <runtime-manifest> [--setting key=value]... [--replace]",
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
