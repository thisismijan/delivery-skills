import type { ForgeOperation } from "./forge-provider";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function unwrap(value: unknown): unknown {
	if (!isRecord(value)) return value;
	for (const key of [
		"result",
		"data",
		"content",
		"issue",
		"merge_request",
		"mergeRequest",
		"pull_request",
		"pullRequest",
		"pipeline",
	]) {
		if (value[key] !== undefined) return unwrap(value[key]);
	}
	return value;
}

function textOf(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join("\n");
	if (!isRecord(value)) return "";
	if (typeof value.content === "string") return value.content;
	if (Array.isArray(value.content)) return textOf(value.content);
	if (typeof value.text === "string") return value.text;
	if (typeof value.summary === "string") return value.summary;
	if (isRecord(value.fields) && value.fields.description !== undefined) {
		return textOf(value.fields.description);
	}
	return "";
}

function authorOf(value: unknown): string {
	if (typeof value === "string") return value;
	if (!isRecord(value)) return "unknown";
	return (
		asString(value.name) ||
		asString(value.login) ||
		asString(value.username) ||
		asString(value.displayName) ||
		"unknown"
	);
}

function changeState(value: unknown): "open" | "closed" | "merged" {
	const state = asString(value)?.toLowerCase();
	if (state === "merged" || state === "merge") return "merged";
	if (state === "closed" || state === "declined") return "closed";
	return "open";
}

function forgeChange(provider: string, raw: unknown): Record<string, unknown> {
	const value = unwrap(raw);
	if (!isRecord(value))
		throw new Error("Session tool output was not a change.");
	const iid =
		asString(value.iid) ||
		asString(value.ref) ||
		(asNumber(value.iid) !== undefined ? String(value.iid) : undefined) ||
		(asNumber(value.number) !== undefined ? String(value.number) : undefined);
	if (!iid) throw new Error("Session tool output is missing a change id.");
	const source =
		asString(value.source_branch) ||
		(isRecord(value.head) ? asString(value.head.ref) : undefined) ||
		(isRecord(value.branches) ? asString(value.branches.source) : undefined);
	const target =
		asString(value.target_branch) ||
		(isRecord(value.base) ? asString(value.base.ref) : undefined) ||
		(isRecord(value.branches) ? asString(value.branches.target) : undefined);
	const head =
		asString(value.sha) ||
		(isRecord(value.sha) ? asString(value.sha.head) : undefined) ||
		(isRecord(value.diff_refs)
			? asString(value.diff_refs.head_sha)
			: undefined) ||
		(isRecord(value.head) ? asString(value.head.sha) : undefined) ||
		(isRecord(value.revisions) ? asString(value.revisions.head) : undefined);
	const merged =
		asString(value.merge_commit_sha) ||
		(isRecord(value.revisions) ? asString(value.revisions.merged) : undefined);
	if (!source || !target || !head) {
		throw new Error(
			"Session tool output is missing branch or revision evidence.",
		);
	}
	const pipelineRaw = isRecord(value.head_pipeline)
		? value.head_pipeline
		: isRecord(value.pipeline)
			? value.pipeline
			: undefined;
	return {
		version: 1,
		provider,
		ref: iid,
		state: changeState(value.state || value.status),
		draft:
			asBoolean(value.draft) === true ||
			asBoolean(value.work_in_progress) === true ||
			asBoolean(value.isDraft) === true,
		branches: { source, target },
		revisions: {
			head,
			...(merged ? { merged } : {}),
		},
		title: (asString(value.title) ?? "Untitled").replace(/^draft:\s*/i, ""),
		description: asString(value.description) ?? asString(value.body) ?? "",
		author: authorOf(value.author ?? value.user),
		url:
			asString(value.web_url) ||
			asString(value.html_url) ||
			asString(value.url) ||
			`change://${provider}/${iid}`,
		pipeline:
			pipelineRaw && asString(pipelineRaw.status)
				? {
						available: true,
						status: asString(pipelineRaw.status),
						revision: asString(pipelineRaw.sha) ?? head,
						current: (asString(pipelineRaw.sha) ?? head) === head,
						...(asString(pipelineRaw.web_url)
							? { url: asString(pipelineRaw.web_url) }
							: {}),
					}
				: { available: false },
		mergeability:
			typeof value.mergeable === "boolean"
				? {
						available: true,
						conflicts: value.mergeable === false,
						status: value.mergeable ? "can_merge" : "cannot_merge",
					}
				: { available: false },
	};
}

function listOf(value: unknown, keys: string[]): unknown[] {
	const unwrapped = unwrap(value);
	if (Array.isArray(unwrapped)) return unwrapped;
	if (!isRecord(unwrapped)) return [];
	for (const key of keys) {
		if (Array.isArray(unwrapped[key])) return unwrapped[key] as unknown[];
	}
	return [];
}

function pipelineStatus(raw: unknown, revision: string, provider: string) {
	const value = unwrap(raw);
	const runs = listOf(value, [
		"check_runs",
		"statuses",
		"workflows",
		"pipelines",
		"jobs",
	]);
	const first = isRecord(value)
		? value
		: isRecord(runs[0])
			? runs[0]
			: undefined;
	const status =
		asString(first?.conclusion) ||
		asString(first?.status) ||
		asString(first?.state) ||
		(runs.length === 0 ? undefined : "unknown");
	if (!status) {
		return {
			version: 1,
			provider,
			revision,
			pipeline: { available: false },
		};
	}
	const namedRevision =
		asString(first?.head_sha) ?? asString(first?.sha) ?? revision;
	return {
		version: 1,
		provider,
		revision,
		pipeline: {
			available: true,
			status,
			revision: namedRevision,
			...(asString(first?.html_url) || asString(first?.web_url)
				? { url: asString(first?.html_url) ?? asString(first?.web_url) }
				: {}),
		},
	};
}

function filesResult(
	provider: string,
	ref: string,
	head: string,
	raw: unknown,
) {
	const files = listOf(raw, ["files", "changes", "diffs"]).map((entry) => {
		if (!isRecord(entry))
			throw new Error("Session tool file list was malformed.");
		const path =
			asString(entry.filename) ||
			asString(entry.new_path) ||
			asString(entry.path);
		if (!path) throw new Error("Session tool file list is missing a path.");
		const previous =
			asString(entry.previous_filename) || asString(entry.old_path);
		const statusRaw = asString(entry.status) ?? "";
		const status =
			statusRaw === "added" || asBoolean(entry.new_file)
				? "added"
				: statusRaw === "removed" || asBoolean(entry.deleted_file)
					? "deleted"
					: previous && previous !== path
						? "renamed"
						: "modified";
		return {
			path,
			status,
			additions: asNumber(entry.additions) ?? 0,
			deletions: asNumber(entry.deletions) ?? 0,
			...(status === "renamed" && previous ? { previousPath: previous } : {}),
		};
	});
	return {
		version: 1,
		provider,
		ref,
		headRevision: head,
		files,
	};
}

function diffResult(provider: string, ref: string, head: string, raw: unknown) {
	const value = unwrap(raw);
	const unified =
		asString(value) ||
		(isRecord(value)
			? asString(value.unifiedDiff) || asString(value.diff)
			: undefined) ||
		listOf(value, ["files", "changes", "diffs"])
			.map((entry) => {
				if (!isRecord(entry)) return "";
				const path =
					asString(entry.filename) ||
					asString(entry.new_path) ||
					asString(entry.path) ||
					"unknown";
				const patch = asString(entry.patch) || asString(entry.diff) || "";
				return `=== ${path} ===\n${patch}`.trimEnd();
			})
			.filter(Boolean)
			.join("\n");
	if (unified === undefined) {
		throw new Error("Session tool output did not include a complete diff.");
	}
	return {
		version: 1,
		provider,
		ref,
		headRevision: head,
		unifiedDiff: unified,
		complete: true,
	};
}

function commitsResult(
	provider: string,
	ref: string,
	head: string,
	raw: unknown,
) {
	const commits = listOf(raw, ["commits"]).map((entry) => {
		const value = unwrap(entry);
		if (!isRecord(value))
			throw new Error("Session tool commit list was malformed.");
		const sha =
			asString(value.sha) ||
			asString(value.id) ||
			(isRecord(value.commit) ? asString(value.sha) : undefined);
		const title =
			asString(value.title) ||
			asString(value.message)?.split("\n")[0] ||
			(isRecord(value.commit)
				? asString(value.commit.message)?.split("\n")[0]
				: undefined);
		if (!sha || !title) {
			throw new Error("Session tool commit list is missing a sha or title.");
		}
		return {
			sha,
			author: authorOf(
				value.author ??
					(isRecord(value.commit) ? value.commit.author : undefined) ??
					value.committer,
			),
			title,
		};
	});
	return {
		version: 1,
		provider,
		ref,
		headRevision: head,
		commits,
	};
}

function discussionsResult(
	provider: string,
	ref: string,
	head: string,
	raw: unknown,
) {
	const items = listOf(raw, [
		"discussions",
		"notes",
		"comments",
		"review_comments",
	]);
	const discussions = items.map((entry, index) => {
		const value = unwrap(entry);
		if (!isRecord(value)) {
			throw new Error("Session tool discussion list was malformed.");
		}
		const notes = Array.isArray(value.notes) ? value.notes : [value];
		const id =
			asString(value.id) ??
			asString(value.node_id) ??
			`discussion-${index + 1}`;
		return {
			id: String(id),
			resolved: asBoolean(value.resolved) === true,
			notes: notes.map((note, noteIndex) => {
				if (!isRecord(note)) {
					throw new Error("Session tool discussion note was malformed.");
				}
				const noteId = asString(note.id) ?? `${id}:${noteIndex + 1}`;
				const anchorPath = asString(note.path) || asString(note.file_path);
				const line = asNumber(note.line) ?? asNumber(note.new_line);
				return {
					id: String(noteId),
					author: authorOf(note.author ?? note.user),
					body: asString(note.body) ?? asString(note.note) ?? "",
					system: asBoolean(note.system) === true,
					resolved: asBoolean(note.resolved) === true,
					...(anchorPath && line
						? { anchor: { path: anchorPath, line, side: "new" as const } }
						: {}),
				};
			}),
		};
	});
	return {
		version: 1,
		provider,
		ref,
		headRevision: head,
		discussions,
	};
}

function anchorsResult(
	provider: string,
	ref: string,
	head: string,
	raw: unknown,
) {
	const files = listOf(raw, ["files", "changes", "diffs"]);
	const anchors: Array<{ path: string; line: number; side: "new" }> = [];
	for (const entry of files) {
		if (!isRecord(entry)) continue;
		const path =
			asString(entry.filename) ||
			asString(entry.new_path) ||
			asString(entry.path);
		const patch = asString(entry.patch) || asString(entry.diff) || "";
		if (!path || !patch) continue;
		let line = 0;
		for (const rawLine of patch.split("\n")) {
			if (rawLine.startsWith("@@")) {
				const match = rawLine.match(/\+(\d+)/);
				line = match ? Number(match[1]) - 1 : line;
				continue;
			}
			if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
				line += 1;
				anchors.push({ path, line, side: "new" });
				continue;
			}
			if (!rawLine.startsWith("-")) line += 1;
		}
	}
	return {
		version: 1,
		provider,
		ref,
		headRevision: head,
		anchors,
	};
}

function receiptResult(
	provider: string,
	operation: ForgeOperation,
	ref: string | undefined,
	raw: unknown,
) {
	const value = unwrap(raw);
	if (!isRecord(value))
		throw new Error("Session tool mutation output was malformed.");
	const resultRef =
		ref ||
		asString(value.iid) ||
		(asNumber(value.iid) !== undefined ? String(value.iid) : undefined) ||
		(asNumber(value.number) !== undefined ? String(value.number) : undefined) ||
		asString(value.ref);
	if (!resultRef)
		throw new Error("Session tool mutation output is missing a change id.");
	return {
		version: 1,
		provider,
		ref: resultRef,
		operation,
		url:
			asString(value.web_url) ||
			asString(value.html_url) ||
			asString(value.url),
		noteId:
			asString(value.noteId) ||
			asString(value.id) ||
			(asNumber(value.id) !== undefined ? String(value.id) : undefined),
		discussionId: asString(value.discussionId) || asString(value.discussion_id),
		draft: asBoolean(value.draft),
	};
}

function requestedString(input: unknown, key: string): string | undefined {
	if (!isRecord(input)) return undefined;
	return asString(input[key]);
}

export function mapMcpForgeResult(options: {
	provider: string;
	operation: ForgeOperation;
	raw: unknown;
	input?: unknown;
}): unknown {
	const ref = requestedString(options.input, "ref");
	const revision = requestedString(options.input, "revision") ?? "unknown";
	switch (options.operation) {
		case "find":
			return {
				version: 1,
				provider: options.provider,
				changes: listOf(options.raw, [
					"changes",
					"merge_requests",
					"pull_requests",
					"items",
					"issues",
				]).map((entry) => forgeChange(options.provider, entry)),
			};
		case "read":
			return forgeChange(options.provider, options.raw);
		case "pipeline":
			return pipelineStatus(options.raw, revision, options.provider);
		case "files":
			return filesResult(
				options.provider,
				ref ?? "unknown",
				revision === "unknown" ? "head" : revision,
				options.raw,
			);
		case "diff":
			return diffResult(
				options.provider,
				ref ?? "unknown",
				revision === "unknown" ? "head" : revision,
				options.raw,
			);
		case "commits":
			return commitsResult(
				options.provider,
				ref ?? "unknown",
				revision === "unknown" ? "head" : revision,
				options.raw,
			);
		case "discussions":
			return discussionsResult(
				options.provider,
				ref ?? "unknown",
				revision === "unknown" ? "head" : revision,
				options.raw,
			);
		case "anchors":
			return anchorsResult(
				options.provider,
				ref ?? "unknown",
				revision === "unknown" ? "head" : revision,
				options.raw,
			);
		case "create":
		case "set-draft":
		case "note":
		case "reply":
			return receiptResult(
				options.provider,
				options.operation,
				ref,
				options.raw,
			);
	}
}

function issueType(
	name: string | undefined,
): "bug" | "story" | "task" | "other" {
	const lowered = name?.toLowerCase() ?? "";
	if (lowered.includes("bug")) return "bug";
	if (lowered.includes("task")) return "task";
	if (lowered.includes("story")) return "story";
	return "other";
}

function workItemFromUnknown(provider: string, raw: unknown): unknown {
	const value = unwrap(raw);
	if (!isRecord(value))
		throw new Error("Session tool output was not a work item.");
	if (isRecord(value.fields)) {
		const key = asString(value.key);
		const summary = asString(value.fields.summary);
		const typeName = isRecord(value.fields.issuetype)
			? asString(value.fields.issuetype.name)
			: undefined;
		if (!key || !summary) {
			throw new Error(
				"Session tool output is missing a work-item key or title.",
			);
		}
		const links = Array.isArray(value.fields.issuelinks)
			? value.fields.issuelinks
			: [];
		const blockedBy = links.flatMap((link) => {
			if (!isRecord(link) || !isRecord(link.inwardIssue)) return [];
			const typeName = isRecord(link.type)
				? asString(link.type.inward)
				: undefined;
			if (typeName && !/block/i.test(typeName)) return [];
			return asString(link.inwardIssue.key)
				? [asString(link.inwardIssue.key)]
				: [];
		});
		return {
			version: 1,
			provider,
			ref: key,
			type: issueType(typeName),
			title: summary,
			body: textOf(value.fields.description) || summary,
			blockedBy,
			notes: [],
		};
	}
	const ref =
		asString(value.ref) ||
		asString(value.iid) ||
		(asNumber(value.iid) !== undefined ? String(value.iid) : undefined) ||
		(asNumber(value.number) !== undefined ? String(value.number) : undefined);
	const title = asString(value.title);
	if (!ref || !title) {
		throw new Error(
			"Session tool output is missing a work-item reference or title.",
		);
	}
	return {
		version: 1,
		provider,
		ref,
		type: issueType(asString(value.type)),
		title,
		body: asString(value.body) || asString(value.description) || title,
		blockedBy: Array.isArray(value.blockedBy)
			? value.blockedBy.filter(
					(item): item is string => typeof item === "string",
				)
			: [],
		notes: Array.isArray(value.notes) ? value.notes : [],
	};
}

export function mapMcpWorkItemResult(options: {
	provider: string;
	operation: "list" | "read" | "create" | "link" | "note";
	raw: unknown;
}): unknown {
	if (options.operation === "list") {
		return listOf(options.raw, ["issues", "items", "values", "workItems"]).map(
			(item) => workItemFromUnknown(options.provider, item),
		);
	}
	return workItemFromUnknown(options.provider, options.raw);
}
