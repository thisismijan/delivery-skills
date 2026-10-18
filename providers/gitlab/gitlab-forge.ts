#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";

export const PROTOCOL_VERSION = 1;
export const PROVIDER_ID = "gitlab";
export const PER_PAGE = 100;
export const MAX_PAGES = 50;

export const GITLAB_FORGE_OPERATIONS = [
	"find",
	"read",
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

export interface GitLabTarget {
	host: string;
	project: string;
}

export interface GitLabRequest {
	method: "GET" | "POST" | "PUT";
	url: string;
	headers: Record<string, string>;
	body?: unknown;
}

export interface GitLabForgeDeps {
	env: Record<string, string | undefined>;
	gitRemoteUrl: (repositoryRoot: string) => Promise<string | null>;
	readFile: (path: string) => Promise<string>;
	fileExists: (path: string) => boolean;
	gitlabRequest: (request: GitLabRequest) => Promise<unknown>;
	cwd?: () => string;
	perPage?: number;
	maxPages?: number;
}

export interface GitLabAnchor {
	path: string;
	line: number;
	side?: "new" | "old";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function redact(text: string, token: string | undefined): string {
	if (!token || token.length === 0) return text;
	return text.split(token).join("[redacted]");
}

function fail(message: string, token?: string): never {
	throw new Error(redact(message, token));
}

export function isGitLabForgeOperation(
	value: string,
): value is GitLabForgeOperation {
	return (GITLAB_FORGE_OPERATIONS as readonly string[]).includes(value);
}

export function parseGitOrigin(remoteUrl: string): GitLabTarget | null {
	const trimmed = remoteUrl.trim().replace(/\.git$/i, "");
	if (!trimmed) return null;
	try {
		if (/^https?:\/\//i.test(trimmed)) {
			return targetFromUrl(new URL(trimmed));
		}
		if (trimmed.startsWith("ssh://")) {
			return targetFromUrl(new URL(trimmed.replace(/^ssh:\/\//i, "https://")));
		}
	} catch {
		return null;
	}
	const scp = trimmed.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
	const host = scp?.[1];
	const path = scp?.[2];
	if (!host || !path) return null;
	return targetFromHostProject(`https://${host}`, path);
}

function targetFromUrl(url: URL): GitLabTarget | null {
	return targetFromHostProject(`${url.protocol}//${url.host}`, url.pathname);
}

function targetFromHostProject(
	host: string,
	projectPath: string,
): GitLabTarget | null {
	const project = projectPath.replace(/^\/+/, "").replace(/\/+$/, "");
	if (!project || project.includes("..")) return null;
	return { host: host.replace(/\/+$/, ""), project };
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

export async function resolveGitLabToken(
	deps: GitLabForgeDeps,
): Promise<string> {
	const envToken = deps.env.GITLAB_TOKEN?.trim();
	if (envToken) return envToken;
	const tokenFile =
		deps.env.GL_TOKEN_FILE?.trim() ||
		(deps.env.HOME ? join(deps.env.HOME, "token") : "");
	if (!tokenFile || !deps.fileExists(tokenFile)) {
		fail("Set GITLAB_TOKEN, GL_TOKEN_FILE, or ~/token for GitLab access.");
	}
	const raw = await deps.readFile(tokenFile).catch(() => {
		fail("Could not read the GitLab token file.");
	});
	const token = raw.replace(/\r?\n/g, "").trim();
	if (!token) fail("GitLab token is empty.");
	return token;
}

export async function resolveGitLabTarget(
	repositoryRoot: string,
	deps: GitLabForgeDeps,
): Promise<GitLabTarget> {
	const envProject = deps.env.GL_PROJECT?.trim();
	const envHost = normalizeHost(deps.env.GL_HOST?.trim());
	if (envProject && envHost) {
		const target = targetFromHostProject(envHost, envProject);
		if (!target) fail("GL_PROJECT is not a valid GitLab project path.");
		return target;
	}
	const remote = await deps.gitRemoteUrl(repositoryRoot);
	const fromOrigin = remote ? parseGitOrigin(remote) : null;
	const project = envProject || fromOrigin?.project;
	const host = envHost || fromOrigin?.host || "https://gitlab.com";
	if (!project) {
		fail(
			"Cannot determine the GitLab project from the repository origin; set GL_PROJECT.",
		);
	}
	const target = targetFromHostProject(host, project);
	if (!target) {
		fail("Cannot determine the GitLab project from the repository origin.");
	}
	return target;
}

function normalizeHost(host: string | undefined): string | undefined {
	if (!host) return undefined;
	if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");
	return `https://${host.replace(/\/+$/, "")}`;
}

function apiUrl(target: GitLabTarget, resource: string): string {
	return `${target.host}/api/v4/projects/${encodeURIComponent(target.project)}${resource}`;
}

function withQuery(url: string, params: Record<string, string>): string {
	const query = new URLSearchParams(params).toString();
	return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function requestHeaders(
	token: string,
	jsonBody: boolean,
): Record<string, string> {
	return {
		"PRIVATE-TOKEN": token,
		Accept: "application/json",
		...(jsonBody ? { "Content-Type": "application/json" } : {}),
	};
}

async function gitlabCall(
	deps: GitLabForgeDeps,
	token: string,
	method: GitLabRequest["method"],
	url: string,
	body?: unknown,
): Promise<unknown> {
	if (url.includes(token))
		fail("Refusing to send a GitLab URL that embeds a credential.", token);
	const request: GitLabRequest = {
		method,
		url,
		headers: requestHeaders(token, body !== undefined),
		...(body !== undefined ? { body } : {}),
	};
	try {
		return await deps.gitlabRequest(request);
	} catch (error) {
		fail(
			error instanceof Error ? error.message : "GitLab request failed.",
			token,
		);
	}
}

async function gitlabGet(
	deps: GitLabForgeDeps,
	token: string,
	url: string,
): Promise<unknown> {
	return gitlabCall(deps, token, "GET", url);
}

async function gitlabPaged(
	deps: GitLabForgeDeps,
	token: string,
	target: GitLabTarget,
	resource: string,
): Promise<unknown[]> {
	const perPage = deps.perPage ?? PER_PAGE;
	const maxPages = deps.maxPages ?? MAX_PAGES;
	const items: unknown[] = [];
	for (let page = 1; page <= maxPages; page += 1) {
		const url = withQuery(apiUrl(target, resource), {
			per_page: String(perPage),
			page: String(page),
		});
		const body = await gitlabGet(deps, token, url);
		if (!Array.isArray(body)) {
			fail("GitLab listing was not an array.");
		}
		items.push(...body);
		if (body.length < perPage) return items;
	}
	fail("GitLab listing exceeded the page limit.");
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
	return {
		env,
		cwd: () => process.cwd(),
		gitRemoteUrl: async (repositoryRoot) => {
			const proc = Bun.spawn(
				["git", "-C", repositoryRoot, "remote", "get-url", "origin"],
				{ stdout: "pipe", stderr: "pipe" },
			);
			const [stdout, , code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			if (code !== 0) return null;
			const url = stdout.trim();
			return url.length > 0 ? url : null;
		},
		readFile: (path) => Bun.file(path).text(),
		fileExists: (path) => existsSync(path),
		gitlabRequest: async (request) => {
			const response = await fetch(request.url, {
				method: request.method,
				headers: request.headers,
				signal: AbortSignal.timeout(60_000),
				body:
					request.body !== undefined ? JSON.stringify(request.body) : undefined,
			});
			const text = await response.text();
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					fail("GitLab authentication failed.");
				}
				if (response.status === 404) {
					fail("GitLab did not find that merge request.");
				}
				fail(`GitLab request failed (HTTP ${response.status}).`);
			}
			if (!text.trim()) return null;
			try {
				return JSON.parse(text) as unknown;
			} catch {
				fail("GitLab returned an invalid JSON response.");
			}
		},
	};
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
			"usage: gitlab-forge <find|read|files|diff|commits|discussions|anchors|create|set-draft|note|reply>\n",
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
