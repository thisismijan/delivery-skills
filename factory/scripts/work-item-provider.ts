import {
	lstat,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { loadMcpInventory } from "./mcp-inventory";
import { mapMcpWorkItemResult } from "./mcp-normalize";
import {
	addMcpProviderContext,
	planMcpOperation,
	repositoryIdentity,
	routeMcpInventory,
} from "./mcp-route";
import { type RuntimeManifest, loadRuntimeManifest } from "./runtime-manifest";
import {
	readWorkItemSelection,
	workItemSelectionStatus,
} from "./work-item-config";

const Reference = z
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
		"work-item reference contains control characters",
	);
const AuditId = z
	.string()
	.regex(/^[a-z0-9][a-z0-9._:-]*$/)
	.max(200);

export const WorkItem = z
	.object({
		version: z.literal(1),
		provider: z.string().min(1),
		ref: Reference,
		type: z.enum(["bug", "story", "task", "other"]),
		title: z.string().trim().min(1),
		body: z.string().trim().min(1),
		blockedBy: z.array(Reference),
		sourceAuditId: AuditId.optional(),
		notes: z.array(
			z.object({
				auditId: AuditId,
				body: z.string().trim().min(1),
			}),
		),
	})
	.strict();
export type WorkItem = z.infer<typeof WorkItem>;

export const CreateWorkItemInput = z
	.object({
		approved: z.literal(true),
		auditId: AuditId,
		ref: Reference.optional(),
		type: z.enum(["bug", "story", "task", "other"]).default("story"),
		title: z.string().trim().min(1),
		body: z.string().trim().min(1),
		blockedBy: z.array(Reference).default([]),
	})
	.strict();
export type CreateWorkItemInput = z.input<typeof CreateWorkItemInput>;

export const LinkWorkItemInput = z
	.object({
		approved: z.literal(true),
		ref: Reference,
		blockedBy: z.array(Reference),
	})
	.strict();

export const NoteWorkItemInput = z
	.object({
		ref: Reference,
		auditId: AuditId,
		body: z.string().trim().min(1),
	})
	.strict();

export const ReadWorkItemInput = z.object({ ref: Reference }).strict();

export type WorkItemOperation = "list" | "read" | "create" | "link" | "note";

type OperationInput = unknown;

const PROVIDER_PROTOCOL_VERSION = 1;

function localDirectory(repositoryRoot: string): string {
	return join(repositoryRoot, ".delivery", "work-items");
}

function localJsonPath(repositoryRoot: string, ref: string): string {
	return join(
		localDirectory(repositoryRoot),
		`${encodeURIComponent(ref)}.json`,
	);
}

async function ensureLocalDirectory(repositoryRoot: string): Promise<string> {
	const directory = localDirectory(repositoryRoot);
	try {
		if ((await lstat(directory)).isSymbolicLink()) {
			throw new Error("refusing to use a symlinked work-item directory");
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	await mkdir(directory, { recursive: true });
	return directory;
}

async function writeLocalItem(
	repositoryRoot: string,
	item: WorkItem,
): Promise<void> {
	const path = localJsonPath(repositoryRoot, item.ref);
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(item, null, 2)}\n`, {
		mode: 0o600,
	});
	await rename(temporary, path);
	if (/^[A-Z][A-Z0-9]*-\d+$/.test(item.ref)) {
		await rm(join(localDirectory(repositoryRoot), `${item.ref}.md`), {
			force: true,
		});
	}
}

function parseLegacyMarkdown(input: string): WorkItem {
	const key = input.match(/^key:\s*(.+)$/m)?.[1]?.trim();
	const title = input.match(/^#\s+(.+)$/m)?.[1]?.trim();
	const blocked = input.match(/^blocked-by:\s*(.+)$/m)?.[1]?.trim() ?? "none";
	const bodyStart = input.search(/^#\s+.+$/m);
	const body =
		bodyStart >= 0
			? input.slice(bodyStart).split("\n").slice(2).join("\n").trim()
			: "";
	return WorkItem.parse({
		version: 1,
		provider: "local-files",
		ref: key,
		type: "story",
		title,
		body,
		blockedBy:
			blocked === "none"
				? []
				: blocked
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean),
		notes: [],
	});
}

export async function listLocalWorkItems(
	repositoryRoot: string,
): Promise<WorkItem[]> {
	const directory = await ensureLocalDirectory(repositoryRoot);
	const entries = await readdir(directory);
	const items: WorkItem[] = [];
	for (const entry of entries.sort()) {
		if (!entry.endsWith(".json") && !entry.endsWith(".md")) continue;
		const raw = await readFile(join(directory, entry), "utf8");
		items.push(
			entry.endsWith(".json")
				? WorkItem.parse(JSON.parse(raw))
				: parseLegacyMarkdown(raw),
		);
	}
	return items.sort((left, right) => left.ref.localeCompare(right.ref));
}

export async function readLocalWorkItem(
	repositoryRoot: string,
	ref: string,
): Promise<WorkItem> {
	const parsedRef = Reference.parse(ref);
	try {
		return WorkItem.parse(
			JSON.parse(
				await readFile(localJsonPath(repositoryRoot, parsedRef), "utf8"),
			),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (!/^[A-Z][A-Z0-9]*-\d+$/.test(parsedRef)) {
		throw new Error(`local work item '${parsedRef}' does not exist`);
	}
	const legacy = join(localDirectory(repositoryRoot), `${parsedRef}.md`);
	try {
		return parseLegacyMarkdown(await readFile(legacy, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`local work item '${parsedRef}' does not exist`);
		}
		throw error;
	}
}

async function nextLocalRef(repositoryRoot: string): Promise<string> {
	const numbers = (await listLocalWorkItems(repositoryRoot))
		.map((item) => item.ref.match(/^LOCAL-(\d+)$/)?.[1])
		.filter((value): value is string => value !== undefined)
		.map(Number);
	return `LOCAL-${Math.max(0, ...numbers) + 1}`;
}

export async function createLocalWorkItem(
	repositoryRoot: string,
	raw: unknown,
): Promise<WorkItem> {
	const input = CreateWorkItemInput.parse(raw);
	const directory = await ensureLocalDirectory(repositoryRoot);
	const existing = (await listLocalWorkItems(repositoryRoot)).find(
		(item) => item.sourceAuditId === input.auditId,
	);
	if (existing) {
		if (
			existing.title !== input.title ||
			existing.body !== input.body ||
			existing.type !== input.type ||
			JSON.stringify(existing.blockedBy) !== JSON.stringify(input.blockedBy)
		) {
			throw new Error(
				`audit id '${input.auditId}' already identifies different work-item content`,
			);
		}
		return existing;
	}

	const lock = join(directory, ".allocation.lock");
	try {
		await mkdir(lock);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(
				"local work-item allocation is locked; recover the abandoned .allocation.lock only after confirming no creator is active",
			);
		}
		throw error;
	}
	try {
		const ref = input.ref ?? (await nextLocalRef(repositoryRoot));
		try {
			await readLocalWorkItem(repositoryRoot, ref);
			throw new Error(`local work item '${ref}' already exists`);
		} catch (error) {
			if (error instanceof Error && !error.message.includes("does not exist")) {
				throw error;
			}
		}
		const item = WorkItem.parse({
			version: 1,
			provider: "local-files",
			ref,
			type: input.type,
			title: input.title,
			body: input.body,
			blockedBy: input.blockedBy,
			sourceAuditId: input.auditId,
			notes: [],
		});
		await writeLocalItem(repositoryRoot, item);
		return item;
	} finally {
		await rm(lock, { recursive: true, force: true });
	}
}

export async function linkLocalWorkItem(
	repositoryRoot: string,
	raw: unknown,
): Promise<WorkItem> {
	const input = LinkWorkItemInput.parse(raw);
	const item = await readLocalWorkItem(repositoryRoot, input.ref);
	const updated = WorkItem.parse({ ...item, blockedBy: input.blockedBy });
	await writeLocalItem(repositoryRoot, updated);
	return updated;
}

export async function noteLocalWorkItem(
	repositoryRoot: string,
	raw: unknown,
): Promise<WorkItem> {
	const input = NoteWorkItemInput.parse(raw);
	const item = await readLocalWorkItem(repositoryRoot, input.ref);
	const notes = item.notes.filter((note) => note.auditId !== input.auditId);
	notes.push({ auditId: input.auditId, body: input.body });
	const updated = WorkItem.parse({ ...item, notes });
	await writeLocalItem(repositoryRoot, updated);
	return updated;
}

function operationSchema(operation: WorkItemOperation): z.ZodType {
	switch (operation) {
		case "list":
			return z.object({}).strict();
		case "read":
			return ReadWorkItemInput;
		case "create":
			return CreateWorkItemInput;
		case "link":
			return LinkWorkItemInput;
		case "note":
			return NoteWorkItemInput;
	}
}

async function invokeRemoteProvider(options: {
	provider: string;
	invocation: string;
	operation: WorkItemOperation;
	repositoryRoot: string;
	input: unknown;
	settings?: Record<string, string>;
}): Promise<WorkItem | WorkItem[]> {
	if (!options.invocation.startsWith("exec:")) {
		throw new Error(
			`provider '${options.provider}' needs an executable bridge invocation`,
		);
	}
	const executable = options.invocation.slice("exec:".length);
	if (!isAbsolute(executable)) {
		throw new Error("remote work-item executable must be an absolute path");
	}
	const proc = Bun.spawn([executable, options.operation], {
		cwd: options.repositoryRoot,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	proc.stdin.write(
		JSON.stringify({
			version: PROVIDER_PROTOCOL_VERSION,
			provider: options.provider,
			repositoryRoot: options.repositoryRoot,
			// The repository's provider settings, e.g. which tracker project it files work items in.
			...(options.settings && Object.keys(options.settings).length > 0
				? { settings: options.settings }
				: {}),
			input: options.input,
		}),
	);
	proc.stdin.end();
	const [stdout, , code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(
			`provider '${options.provider}' failed ${options.operation} (exit ${code})`,
		);
	}
	const parsed = JSON.parse(stdout) as unknown;
	return options.operation === "list"
		? z.array(WorkItem).parse(parsed)
		: WorkItem.parse(parsed);
}

export async function planWorkItemOperation(options: {
	operation: WorkItemOperation;
	repositoryRoot: string;
	runtime: RuntimeManifest;
	input?: OperationInput;
}): Promise<
	| {
			transport: "mcp";
			provider: string;
			operation: WorkItemOperation;
			tool: { server: string; name: string };
			arguments: Record<string, unknown>;
	  }
	| {
			transport: "local-files" | "adapter";
			provider: string;
			operation: WorkItemOperation;
	  }
> {
	const input = operationSchema(options.operation).parse(options.input ?? {});
	const status = await workItemSelectionStatus(
		options.repositoryRoot,
		options.runtime,
	);
	if (status.state !== "ready" || !status.selection) {
		throw new Error(status.remedy ?? "work-item provider is not ready");
	}
	if (status.selection.provider.kind === "local-files") {
		return {
			transport: "local-files",
			provider: "local-files",
			operation: options.operation,
		};
	}
	const provider = status.selection.provider.id;
	const inventory = await loadMcpInventory(options.repositoryRoot);
	const rawPlan = planMcpOperation({
		route: routeMcpInventory(inventory),
		kind: "tracker",
		operation: options.operation,
		provider,
		input: {
			...(typeof input === "object" && input !== null
				? (input as Record<string, unknown>)
				: {}),
			settings: status.selection.provider.settings ?? {},
		},
	});
	const planned = rawPlan
		? addMcpProviderContext(rawPlan, {
				repository: await repositoryIdentity(options.repositoryRoot),
				settings: status.selection.provider.settings,
			})
		: undefined;
	if (planned) {
		return {
			transport: "mcp",
			provider,
			operation: options.operation,
			tool: planned.tool,
			arguments: planned.arguments,
		};
	}
	return {
		transport: "adapter",
		provider,
		operation: options.operation,
	};
}

export function normalizeWorkItemSessionResult(options: {
	provider: string;
	operation: WorkItemOperation;
	raw: unknown;
}): WorkItem | WorkItem[] {
	try {
		return options.operation === "list"
			? z.array(WorkItem).parse(options.raw)
			: WorkItem.parse(options.raw);
	} catch {
		const mapped = mapMcpWorkItemResult({
			provider: options.provider,
			operation: options.operation,
			raw: options.raw,
		});
		return options.operation === "list"
			? z.array(WorkItem).parse(mapped)
			: WorkItem.parse(mapped);
	}
}

export async function runWorkItemOperation(options: {
	operation: WorkItemOperation;
	repositoryRoot: string;
	runtime: RuntimeManifest;
	input?: OperationInput;
}): Promise<WorkItem | WorkItem[]> {
	const input = operationSchema(options.operation).parse(options.input ?? {});
	const status = await workItemSelectionStatus(
		options.repositoryRoot,
		options.runtime,
	);
	if (status.state !== "ready" || !status.selection) {
		throw new Error(status.remedy ?? "work-item provider is not ready");
	}
	if (status.selection.provider.kind === "local-files") {
		switch (options.operation) {
			case "list":
				return listLocalWorkItems(options.repositoryRoot);
			case "read":
				return readLocalWorkItem(
					options.repositoryRoot,
					ReadWorkItemInput.parse(input).ref,
				);
			case "create":
				return createLocalWorkItem(options.repositoryRoot, input);
			case "link":
				return linkLocalWorkItem(options.repositoryRoot, input);
			case "note":
				return noteLocalWorkItem(options.repositoryRoot, input);
		}
	}
	const provider = status.selection.provider.id;
	const inventory = await loadMcpInventory(options.repositoryRoot);
	if (
		planMcpOperation({
			route: routeMcpInventory(inventory),
			kind: "tracker",
			operation: options.operation,
			provider,
			input: {},
		})
	) {
		throw new Error(
			`Use session tools for ${provider} ${options.operation}, then work-item-provider.ts normalize.`,
		);
	}
	const tracker = options.runtime.capabilities["tracker.item"];
	if (
		!tracker?.available ||
		tracker.provider !== provider ||
		!tracker.invocation
	) {
		throw new Error(`selected provider '${provider}' is not available`);
	}
	return invokeRemoteProvider({
		provider: status.selection.provider.id,
		invocation: tracker.invocation,
		operation: options.operation,
		repositoryRoot: options.repositoryRoot,
		settings: status.selection.provider.settings,
		input,
	});
}

if (import.meta.main) {
	const [operation, repositoryRoot, manifestPath, inputPath] =
		process.argv.slice(2);
	try {
		if (operation === "plan") {
			const plannedOp = repositoryRoot as WorkItemOperation;
			const repo = manifestPath;
			const runtimePath = inputPath;
			const planInput = process.argv[6];
			if (
				!["list", "read", "create", "link", "note"].includes(plannedOp) ||
				!repo ||
				!runtimePath
			) {
				throw new Error(
					"usage: work-item-provider.ts plan <operation> <repository-root> <runtime-manifest> [input.json]",
				);
			}
			const result = await planWorkItemOperation({
				operation: plannedOp,
				repositoryRoot: repo,
				runtime: await loadRuntimeManifest(runtimePath),
				input: planInput ? await Bun.file(planInput).json() : {},
			});
			console.log(JSON.stringify(result, null, 2));
		} else if (operation === "normalize") {
			const normalizedOp = repositoryRoot as WorkItemOperation;
			const provider = manifestPath;
			const rawPath = inputPath;
			if (
				!["list", "read", "create", "link", "note"].includes(normalizedOp) ||
				!provider ||
				!rawPath
			) {
				throw new Error(
					"usage: work-item-provider.ts normalize <operation> <provider> <raw.json>",
				);
			}
			const result = normalizeWorkItemSessionResult({
				provider,
				operation: normalizedOp,
				raw: await Bun.file(rawPath).json(),
			});
			console.log(JSON.stringify(result, null, 2));
		} else {
			if (
				!["list", "read", "create", "link", "note"].includes(operation ?? "") ||
				!repositoryRoot ||
				!manifestPath ||
				(operation !== "list" && !inputPath)
			) {
				console.error(
					"usage: work-item-provider.ts <list|read|create|link|note> <repository-root> <runtime-manifest> [input.json]",
				);
				process.exit(2);
			}
			const result = await runWorkItemOperation({
				operation: operation as WorkItemOperation,
				repositoryRoot,
				runtime: await loadRuntimeManifest(manifestPath),
				input: inputPath ? await Bun.file(inputPath).json() : {},
			});
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
