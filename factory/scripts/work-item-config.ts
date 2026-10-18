import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type RuntimeManifest, loadRuntimeManifest } from "./runtime-manifest";

export const WORK_ITEM_CONFIG_PATH = ".delivery/work-items.json";
export const LOCAL_WORK_ITEM_PROVIDER = "local-files";

const ProviderId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

export const WorkItemSelection = z
	.object({
		version: z.literal(1),
		provider: z.object({
			id: ProviderId,
			kind: z.enum(["local-files", "remote"]),
		}),
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

export function workItemOptions(runtime: RuntimeManifest): WorkItemOption[] {
	const options: WorkItemOption[] = [
		{
			id: LOCAL_WORK_ITEM_PROVIDER,
			kind: "local-files",
			label: "Local files in .delivery/work-items",
		},
	];
	const tracker = runtime.capabilities["tracker.item"];
	if (tracker?.available && tracker.provider && tracker.invocation) {
		options.push({
			id: tracker.provider,
			kind: "remote",
			label: `${tracker.provider} through the configured runtime provider`,
			invocation: tracker.invocation,
		});
	}
	return options;
}

export async function readWorkItemSelection(
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
	if (
		!workItemOptions(runtime).some(
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
}): Promise<WorkItemSelection> {
	const available = workItemOptions(options.runtime);
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
	if (
		existing?.provider.id === selected.id &&
		existing.provider.kind === selected.kind
	) {
		return existing;
	}

	await mkdir(deliveryDirectory, { recursive: true });
	const selection = WorkItemSelection.parse({
		version: 1,
		provider: { id: selected.id, kind: selected.kind },
		confirmed: true,
	});
	const temporary = `${configPath}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(selection, null, 2)}\n`, {
		mode: 0o600,
	});
	await rename(temporary, configPath);
	return selection;
}

function formatOptions(runtime: RuntimeManifest): string {
	return workItemOptions(runtime)
		.map((option) => `${option.id}\t${option.label}`)
		.join("\n");
}

if (import.meta.main) {
	const [command, first, second, third, fourth] = process.argv.slice(2);
	try {
		if (command === "options" && first) {
			console.log(formatOptions(await loadRuntimeManifest(first)));
		} else if (command === "check" && first && second) {
			const status = await workItemSelectionStatus(
				first,
				await loadRuntimeManifest(second),
			);
			if (status.state !== "ready") {
				console.error(status.remedy);
				process.exit(1);
			}
			console.log(`Work-item provider: ${status.selection?.provider.id}`);
		} else if (command === "configure" && first && second && third) {
			const selection = await configureWorkItemProvider({
				repositoryRoot: first,
				providerId: second,
				runtime: await loadRuntimeManifest(third),
				replace: fourth === "--replace",
			});
			console.log(`Work-item provider: ${selection.provider.id}`);
		} else {
			console.error(
				"usage: work-item-config.ts options <runtime-manifest> | check <repo> <runtime-manifest> | configure <repo> <provider-id> <runtime-manifest> [--replace]",
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
