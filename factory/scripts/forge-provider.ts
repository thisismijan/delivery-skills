import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { loadMcpInventory } from "./mcp-inventory";
import { mapMcpForgeResult } from "./mcp-normalize";
import { mcpFamily, planMcpOperation, routeMcpInventory } from "./mcp-route";
import { checkNotePublication } from "./note-publication";
import {
	type RuntimeManifest,
	loadRuntimeManifest,
	lookupCapability,
	missingCapability,
} from "./runtime-manifest";

const PROVIDER_PROTOCOL_VERSION = 1;

const ProviderId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const ChangeRef = z
	.string()
	.trim()
	.min(1)
	.max(500)
	.refine(
		(value) =>
			![...value].some((character) => {
				const code = character.charCodeAt(0);
				return code < 32 || code === 127;
			}),
		"change reference contains control characters",
	);
const Revision = z.string().trim().min(1);
const BranchName = z.string().trim().min(1);

export const FORGE_OPERATIONS = [
	"find",
	"read",
	"pipeline",
	"files",
	"diff",
	"commits",
	"discussions",
	"anchors",
	"create",
	"set-draft",
	"note",
	"reply",
] as const;
export type ForgeOperation = (typeof FORGE_OPERATIONS)[number];

const FORGE_OPERATION_SET = new Set<string>(FORGE_OPERATIONS);
const HUMAN_OWNED_OPERATIONS = new Set([
	"merge",
	"close",
	"delete",
	"approve",
	"resolve",
]);
const MUTATION_OPERATIONS = new Set<ForgeOperation>([
	"create",
	"set-draft",
	"note",
	"reply",
]);
const PUBLICATION_OPERATIONS = new Set<ForgeOperation>(["note", "reply"]);

export const ForgeAnchor = z
	.object({
		path: z.string().trim().min(1),
		line: z.number().int().positive(),
		side: z.enum(["new", "old"]).optional(),
	})
	.strict();
export type ForgeAnchor = z.infer<typeof ForgeAnchor>;

export const ForgeChange = z
	.object({
		version: z.literal(1),
		provider: ProviderId,
		ref: ChangeRef,
		state: z.enum(["open", "closed", "merged"]),
		draft: z.boolean(),
		branches: z
			.object({
				source: BranchName,
				target: BranchName,
			})
			.strict(),
		revisions: z
			.object({
				head: Revision,
				base: Revision.optional(),
				start: Revision.optional(),
				merged: Revision.optional(),
			})
			.strict(),
		title: z.string().trim().min(1),
		description: z.string(),
		author: z.string().trim().min(1),
		url: z.string().trim().min(1),
		pipeline: z.discriminatedUnion("available", [
			z.object({ available: z.literal(false) }).strict(),
			z
				.object({
					available: z.literal(true),
					status: z.string().trim().min(1),
					revision: Revision,
					current: z.boolean(),
					url: z.string().trim().min(1).optional(),
				})
				.strict(),
		]),
		mergeability: z.discriminatedUnion("available", [
			z.object({ available: z.literal(false) }).strict(),
			z
				.object({
					available: z.literal(true),
					conflicts: z.boolean(),
					status: z.string().trim().min(1),
				})
				.strict(),
		]),
	})
	.strict();
export type ForgeChange = z.infer<typeof ForgeChange>;

export const ForgePipeline = z
	.object({
		version: z.literal(1),
		provider: ProviderId,
		revision: Revision,
		pipeline: z.discriminatedUnion("available", [
			z.object({ available: z.literal(false) }).strict(),
			z
				.object({
					available: z.literal(true),
					status: z.string().trim().min(1),
					revision: Revision,
					url: z.string().trim().min(1).optional(),
				})
				.strict(),
		]),
	})
	.strict()
	.superRefine((result, ctx) => {
		if (
			result.pipeline.available &&
			result.pipeline.revision !== result.revision
		) {
			ctx.addIssue({
				code: "custom",
				path: ["pipeline", "revision"],
				message: "pipeline evidence must match the requested revision",
			});
		}
	});
export type ForgePipeline = z.infer<typeof ForgePipeline>;

export const ForgeFindResult = z
	.object({
		version: z.literal(1),
		provider: ProviderId,
		changes: z.array(ForgeChange),
	})
	.strict();
export type ForgeFindResult = z.infer<typeof ForgeFindResult>;

const EvidenceIdentity = {
	version: z.literal(1),
	provider: ProviderId,
	ref: ChangeRef,
	headRevision: Revision,
};

export const ForgeChangedFile = z
	.object({
		path: z.string().trim().min(1),
		status: z.enum(["added", "deleted", "modified", "renamed"]),
		additions: z.number().int().nonnegative(),
		deletions: z.number().int().nonnegative(),
		previousPath: z.string().trim().min(1).optional(),
	})
	.strict()
	.superRefine((file, ctx) => {
		if (file.status === "renamed" && !file.previousPath) {
			ctx.addIssue({
				code: "custom",
				path: ["previousPath"],
				message: "a renamed file needs its previous path",
			});
		}
	});

export const ForgeFiles = z
	.object({
		...EvidenceIdentity,
		files: z.array(ForgeChangedFile),
	})
	.strict();
export type ForgeFiles = z.infer<typeof ForgeFiles>;

export const ForgeDiff = z
	.object({
		...EvidenceIdentity,
		unifiedDiff: z.string(),
		complete: z.literal(true),
	})
	.strict();
export type ForgeDiff = z.infer<typeof ForgeDiff>;

export const ForgeCommit = z
	.object({
		sha: Revision,
		author: z.string().trim().min(1),
		title: z.string().trim().min(1),
	})
	.strict();

export const ForgeCommits = z
	.object({
		...EvidenceIdentity,
		commits: z.array(ForgeCommit),
	})
	.strict();
export type ForgeCommits = z.infer<typeof ForgeCommits>;

export const ForgeDiscussionNote = z
	.object({
		id: z.string().trim().min(1),
		author: z.string().trim().min(1),
		body: z.string(),
		anchor: ForgeAnchor.optional(),
		system: z.boolean(),
		resolved: z.boolean(),
	})
	.strict();

export const ForgeDiscussion = z
	.object({
		id: z.string().trim().min(1),
		resolved: z.boolean(),
		notes: z.array(ForgeDiscussionNote),
	})
	.strict();

export const ForgeDiscussions = z
	.object({
		...EvidenceIdentity,
		discussions: z.array(ForgeDiscussion),
	})
	.strict();
export type ForgeDiscussions = z.infer<typeof ForgeDiscussions>;

export const ForgeAnchors = z
	.object({
		...EvidenceIdentity,
		anchors: z.array(ForgeAnchor),
	})
	.strict();
export type ForgeAnchors = z.infer<typeof ForgeAnchors>;

const MutationBase = {
	approved: z.literal(true).optional(),
	dryRun: z.boolean().optional(),
};

function approvedMutation<T extends z.ZodRawShape>(shape: T) {
	return z
		.object({ ...MutationBase, ...shape })
		.strict()
		.superRefine((input, ctx) => {
			if (input.dryRun !== true && input.approved !== true) {
				ctx.addIssue({
					code: "custom",
					path: ["approved"],
					message: "live forge mutations require approved: true",
				});
			}
		});
}

export const FindForgeChangesInput = z
	.object({
		sourceBranch: BranchName,
	})
	.strict();
export type FindForgeChangesInput = z.infer<typeof FindForgeChangesInput>;

export const ReadForgeChangeInput = z
	.object({
		ref: ChangeRef,
	})
	.strict();
export type ReadForgeChangeInput = z.infer<typeof ReadForgeChangeInput>;

export const ReadForgePipelineInput = z
	.object({
		revision: Revision,
	})
	.strict();
export type ReadForgePipelineInput = z.infer<typeof ReadForgePipelineInput>;

export const CreateForgeChangeInput = approvedMutation({
	draft: z.literal(true),
	title: z.string().trim().min(1),
	sourceBranch: BranchName,
	targetBranch: BranchName,
	description: z.string().default(""),
});
export type CreateForgeChangeInput = z.input<typeof CreateForgeChangeInput>;

export const SetForgeDraftInput = approvedMutation({
	ref: ChangeRef,
	draft: z.boolean(),
});
export type SetForgeDraftInput = z.input<typeof SetForgeDraftInput>;

export const PublishForgeNoteInput = approvedMutation({
	ref: ChangeRef,
	bodyPath: z.string().trim().min(1),
	anchor: ForgeAnchor.optional(),
});
export type PublishForgeNoteInput = z.input<typeof PublishForgeNoteInput>;

export const ReplyForgeDiscussionInput = approvedMutation({
	ref: ChangeRef,
	discussionId: z.string().trim().min(1),
	bodyPath: z.string().trim().min(1),
});
export type ReplyForgeDiscussionInput = z.input<
	typeof ReplyForgeDiscussionInput
>;

export const ForgeReceipt = z
	.object({
		version: z.literal(1),
		provider: ProviderId,
		ref: ChangeRef,
		operation: z.enum(["create", "set-draft", "note", "reply"]),
		url: z.string().trim().min(1).optional(),
		noteId: z.string().trim().min(1).optional(),
		discussionId: z.string().trim().min(1).optional(),
		draft: z.boolean().optional(),
	})
	.strict()
	.superRefine((receipt, ctx) => {
		const required: Array<keyof typeof receipt> =
			receipt.operation === "create"
				? ["url"]
				: receipt.operation === "set-draft"
					? ["draft"]
					: receipt.operation === "reply"
						? ["noteId", "discussionId"]
						: ["noteId"];
		for (const field of required) {
			if (receipt[field] === undefined) {
				ctx.addIssue({
					code: "custom",
					path: [field],
					message: `${receipt.operation} receipt needs ${field}`,
				});
			}
		}
	});
export type ForgeReceipt = z.infer<typeof ForgeReceipt>;

export const ForgeDryRun = z
	.object({
		version: z.literal(1),
		provider: ProviderId,
		operation: z.enum(["create", "set-draft", "note", "reply"]),
		dryRun: z.literal(true),
		input: z.unknown(),
	})
	.strict();
export type ForgeDryRun = z.infer<typeof ForgeDryRun>;

export type ForgeOperationResult =
	| ForgeFindResult
	| ForgeChange
	| ForgePipeline
	| ForgeFiles
	| ForgeDiff
	| ForgeCommits
	| ForgeDiscussions
	| ForgeAnchors
	| ForgeReceipt
	| ForgeDryRun;

export function isForgeOperation(value: string): value is ForgeOperation {
	return FORGE_OPERATION_SET.has(value);
}

export function parseForgeOperationInput(
	operation: ForgeOperation,
	input: unknown,
): unknown {
	return operationSchema(operation).parse(input ?? {});
}

export function parseForgeOperationResult(
	operation: ForgeOperation,
	output: unknown,
): Exclude<ForgeOperationResult, ForgeDryRun> {
	const parsed = resultSchema(operation).parse(output) as Exclude<
		ForgeOperationResult,
		ForgeDryRun
	>;
	if (
		MUTATION_OPERATIONS.has(operation) &&
		"operation" in parsed &&
		parsed.operation !== operation
	) {
		throw new Error(
			"The forge provider returned a result for a different operation.",
		);
	}
	return parsed;
}

function operationSchema(operation: ForgeOperation): z.ZodType {
	switch (operation) {
		case "find":
			return FindForgeChangesInput;
		case "read":
			return ReadForgeChangeInput;
		case "pipeline":
			return ReadForgePipelineInput;
		case "files":
		case "diff":
		case "commits":
		case "discussions":
		case "anchors":
			return ReadForgeChangeInput;
		case "create":
			return CreateForgeChangeInput;
		case "set-draft":
			return SetForgeDraftInput;
		case "note":
			return PublishForgeNoteInput;
		case "reply":
			return ReplyForgeDiscussionInput;
	}
}

function resultSchema(operation: ForgeOperation): z.ZodType {
	switch (operation) {
		case "find":
			return ForgeFindResult;
		case "read":
			return ForgeChange;
		case "pipeline":
			return ForgePipeline;
		case "files":
			return ForgeFiles;
		case "diff":
			return ForgeDiff;
		case "commits":
			return ForgeCommits;
		case "discussions":
			return ForgeDiscussions;
		case "anchors":
			return ForgeAnchors;
		case "create":
		case "set-draft":
		case "note":
		case "reply":
			return ForgeReceipt;
	}
}

function requestedRef(
	operation: ForgeOperation,
	input: unknown,
): string | undefined {
	if (operation === "find" || operation === "create") return undefined;
	if (
		typeof input === "object" &&
		input !== null &&
		"ref" in input &&
		typeof input.ref === "string"
	) {
		return input.ref;
	}
	return undefined;
}

function assertRequestedRevision(
	operation: ForgeOperation,
	input: unknown,
	result: Exclude<ForgeOperationResult, ForgeDryRun>,
): void {
	if (operation !== "pipeline" || !("revision" in result)) return;
	if (
		typeof input === "object" &&
		input !== null &&
		"revision" in input &&
		input.revision !== result.revision
	) {
		throw new Error(
			"The forge provider returned pipeline evidence for a different revision.",
		);
	}
}

function assertBoundResult(
	result: Exclude<ForgeOperationResult, ForgeDryRun>,
	provider: string,
	ref: string | undefined,
): void {
	if (result.provider !== provider) {
		throw new Error(
			"The forge provider returned a result for a different provider.",
		);
	}
	if ("changes" in result) {
		for (const change of result.changes) {
			if (change.provider !== provider) {
				throw new Error(
					"The forge provider returned a result for a different provider.",
				);
			}
		}
		return;
	}
	if (ref !== undefined && "ref" in result && result.ref !== ref) {
		throw new Error(
			"The forge provider returned a result for a different change.",
		);
	}
}

function requireCapability(
	runtime: RuntimeManifest,
	id: "forge.change" | "review.publish",
): { provider: string; invocation: string } {
	const descriptor = lookupCapability(runtime, id);
	if (
		!descriptor?.available ||
		!descriptor.provider ||
		!descriptor.invocation
	) {
		throw new Error(missingCapability(id).remedy);
	}
	return {
		provider: descriptor.provider,
		invocation: descriptor.invocation,
	};
}

function executablePath(invocation: string): string {
	if (!invocation.startsWith("exec:")) {
		throw new Error(
			"The forge provider needs an executable bridge invocation.",
		);
	}
	const executable = invocation.slice("exec:".length);
	if (!isAbsolute(executable)) {
		throw new Error("The forge adapter executable must be an absolute path.");
	}
	return executable;
}

function resolvePublicationBody(
	bodyPath: string,
	repositoryRoot: string,
): string {
	const resolved = isAbsolute(bodyPath)
		? bodyPath
		: join(repositoryRoot, bodyPath);
	const check = checkNotePublication(
		{ bodyPath: resolved, repoRoot: repositoryRoot },
		{
			realpath: realpathSync,
			readFile: (path) => readFileSync(path, "utf8"),
		},
	);
	if (!check.allowed) {
		throw new Error(check.reason ?? "Note publication refused.");
	}
	const body = readFileSync(realpathSync(resolved), "utf8");
	if (body.trim().length === 0) {
		throw new Error("The note body is empty.");
	}
	return body;
}

function adapterInput(
	operation: ForgeOperation,
	parsed: unknown,
	body?: string,
): unknown {
	if (typeof parsed !== "object" || parsed === null) return parsed;
	const rest = Object.fromEntries(
		Object.entries(parsed as Record<string, unknown>).filter(
			([key]) => key !== "dryRun" && key !== "bodyPath",
		),
	);
	if (PUBLICATION_OPERATIONS.has(operation)) {
		return { ...rest, body };
	}
	return rest;
}

async function invokeForgeAdapter(options: {
	provider: string;
	executable: string;
	operation: ForgeOperation;
	repositoryRoot: string;
	input: unknown;
}): Promise<Exclude<ForgeOperationResult, ForgeDryRun>> {
	const proc = Bun.spawn([options.executable, options.operation], {
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
			`The forge provider failed ${options.operation} (exit ${code}).`,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout) as unknown;
	} catch {
		throw new Error("The forge provider returned invalid JSON.");
	}
	const result = parseForgeOperationResult(options.operation, parsed);
	assertBoundResult(
		result,
		options.provider,
		requestedRef(options.operation, options.input),
	);
	assertRequestedRevision(options.operation, options.input, result);
	return result;
}

export async function planForgeOperation(options: {
	operation: string;
	repositoryRoot: string;
	runtime: RuntimeManifest;
	input?: unknown;
}): Promise<
	| {
			transport: "mcp";
			provider: string;
			operation: ForgeOperation;
			tool: { server: string; name: string };
			arguments: Record<string, unknown>;
	  }
	| { transport: "adapter"; provider: string; operation: ForgeOperation }
> {
	if (HUMAN_OWNED_OPERATIONS.has(options.operation)) {
		throw new Error(
			"Merge, close, and discussion resolution stay with a human.",
		);
	}
	if (!isForgeOperation(options.operation)) {
		throw new Error(`Unsupported forge operation '${options.operation}'.`);
	}
	const input = parseForgeOperationInput(options.operation, options.input);
	const advertised = lookupCapability(options.runtime, "forge.change");
	const inventory = await loadMcpInventory(options.repositoryRoot);
	const route = routeMcpInventory(inventory);
	const provider =
		advertised?.available && advertised.provider
			? advertised.provider
			: mcpFamily(route, "forge")?.provider;
	if (!provider) {
		throw new Error(missingCapability("forge.change").remedy);
	}
	if (PUBLICATION_OPERATIONS.has(options.operation)) {
		const review = lookupCapability(options.runtime, "review.publish");
		if (review?.available && review.provider && review.provider !== provider) {
			throw new Error(
				"Change inspection and review publication name different providers. Advertise the same provider on both capabilities in the runtime manifest.",
			);
		}
	}
	let body: string | undefined;
	if (options.operation === "note" || options.operation === "reply") {
		const publication = input as { bodyPath: string };
		body = resolvePublicationBody(publication.bodyPath, options.repositoryRoot);
	}
	const request = adapterInput(options.operation, input, body);
	const planned = planMcpOperation({
		route,
		kind: "forge",
		operation: options.operation,
		provider,
		input: {
			...((typeof request === "object" && request !== null
				? request
				: {}) as Record<string, unknown>),
		},
	});
	if (planned) {
		return {
			transport: "mcp",
			provider,
			operation: options.operation,
			tool: planned.tool,
			arguments: planned.arguments,
		};
	}
	if (!advertised?.available || !advertised.invocation) {
		throw new Error(missingCapability("forge.change").remedy);
	}
	executablePath(advertised.invocation);
	return {
		transport: "adapter",
		provider,
		operation: options.operation,
	};
}

export function normalizeForgeSessionResult(options: {
	operation: string;
	provider: string;
	raw: unknown;
	input?: unknown;
}): Exclude<ForgeOperationResult, ForgeDryRun> {
	if (!isForgeOperation(options.operation)) {
		throw new Error(`Unsupported forge operation '${options.operation}'.`);
	}
	try {
		return parseForgeOperationResult(options.operation, options.raw);
	} catch {
		const mapped = mapMcpForgeResult({
			provider: options.provider,
			operation: options.operation,
			raw: options.raw,
			input: options.input,
		});
		const result = parseForgeOperationResult(options.operation, mapped);
		assertBoundResult(
			result,
			options.provider,
			requestedRef(options.operation, options.input),
		);
		assertRequestedRevision(options.operation, options.input, result);
		return result;
	}
}

export async function runForgeOperation(options: {
	operation: string;
	repositoryRoot: string;
	runtime: RuntimeManifest;
	input?: unknown;
}): Promise<ForgeOperationResult> {
	if (HUMAN_OWNED_OPERATIONS.has(options.operation)) {
		throw new Error(
			"Merge, close, and discussion resolution stay with a human.",
		);
	}
	if (!isForgeOperation(options.operation)) {
		throw new Error(`Unsupported forge operation '${options.operation}'.`);
	}
	const input = parseForgeOperationInput(options.operation, options.input);
	const forge = requireCapability(options.runtime, "forge.change");
	const review = PUBLICATION_OPERATIONS.has(options.operation)
		? requireCapability(options.runtime, "review.publish")
		: undefined;
	if (review && review.provider !== forge.provider) {
		throw new Error(
			"Change inspection and review publication name different providers. Advertise the same provider on both capabilities in the runtime manifest.",
		);
	}
	const invocation = review?.invocation ?? forge.invocation;
	const executable = executablePath(invocation);
	if (review) executablePath(forge.invocation);

	let body: string | undefined;
	if (options.operation === "note" || options.operation === "reply") {
		const publication = input as { bodyPath: string };
		body = resolvePublicationBody(publication.bodyPath, options.repositoryRoot);
	}

	const request = adapterInput(options.operation, input, body);
	const dryRun =
		MUTATION_OPERATIONS.has(options.operation) &&
		typeof input === "object" &&
		input !== null &&
		"dryRun" in input &&
		input.dryRun === true;
	if (dryRun) {
		return ForgeDryRun.parse({
			version: 1,
			provider: forge.provider,
			operation: options.operation,
			dryRun: true,
			input: request,
		});
	}

	return invokeForgeAdapter({
		provider: forge.provider,
		executable,
		operation: options.operation,
		repositoryRoot: options.repositoryRoot,
		input: request,
	});
}

if (import.meta.main) {
	const [operation, repositoryRoot, manifestPath, inputPath] =
		process.argv.slice(2);
	try {
		if (operation === "plan") {
			const plannedOp = repositoryRoot;
			const repo = manifestPath;
			const runtimePath = inputPath;
			const planInput = process.argv[6];
			if (!plannedOp || !repo || !runtimePath || !planInput) {
				throw new Error(
					"usage: forge-provider.ts plan <operation> <repository-root> <runtime-manifest> <input.json>",
				);
			}
			const result = await planForgeOperation({
				operation: plannedOp,
				repositoryRoot: repo,
				runtime: await loadRuntimeManifest(runtimePath),
				input: await Bun.file(planInput).json(),
			});
			console.log(JSON.stringify(result, null, 2));
		} else if (operation === "normalize") {
			const normalizedOp = repositoryRoot;
			const provider = manifestPath;
			const rawPath = inputPath;
			const originalInput = process.argv[6];
			if (!normalizedOp || !provider || !rawPath) {
				throw new Error(
					"usage: forge-provider.ts normalize <operation> <provider> <raw.json> [input.json]",
				);
			}
			const result = normalizeForgeSessionResult({
				operation: normalizedOp,
				provider,
				raw: await Bun.file(rawPath).json(),
				input: originalInput ? await Bun.file(originalInput).json() : undefined,
			});
			console.log(JSON.stringify(result, null, 2));
		} else {
			if (!operation || !repositoryRoot || !manifestPath || !inputPath) {
				console.error(
					"usage: forge-provider.ts <find|read|pipeline|files|diff|commits|discussions|anchors|create|set-draft|note|reply> <repository-root> <runtime-manifest> <input.json>",
				);
				process.exit(2);
			}
			const result = await runForgeOperation({
				operation,
				repositoryRoot,
				runtime: await loadRuntimeManifest(manifestPath),
				input: await Bun.file(inputPath).json(),
			});
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
