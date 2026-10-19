#!/usr/bin/env bun
import {
	PROTOCOL_VERSION,
	PROVIDER_ID,
	apiUrl,
	asBoolean,
	asNumber,
	asString,
	defaultGitLabHostDeps,
	fail,
	gitlabCall,
	gitlabGet,
	gitlabPaged,
	isRecord,
	parseGitOrigin,
	resolveGitLabTarget,
	resolveGitLabToken,
} from "./gitlab-host";
import type {
	GitLabForgeDeps,
	GitLabRequest,
	GitLabTarget,
} from "./gitlab-host";

export {
	PROTOCOL_VERSION,
	PROVIDER_ID,
	parseGitOrigin,
	resolveGitLabTarget,
	resolveGitLabToken,
};
export type { GitLabForgeDeps, GitLabRequest, GitLabTarget };

export const GITLAB_FORGE_OPERATIONS = [
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
export type GitLabForgeOperation = (typeof GITLAB_FORGE_OPERATIONS)[number];

const FORBIDDEN_OPERATIONS = new Set([
	"merge",
	"close",
	"delete",
	"approve",
	"resolve",
]);

export interface GitLabAnchor {
	path: string;
	line: number;
	side?: "new" | "old";
}

export function isGitLabForgeOperation(
	value: string,
): value is GitLabForgeOperation {
	return (GITLAB_FORGE_OPERATIONS as readonly string[]).includes(value);
}

export function gitlabIidFromRef(ref: string): string {
	const trimmed = ref.trim();
	const match = trimmed.match(/^!?(\d+)$/);
	const iid = match?.[1];
	if (!iid) {
		fail("GitLab merge request id must be numeric.");
	}
	return iid;
}

export function addedLineAnchors(
	changes: Array<{ new_path?: unknown; diff?: unknown }>,
): GitLabAnchor[] {
	const anchors: GitLabAnchor[] = [];
	for (const change of changes) {
		const path = asString(change.new_path);
		if (!path) continue;
		let line = 0;
		for (const raw of asString(change.diff)?.split("\n") ?? []) {
			if (raw.startsWith("@@")) {
				const match = raw.match(/\+(\d+)/);
				line = match?.[1] ? Number(match[1]) : 0;
				continue;
			}
			if (line === 0) continue;
			if (raw.startsWith("\\")) continue;
			if (raw.startsWith("+")) {
				anchors.push({ path, line });
				line += 1;
				continue;
			}
			if (raw.startsWith("-")) continue;
			line += 1;
		}
	}
	return anchors;
}

function countDiffLines(diff: string, prefix: "+" | "-"): number {
	const header = prefix === "+" ? "+++" : "---";
	return diff.split("\n").filter((line) => {
		return line.startsWith(prefix) && !line.startsWith(header);
	}).length;
}

function envelopeInput(raw: unknown): {
	repositoryRoot: string;
	input: Record<string, unknown>;
	dryRun: boolean;
} {
	if (!isRecord(raw)) fail("GitLab adapter expected version-1 JSON on stdin.");
	if (raw.version !== PROTOCOL_VERSION) {
		fail("GitLab adapter expected a version-1 JSON request.");
	}
	const provider = asString(raw.provider);
	if (provider !== undefined && provider !== PROVIDER_ID) {
		fail("This adapter only serves the gitlab provider.");
	}
	const nested = isRecord(raw.input) ? raw.input : undefined;
	const input = nested ?? omitEnvelopeKeys(raw);
	return {
		repositoryRoot: asString(raw.repositoryRoot)?.trim() || "",
		input,
		dryRun: asBoolean(raw.dryRun) === true || asBoolean(input.dryRun) === true,
	};
}

function omitEnvelopeKeys(
	raw: Record<string, unknown>,
): Record<string, unknown> {
	const input: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (
			key === "version" ||
			key === "provider" ||
			key === "repositoryRoot" ||
			key === "input"
		) {
			continue;
		}
		input[key] = value;
	}
	return input;
}

function requireApproved(input: Record<string, unknown>): void {
	if (input.approved !== true) {
		fail("Forge mutations require approved input.");
	}
}

function requireText(input: Record<string, unknown>, field: string): string {
	const value = asString(input[field])?.trim();
	if (!value) fail(`GitLab ${field} is required.`);
	return value;
}

function authorName(raw: unknown): string {
	if (typeof raw === "string" && raw.trim()) return raw.trim();
	if (isRecord(raw)) {
		const name = asString(raw.name)?.trim() || asString(raw.username)?.trim();
		if (name) return name;
	}
	fail("GitLab change is missing an author.");
}

function requiredString(raw: Record<string, unknown>, field: string): string {
	const value = asString(raw[field])?.trim();
	if (!value) fail(`GitLab change is missing ${field}.`);
	return value;
}

function pipelineEvidence(raw: Record<string, unknown>): {
	available: boolean;
	status?: string;
	revision?: string;
	current?: boolean;
	url?: string;
} {
	const pipeline = isRecord(raw.head_pipeline)
		? raw.head_pipeline
		: isRecord(raw.pipeline)
			? raw.pipeline
			: undefined;
	if (!pipeline) return { available: false };
	const status = asString(pipeline.status)?.trim();
	const revision = asString(pipeline.sha)?.trim();
	const url = asString(pipeline.web_url)?.trim();
	if (!status || !revision) {
		fail("GitLab pipeline evidence is missing status or revision.");
	}
	return {
		available: true,
		status,
		revision,
		current: revision === revisionsOf(raw).head,
		...(url ? { url } : {}),
	};
}

function mergeabilityEvidence(
	raw: Record<string, unknown>,
):
	| { available: false }
	| { available: true; conflicts: boolean; status: string } {
	const conflicts = asBoolean(raw.has_conflicts);
	const status = asString(raw.detailed_merge_status)?.trim();
	if (conflicts === undefined || !status) return { available: false };
	return { available: true, conflicts, status };
}

function revisionsOf(raw: Record<string, unknown>): {
	head: string;
	base?: string;
	start?: string;
	merged?: string;
} {
	const head =
		asString(raw.sha)?.trim() ||
		(isRecord(raw.diff_refs)
			? asString(raw.diff_refs.head_sha)?.trim()
			: undefined);
	if (!head) fail("GitLab change is missing a head revision.");
	const refs = isRecord(raw.diff_refs) ? raw.diff_refs : undefined;
	const base = asString(refs?.base_sha)?.trim();
	const start = asString(refs?.start_sha)?.trim();
	const merged =
		asString(raw.merge_commit_sha)?.trim() ||
		asString(raw.squash_commit_sha)?.trim();
	return {
		head,
		...(base ? { base } : {}),
		...(start ? { start } : {}),
		...(merged ? { merged } : {}),
	};
}

export function normalizeChange(
	raw: unknown,
	requestedRef?: string,
): Record<string, unknown> {
	if (!isRecord(raw)) fail("GitLab change is malformed.");
	const iid = raw.iid;
	const ref =
		typeof iid === "number" || typeof iid === "string"
			? String(iid)
			: undefined;
	if (!ref) fail("GitLab change is missing a merge request id.");
	const revisions = revisionsOf(raw);
	const rawState = requiredString(raw, "state");
	const state = rawState === "opened" ? "open" : rawState;
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		ref: requestedRef ?? ref,
		state,
		draft:
			asBoolean(raw.draft) === true || asBoolean(raw.work_in_progress) === true,
		branches: {
			source: requiredString(raw, "source_branch"),
			target: requiredString(raw, "target_branch"),
		},
		title: requiredString(raw, "title").replace(/^draft:\s*/i, ""),
		description: asString(raw.description) ?? "",
		author: authorName(raw.author),
		url: requiredString(raw, "web_url"),
		revisions,
		pipeline: pipelineEvidence(raw),
		mergeability: mergeabilityEvidence(raw),
	};
}

function headRevisionOf(change: Record<string, unknown>): string {
	const revisions = isRecord(change.revisions) ? change.revisions : undefined;
	const head = asString(revisions?.head)?.trim();
	if (!head) fail("GitLab change is missing a head revision.");
	return head;
}

function fileStatus(change: Record<string, unknown>): string {
	if (asBoolean(change.new_file) === true) return "added";
	if (asBoolean(change.deleted_file) === true) return "deleted";
	if (asBoolean(change.renamed_file) === true) return "renamed";
	return "modified";
}

function normalizeFiles(changes: unknown[]): Record<string, unknown>[] {
	return changes.map((entry) => {
		if (!isRecord(entry)) fail("GitLab file change is malformed.");
		const path = asString(entry.new_path)?.trim();
		if (!path) fail("GitLab file change is missing a path.");
		const oldPath = asString(entry.old_path)?.trim();
		const diff = asString(entry.diff) ?? "";
		const status = fileStatus(entry);
		return {
			path,
			...(status === "renamed" && oldPath && oldPath !== path
				? { previousPath: oldPath }
				: {}),
			status,
			additions: countDiffLines(diff, "+"),
			deletions: countDiffLines(diff, "-"),
		};
	});
}

function unifiedDiff(changes: unknown[]): string {
	return changes
		.map((entry) => {
			if (!isRecord(entry)) fail("GitLab diff is malformed.");
			const path = asString(entry.new_path)?.trim() || "unknown";
			const diff = asString(entry.diff) ?? "";
			return `=== ${path} ===\n${diff}`.trimEnd();
		})
		.join("\n");
}

async function loadChanges(
	deps: GitLabForgeDeps,
	token: string,
	target: GitLabTarget,
	iid: string,
): Promise<unknown[]> {
	const raw = await gitlabGet(
		deps,
		token,
		`${apiUrl(target, `/merge_requests/${iid}/changes`)}?access_raw_diffs=true`,
	);
	if (!isRecord(raw)) fail("GitLab changes response is malformed.");
	if (asBoolean(raw.overflow) === true) {
		fail(
			"GitLab reports this diff is truncated. Review it in the UI or split the change; do not review a partial diff.",
		);
	}
	if (!Array.isArray(raw.changes))
		fail("GitLab changes response is malformed.");
	return raw.changes;
}

async function loadMergeRequest(
	deps: GitLabForgeDeps,
	token: string,
	target: GitLabTarget,
	iid: string,
	requestedRef = iid,
): Promise<Record<string, unknown>> {
	const raw = await gitlabGet(
		deps,
		token,
		apiUrl(target, `/merge_requests/${iid}`),
	);
	const change = normalizeChange(raw, requestedRef);
	const pipeline = isRecord(change.pipeline) ? change.pipeline : undefined;
	if (pipeline?.available === true && pipeline.current !== true) {
		const revision = asString(pipeline.revision);
		const head = isRecord(change.revisions)
			? asString(change.revisions.head)
			: undefined;
		if (revision && head) {
			const commit = await gitlabGet(
				deps,
				token,
				apiUrl(target, `/repository/commits/${encodeURIComponent(revision)}`),
			);
			const parents =
				isRecord(commit) && Array.isArray(commit.parent_ids)
					? commit.parent_ids
					: [];
			pipeline.current = parents[1] === head;
		}
	}
	return change;
}

function evidenceEnvelope(
	change: Record<string, unknown>,
	extra: Record<string, unknown>,
): Record<string, unknown> {
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		ref: change.ref,
		headRevision: headRevisionOf(change),
		...extra,
	};
}

function receipt(options: {
	operation: GitLabForgeOperation;
	ref: string;
	noteId?: string;
	discussionId?: string;
	url?: string;
	draft?: boolean;
}): Record<string, unknown> {
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		operation: options.operation,
		ref: options.ref,
		...(options.noteId ? { noteId: options.noteId } : {}),
		...(options.discussionId ? { discussionId: options.discussionId } : {}),
		...(options.url ? { url: options.url } : {}),
		...(options.draft !== undefined ? { draft: options.draft } : {}),
	};
}

function discussionId(raw: unknown): string | undefined {
	if (!isRecord(raw)) return undefined;
	return typeof raw.id === "number" || typeof raw.id === "string"
		? String(raw.id)
		: undefined;
}

function noteId(raw: unknown): string | undefined {
	if (isRecord(raw)) {
		if (typeof raw.id === "number" || typeof raw.id === "string") {
			return String(raw.id);
		}
		if (Array.isArray(raw.notes) && isRecord(raw.notes[0])) {
			const first = raw.notes[0];
			if (typeof first.id === "number" || typeof first.id === "string") {
				return String(first.id);
			}
		}
	}
	return undefined;
}

function noteUrl(raw: unknown, fallback?: string): string | undefined {
	if (isRecord(raw)) {
		const direct = asString(raw.web_url)?.trim();
		if (direct) return direct;
		if (Array.isArray(raw.notes) && isRecord(raw.notes[0])) {
			const nested = asString(raw.notes[0].web_url)?.trim();
			if (nested) return nested;
		}
	}
	return fallback;
}

function parseAnchor(raw: unknown): GitLabAnchor | undefined {
	if (!isRecord(raw)) return undefined;
	const path = asString(raw.path)?.trim();
	const line = asNumber(raw.line);
	if (!path || line === undefined || line < 1 || !Number.isInteger(line)) {
		fail("Inline note anchor must include a file path and line number.");
	}
	return { path, line };
}

function discussionAnchor(
	note: Record<string, unknown>,
): GitLabAnchor | undefined {
	const position = isRecord(note.position) ? note.position : undefined;
	if (!position) return undefined;
	const path =
		asString(position.new_path)?.trim() || asString(position.old_path)?.trim();
	const line = asNumber(position.new_line) ?? asNumber(position.old_line);
	if (!path || line === undefined) return undefined;
	return {
		path,
		line,
		side:
			asNumber(position.old_line) !== undefined &&
			asNumber(position.new_line) === undefined
				? "old"
				: "new",
	};
}

function normalizeDiscussions(raw: unknown[]): Record<string, unknown>[] {
	return raw.map((entry) => {
		if (!isRecord(entry)) fail("GitLab discussion is malformed.");
		const id =
			typeof entry.id === "string" || typeof entry.id === "number"
				? String(entry.id)
				: undefined;
		if (!id) fail("GitLab discussion is missing an id.");
		const notes = Array.isArray(entry.notes) ? entry.notes : [];
		return {
			id,
			resolved: asBoolean(entry.resolved) === true,
			notes: notes.map((note) => {
				if (!isRecord(note)) fail("GitLab discussion note is malformed.");
				const noteIdValue =
					typeof note.id === "string" || typeof note.id === "number"
						? String(note.id)
						: undefined;
				if (!noteIdValue) fail("GitLab discussion note is missing an id.");
				const anchor = discussionAnchor(note);
				return {
					id: noteIdValue,
					author: authorName(note.author),
					body: asString(note.body) ?? "",
					system: asBoolean(note.system) === true,
					resolved: asBoolean(note.resolved) === true,
					...(anchor ? { anchor } : {}),
				};
			}),
		};
	});
}

function normalizeCommits(raw: unknown[]): Record<string, unknown>[] {
	const commits = raw.map((entry) => {
		if (!isRecord(entry)) fail("GitLab commit is malformed.");
		const sha = asString(entry.id)?.trim();
		if (!sha) fail("GitLab commit is missing a revision.");
		return {
			sha,
			title: asString(entry.title)?.trim() || "(untitled commit)",
			author: asString(entry.author_name)?.trim() || authorName(entry.author),
		};
	});
	return commits.reverse();
}

async function withContext(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<{
	input: Record<string, unknown>;
	target: GitLabTarget;
	token: string;
	repositoryRoot: string;
}> {
	const parsed = envelopeInput(envelope);
	const repositoryRoot =
		parsed.repositoryRoot || (deps.cwd ? deps.cwd() : process.cwd());
	const token = await resolveGitLabToken(deps);
	const target = await resolveGitLabTarget(repositoryRoot, deps);
	return {
		input: parsed.input,
		target,
		token,
		repositoryRoot,
	};
}

async function handleFind(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const sourceBranch = requireText(input, "sourceBranch");
	const state = asString(input.state)?.trim() || "opened";
	const query = new URLSearchParams({
		source_branch: sourceBranch,
		state,
	}).toString();
	const listed = await gitlabPaged(
		deps,
		token,
		target,
		`/merge_requests?${query}`,
	);
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		changes: listed.map((entry) => normalizeChange(entry)),
	};
}

async function handleRead(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	return loadMergeRequest(deps, token, target, iid, ref);
}

async function handlePipeline(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const revision = requireText(input, "revision");
	const query = new URLSearchParams({
		sha: revision,
		order_by: "id",
		sort: "desc",
	}).toString();
	const raw = await gitlabGet(
		deps,
		token,
		apiUrl(target, `/pipelines?${query}`),
	);
	if (!Array.isArray(raw)) fail("GitLab pipelines response is malformed.");
	const latest = raw.find(isRecord);
	if (!latest) {
		return {
			version: PROTOCOL_VERSION,
			provider: PROVIDER_ID,
			revision,
			pipeline: { available: false },
		};
	}
	const pipelineRevision = asString(latest.sha)?.trim();
	const status = asString(latest.status)?.trim();
	if (!pipelineRevision || !status) {
		fail("GitLab pipeline evidence is missing status or revision.");
	}
	if (pipelineRevision !== revision) {
		fail("GitLab returned pipeline evidence for a different revision.");
	}
	const url = asString(latest.web_url)?.trim();
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		revision,
		pipeline: {
			available: true,
			status,
			revision: pipelineRevision,
			...(url ? { url } : {}),
		},
	};
}

async function handleFiles(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const change = await loadMergeRequest(deps, token, target, iid, ref);
	const changes = await loadChanges(deps, token, target, iid);
	return evidenceEnvelope(change, { files: normalizeFiles(changes) });
}

async function handleDiff(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const change = await loadMergeRequest(deps, token, target, iid, ref);
	const changes = await loadChanges(deps, token, target, iid);
	return evidenceEnvelope(change, {
		unifiedDiff: unifiedDiff(changes),
		complete: true,
	});
}

async function handleCommits(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const change = await loadMergeRequest(deps, token, target, iid, ref);
	const commits = await gitlabPaged(
		deps,
		token,
		target,
		`/merge_requests/${iid}/commits`,
	);
	return evidenceEnvelope(change, { commits: normalizeCommits(commits) });
}

async function handleDiscussions(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const change = await loadMergeRequest(deps, token, target, iid, ref);
	const discussions = await gitlabPaged(
		deps,
		token,
		target,
		`/merge_requests/${iid}/discussions`,
	);
	return evidenceEnvelope(change, {
		discussions: normalizeDiscussions(discussions),
	});
}

async function handleAnchors(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const change = await loadMergeRequest(deps, token, target, iid, ref);
	const changes = await loadChanges(deps, token, target, iid);
	return evidenceEnvelope(change, {
		anchors: addedLineAnchors(
			changes.filter(isRecord).map((entry) => ({
				new_path: entry.new_path,
				diff: entry.diff,
			})),
		),
	});
}

async function handleCreate(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	requireApproved(input);
	const body: Record<string, unknown> = {
		title: requireText(input, "title"),
		source_branch: requireText(input, "sourceBranch"),
		target_branch: requireText(input, "targetBranch"),
		description: asString(input.description) ?? "",
	};
	if (input.draft !== true) fail("GitLab change creation must be draft.");
	body.title = `Draft: ${body.title}`;
	const path = "/merge_requests";
	const created = await gitlabCall(
		deps,
		token,
		"POST",
		apiUrl(target, path),
		body,
	);
	const change = normalizeChange(created);
	return receipt({
		operation: "create",
		ref: String(change.ref),
		url: asString(change.url),
	});
}

async function handleSetDraft(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	if (asBoolean(input.draft) === undefined) {
		fail("set-draft requires a draft boolean.");
	}
	const current = await loadMergeRequest(deps, token, target, iid, ref);
	const currentTitle = requiredString(current, "title");
	const title = input.draft
		? /^draft:\s*/i.test(currentTitle)
			? currentTitle
			: `Draft: ${currentTitle}`
		: currentTitle.replace(/^draft:\s*/i, "");
	const body = { title };
	const path = `/merge_requests/${iid}`;
	const updated = await gitlabCall(
		deps,
		token,
		"PUT",
		apiUrl(target, path),
		body,
	);
	const change = normalizeChange(updated, ref);
	return receipt({
		operation: "set-draft",
		ref,
		url: asString(change.url),
		draft: input.draft as boolean,
	});
}

async function handleNote(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const bodyText = requireText(input, "body");
	const anchor = parseAnchor(input.anchor);
	if (anchor) {
		const change = await loadMergeRequest(deps, token, target, iid, ref);
		const changes = await loadChanges(deps, token, target, iid);
		const valid = addedLineAnchors(
			changes.filter(isRecord).map((entry) => ({
				new_path: entry.new_path,
				diff: entry.diff,
			})),
		);
		if (
			!valid.some(
				(item) => item.path === anchor.path && item.line === anchor.line,
			)
		) {
			fail(
				`${anchor.path}:${anchor.line} is not an added line in this change.`,
			);
		}
		const revisions = isRecord(change.revisions) ? change.revisions : {};
		const position = {
			base_sha: revisions.base,
			start_sha: revisions.start,
			head_sha: revisions.head,
			position_type: "text",
			old_path: anchor.path,
			new_path: anchor.path,
			new_line: anchor.line,
		};
		const body = { body: bodyText, position };
		const path = `/merge_requests/${iid}/discussions`;
		const created = await gitlabCall(
			deps,
			token,
			"POST",
			apiUrl(target, path),
			body,
		);
		return receipt({
			operation: "note",
			ref,
			noteId: noteId(created),
			discussionId: discussionId(created),
			url: noteUrl(created, asString(change.url)),
		});
	}
	const body = { body: bodyText };
	const path = `/merge_requests/${iid}/notes`;
	const created = await gitlabCall(
		deps,
		token,
		"POST",
		apiUrl(target, path),
		body,
	);
	return receipt({
		operation: "note",
		ref,
		noteId: noteId(created),
		url: noteUrl(created),
	});
}

async function handleReply(
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	const { input, target, token } = await withContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const iid = gitlabIidFromRef(ref);
	const discussionRef = requireText(input, "discussionId");
	const body = { body: requireText(input, "body") };
	const path = `/merge_requests/${iid}/discussions/${encodeURIComponent(discussionRef)}/notes`;
	const created = await gitlabCall(
		deps,
		token,
		"POST",
		apiUrl(target, path),
		body,
	);
	return receipt({
		operation: "reply",
		ref,
		noteId: noteId(created),
		discussionId: discussionRef,
		url: noteUrl(created),
	});
}

export async function runGitLabForge(
	operation: string,
	envelope: unknown,
	deps: GitLabForgeDeps,
): Promise<unknown> {
	if (FORBIDDEN_OPERATIONS.has(operation)) {
		fail(
			"This forge adapter does not merge, close, approve, delete, or resolve discussions.",
		);
	}
	if (!isGitLabForgeOperation(operation)) {
		fail(`Unknown GitLab forge operation '${operation}'.`);
	}
	switch (operation) {
		case "find":
			return handleFind(envelope, deps);
		case "read":
			return handleRead(envelope, deps);
		case "pipeline":
			return handlePipeline(envelope, deps);
		case "files":
			return handleFiles(envelope, deps);
		case "diff":
			return handleDiff(envelope, deps);
		case "commits":
			return handleCommits(envelope, deps);
		case "discussions":
			return handleDiscussions(envelope, deps);
		case "anchors":
			return handleAnchors(envelope, deps);
		case "create":
			return handleCreate(envelope, deps);
		case "set-draft":
			return handleSetDraft(envelope, deps);
		case "note":
			return handleNote(envelope, deps);
		case "reply":
			return handleReply(envelope, deps);
	}
}

export function defaultGitLabForgeDeps(
	env: Record<string, string | undefined> = process.env,
): GitLabForgeDeps {
	return defaultGitLabHostDeps(env, {
		notFoundMessage: "GitLab did not find that merge request.",
	});
}

export async function handleGitLabForgeCli(options: {
	argv: string[];
	stdin: string;
	deps: GitLabForgeDeps;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const operation = options.argv[0];
	if (!operation) {
		options.stderr(
			"usage: gitlab-forge <find|read|pipeline|files|diff|commits|discussions|anchors|create|set-draft|note|reply>\n",
		);
		return 2;
	}
	let envelope: unknown;
	try {
		envelope = JSON.parse(options.stdin);
	} catch {
		options.stderr("GitLab adapter expected version-1 JSON on stdin.\n");
		return 1;
	}
	try {
		const result = await runGitLabForge(operation, envelope, options.deps);
		options.stdout(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	} catch (error) {
		options.stderr(
			`${error instanceof Error ? error.message : "GitLab adapter failed."}\n`,
		);
		return 1;
	}
}

if (import.meta.main) {
	const code = await handleGitLabForgeCli({
		argv: process.argv.slice(2),
		stdin: await Bun.stdin.text(),
		deps: defaultGitLabForgeDeps(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	});
	process.exit(code);
}
