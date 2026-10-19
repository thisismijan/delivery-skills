#!/usr/bin/env bun
import {
	PROTOCOL_VERSION,
	PROVIDER_ID,
	type GitHubDeps,
	type GitHubTarget,
	asBoolean,
	asNumber,
	asString,
	authorName,
	defaultGitHubDeps,
	fail,
	githubCall,
	githubGet,
	githubNumberFromRef,
	githubPaged,
	isRecord,
	repoUrl,
	requireApproved,
	requireText,
	withGitHubContext,
	withQuery,
} from "./github-client";

export {
	parseGitHubOrigin,
	resolveGitHubToken,
	resolveGitHubTarget,
	githubNumberFromRef,
	defaultGitHubDeps,
} from "./github-client";
export type { GitHubDeps, GitHubRequest } from "./github-client";

export const GITHUB_FORGE_OPERATIONS = [
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
export type GitHubForgeOperation = (typeof GITHUB_FORGE_OPERATIONS)[number];

const FORBIDDEN_OPERATIONS = new Set([
	"merge",
	"close",
	"delete",
	"approve",
	"resolve",
]);

export interface GitHubAnchor {
	path: string;
	line: number;
	side?: "new" | "old";
}

export function isGitHubForgeOperation(
	value: string,
): value is GitHubForgeOperation {
	return (GITHUB_FORGE_OPERATIONS as readonly string[]).includes(value);
}

export function addedLineAnchors(
	changes: Array<{ new_path?: unknown; diff?: unknown }>,
): GitHubAnchor[] {
	const anchors: GitHubAnchor[] = [];
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

function requiredString(raw: Record<string, unknown>, field: string): string {
	const value = asString(raw[field])?.trim();
	if (!value) fail(`GitHub change is missing ${field}.`);
	return value;
}

function pullState(raw: Record<string, unknown>): "open" | "closed" | "merged" {
	if (asBoolean(raw.merged) === true || asString(raw.merged_at)?.trim()) {
		return "merged";
	}
	const state = asString(raw.state)?.trim();
	if (state === "open") return "open";
	if (state === "closed") return "closed";
	fail("GitHub change is missing a state.");
}

function revisionsOf(raw: Record<string, unknown>): {
	head: string;
	base?: string;
	start?: string;
	merged?: string;
} {
	const head = isRecord(raw.head) ? asString(raw.head.sha)?.trim() : undefined;
	if (!head) fail("GitHub change is missing a head revision.");
	const base = isRecord(raw.base) ? asString(raw.base.sha)?.trim() : undefined;
	const merged = asString(raw.merge_commit_sha)?.trim();
	return {
		head,
		...(base ? { base, start: base } : {}),
		...(merged ? { merged } : {}),
	};
}

function mergeabilityEvidence(
	raw: Record<string, unknown>,
):
	| { available: false }
	| { available: true; conflicts: boolean; status: string } {
	const mergeable = asBoolean(raw.mergeable);
	const status = asString(raw.mergeable_state)?.trim();
	if (mergeable === undefined || mergeable === null || !status) {
		return { available: false };
	}
	return {
		available: true,
		conflicts: mergeable === false || status === "dirty",
		status,
	};
}

function branchName(raw: unknown, field: string): string {
	if (isRecord(raw)) {
		const name = asString(raw.ref)?.trim();
		if (name) return name;
	}
	fail(`GitHub change is missing ${field}.`);
}

export function normalizeChange(
	raw: unknown,
	requestedRef?: string,
	pipeline?: Record<string, unknown>,
): Record<string, unknown> {
	if (!isRecord(raw)) fail("GitHub change is malformed.");
	const number = raw.number;
	const ref =
		typeof number === "number" || typeof number === "string"
			? String(number)
			: undefined;
	if (!ref) fail("GitHub change is missing a pull request number.");
	const revisions = revisionsOf(raw);
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		ref: requestedRef ?? ref,
		state: pullState(raw),
		draft: asBoolean(raw.draft) === true,
		branches: {
			source: branchName(raw.head, "source branch"),
			target: branchName(raw.base, "target branch"),
		},
		title: requiredString(raw, "title"),
		description: asString(raw.body) ?? "",
		author: authorName(raw.user),
		url: requiredString(raw, "html_url"),
		revisions,
		pipeline: pipeline ?? { available: false },
		mergeability: mergeabilityEvidence(raw),
	};
}

function headRevisionOf(change: Record<string, unknown>): string {
	const revisions = isRecord(change.revisions) ? change.revisions : undefined;
	const head = asString(revisions?.head)?.trim();
	if (!head) fail("GitHub change is missing a head revision.");
	return head;
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
	operation: GitHubForgeOperation;
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

function fileStatus(status: string | undefined): string {
	if (status === "added") return "added";
	if (status === "removed") return "deleted";
	if (status === "renamed") return "renamed";
	return "modified";
}

function normalizeFiles(files: unknown[]): Record<string, unknown>[] {
	return files.map((entry) => {
		if (!isRecord(entry)) fail("GitHub file change is malformed.");
		const path = asString(entry.filename)?.trim();
		if (!path) fail("GitHub file change is missing a path.");
		const previous = asString(entry.previous_filename)?.trim();
		const status = fileStatus(asString(entry.status)?.trim());
		return {
			path,
			...(status === "renamed" && previous && previous !== path
				? { previousPath: previous }
				: {}),
			status,
			additions: asNumber(entry.additions) ?? countDiffLines(asString(entry.patch) ?? "", "+"),
			deletions: asNumber(entry.deletions) ?? countDiffLines(asString(entry.patch) ?? "", "-"),
		};
	});
}

function unifiedDiff(files: unknown[]): string {
	return files
		.map((entry) => {
			if (!isRecord(entry)) fail("GitHub diff is malformed.");
			const path = asString(entry.filename)?.trim() || "unknown";
			const diff = asString(entry.patch) ?? "";
			return `=== ${path} ===\n${diff}`.trimEnd();
		})
		.join("\n");
}

function assertCompleteDiff(
	pull: Record<string, unknown>,
	files: unknown[],
): void {
	const expected = asNumber(pull.changed_files);
	if (expected !== undefined && files.length < expected) {
		fail(
			"GitHub reports this diff is truncated. Review it in the UI or split the change; do not review a partial diff.",
		);
	}
	for (const entry of files) {
		if (!isRecord(entry)) fail("GitHub file change is malformed.");
		const additions = asNumber(entry.additions) ?? 0;
		const deletions = asNumber(entry.deletions) ?? 0;
		const changes = asNumber(entry.changes) ?? additions + deletions;
		const patch = asString(entry.patch);
		if ((additions > 0 || deletions > 0 || changes > 0) && patch === undefined) {
			fail(
				"GitHub reports this diff is truncated. Review it in the UI or split the change; do not review a partial diff.",
			);
		}
	}
}

async function loadPull(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	number: string,
	requestedRef = number,
): Promise<{
	raw: Record<string, unknown>;
	change: Record<string, unknown>;
}> {
	const raw = await githubGet(deps, token, repoUrl(target, `/pulls/${number}`));
	if (!isRecord(raw)) fail("GitHub pull request is malformed.");
	const pipeline = await loadPipeline(
		deps,
		token,
		target,
		revisionsOf(raw).head,
	);
	return {
		raw,
		change: normalizeChange(raw, requestedRef, pipeline),
	};
}

async function loadPipeline(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	head: string,
): Promise<Record<string, unknown>> {
	const encoded = encodeURIComponent(head);
	const combined = await githubGet(
		deps,
		token,
		repoUrl(target, `/commits/${encoded}/status`),
	);
	if (isRecord(combined) && (asNumber(combined.total_count) ?? 0) > 0) {
		const status = asString(combined.state)?.trim();
		const revision = asString(combined.sha)?.trim() || head;
		if (!status) fail("GitHub pipeline evidence is missing status or revision.");
		const url = firstStatusUrl(combined);
		return {
			available: true,
			status,
			revision,
			current: revision === head,
			...(url ? { url } : {}),
		};
	}
	const checks = await githubGet(
		deps,
		token,
		repoUrl(target, `/commits/${encoded}/check-runs`),
	);
	if (isRecord(checks) && (asNumber(checks.total_count) ?? 0) > 0) {
		const runs = Array.isArray(checks.check_runs) ? checks.check_runs : [];
		const first = runs.find(isRecord);
		const status =
			asString(first?.conclusion)?.trim() ||
			asString(first?.status)?.trim() ||
			"pending";
		const url = asString(first?.html_url)?.trim();
		const revision = asString(first?.head_sha)?.trim() || head;
		return {
			available: true,
			status,
			revision,
			current: revision === head,
			...(url ? { url } : {}),
		};
	}
	return { available: false };
}

function firstStatusUrl(combined: Record<string, unknown>): string | undefined {
	if (!Array.isArray(combined.statuses)) return undefined;
	for (const status of combined.statuses) {
		if (!isRecord(status)) continue;
		const url =
			asString(status.target_url)?.trim() || asString(status.url)?.trim();
		if (url) return url;
	}
	return undefined;
}

async function loadFiles(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	number: string,
	rawPull: Record<string, unknown>,
): Promise<unknown[]> {
	const files = await githubPaged(
		deps,
		token,
		repoUrl(target, `/pulls/${number}/files`),
	);
	assertCompleteDiff(rawPull, files);
	return files;
}

function normalizeCommits(raw: unknown[]): Record<string, unknown>[] {
	return raw.map((entry) => {
		if (!isRecord(entry)) fail("GitHub commit is malformed.");
		const sha = asString(entry.sha)?.trim();
		if (!sha) fail("GitHub commit is missing a revision.");
		const commit = isRecord(entry.commit) ? entry.commit : undefined;
		const message = asString(commit?.message)?.trim() ?? "";
		const title = message.split("\n")[0]?.trim() || "(untitled commit)";
		const author =
			asString(isRecord(commit?.author) ? commit.author.name : undefined)?.trim() ||
			authorName(entry.author ?? commit?.author);
		return { sha, title, author };
	});
}

function discussionSide(side: string | undefined): "new" | "old" | undefined {
	if (side === "LEFT") return "old";
	if (side === "RIGHT") return "new";
	return undefined;
}

function reviewCommentAnchor(
	note: Record<string, unknown>,
): GitHubAnchor | undefined {
	const path = asString(note.path)?.trim();
	const line = asNumber(note.line) ?? asNumber(note.original_line);
	if (!path || line === undefined) return undefined;
	const side = discussionSide(asString(note.side)?.trim());
	return { path, line, ...(side ? { side } : {}) };
}

function numericId(raw: unknown): string | undefined {
	if (typeof raw === "number" || typeof raw === "string") {
		const value = String(raw).trim();
		return value.length > 0 ? value : undefined;
	}
	return undefined;
}

function normalizeDiscussions(
	issueComments: unknown[],
	reviewComments: unknown[],
): Record<string, unknown>[] {
	const discussions: Record<string, unknown>[] = [];
	for (const entry of issueComments) {
		if (!isRecord(entry)) fail("GitHub discussion is malformed.");
		const id = numericId(entry.id);
		if (!id) fail("GitHub discussion is missing an id.");
		discussions.push({
			id: `issue-comment:${id}`,
			resolved: false,
			notes: [normalizeNote(entry)],
		});
	}
	const threads = new Map<string, Record<string, unknown>[]>();
	const order: string[] = [];
	for (const entry of reviewComments) {
		if (!isRecord(entry)) fail("GitHub discussion is malformed.");
		const id = numericId(entry.id);
		if (!id) fail("GitHub discussion is missing an id.");
		const root = numericId(entry.in_reply_to_id) ?? id;
		if (!threads.has(root)) {
			threads.set(root, []);
			order.push(root);
		}
		threads.get(root)?.push(normalizeNote(entry, reviewCommentAnchor(entry)));
	}
	for (const root of order) {
		discussions.push({
			id: root,
			resolved: false,
			notes: threads.get(root) ?? [],
		});
	}
	return discussions;
}

function normalizeNote(
	note: Record<string, unknown>,
	anchor?: GitHubAnchor,
): Record<string, unknown> {
	const id = numericId(note.id);
	if (!id) fail("GitHub discussion note is missing an id.");
	return {
		id,
		author: authorName(note.user),
		body: asString(note.body) ?? "",
		system: false,
		resolved: false,
		...(anchor ? { anchor } : {}),
	};
}

function parseAnchor(raw: unknown): GitHubAnchor | undefined {
	if (!isRecord(raw)) return undefined;
	const path = asString(raw.path)?.trim();
	const line = asNumber(raw.line);
	if (!path || line === undefined || line < 1 || !Number.isInteger(line)) {
		fail("Inline note anchor must include a file path and line number.");
	}
	return { path, line };
}

function noteIdOf(raw: unknown): string | undefined {
	if (!isRecord(raw)) return undefined;
	return numericId(raw.id);
}

function noteUrlOf(raw: unknown, fallback?: string): string | undefined {
	if (isRecord(raw)) {
		const direct = asString(raw.html_url)?.trim();
		if (direct) return direct;
	}
	return fallback;
}

async function handleFind(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const sourceBranch = requireText(input, "sourceBranch");
	const state = asString(input.state)?.trim() || "open";
	const listed = await githubPaged(
		deps,
		token,
		withQuery(repoUrl(target, "/pulls"), {
			head: `${target.owner}:${sourceBranch}`,
			state,
		}),
	);
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		changes: listed.map((entry) => normalizeChange(entry)),
	};
}

async function handleRead(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	return (await loadPull(deps, token, target, number, ref)).change;
}

async function handleFiles(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const loaded = await loadPull(deps, token, target, number, ref);
	const files = await loadFiles(deps, token, target, number, loaded.raw);
	return evidenceEnvelope(loaded.change, { files: normalizeFiles(files) });
}

async function handleDiff(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const loaded = await loadPull(deps, token, target, number, ref);
	const files = await loadFiles(deps, token, target, number, loaded.raw);
	return evidenceEnvelope(loaded.change, {
		unifiedDiff: unifiedDiff(files),
		complete: true,
	});
}

async function handleCommits(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const loaded = await loadPull(deps, token, target, number, ref);
	const commits = await githubPaged(
		deps,
		token,
		repoUrl(target, `/pulls/${number}/commits`),
	);
	return evidenceEnvelope(loaded.change, {
		commits: normalizeCommits(commits),
	});
}

async function handleDiscussions(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const loaded = await loadPull(deps, token, target, number, ref);
	const issueComments = await githubPaged(
		deps,
		token,
		repoUrl(target, `/issues/${number}/comments`),
	);
	const reviewComments = await githubPaged(
		deps,
		token,
		repoUrl(target, `/pulls/${number}/comments`),
	);
	return evidenceEnvelope(loaded.change, {
		discussions: normalizeDiscussions(issueComments, reviewComments),
	});
}

async function handleAnchors(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const loaded = await loadPull(deps, token, target, number, ref);
	const files = await loadFiles(deps, token, target, number, loaded.raw);
	return evidenceEnvelope(loaded.change, {
		anchors: addedLineAnchors(
			files.filter(isRecord).map((entry) => ({
				new_path: entry.filename,
				diff: entry.patch,
			})),
		),
	});
}

async function handleCreate(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	requireApproved(input);
	if (input.draft !== true) fail("GitHub change creation must be draft.");
	const created = await githubCall(deps, token, "POST", repoUrl(target, "/pulls"), {
		title: requireText(input, "title"),
		head: requireText(input, "sourceBranch"),
		base: requireText(input, "targetBranch"),
		body: asString(input.description) ?? "",
		draft: true,
	});
	const change = normalizeChange(created);
	return receipt({
		operation: "create",
		ref: String(change.ref),
		url: asString(change.url),
	});
}

async function handleSetDraft(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const draft = asBoolean(input.draft);
	if (draft === undefined) fail("set-draft requires a draft boolean.");
	const path = draft
		? `/pulls/${number}/convertToDraft`
		: `/pulls/${number}/ready_for_review`;
	const updated = await githubCall(deps, token, "POST", repoUrl(target, path));
	const change = isRecord(updated) ? normalizeChange(updated, ref) : undefined;
	return receipt({
		operation: "set-draft",
		ref,
		url: asString(change?.url),
		draft,
	});
}

async function handleNote(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const bodyText = requireText(input, "body");
	const anchor = parseAnchor(input.anchor);
	if (anchor) {
		const loaded = await loadPull(deps, token, target, number, ref);
		const files = await loadFiles(deps, token, target, number, loaded.raw);
		const valid = addedLineAnchors(
			files.filter(isRecord).map((entry) => ({
				new_path: entry.filename,
				diff: entry.patch,
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
		const created = await githubCall(
			deps,
			token,
			"POST",
			repoUrl(target, `/pulls/${number}/comments`),
			{
				body: bodyText,
				commit_id: headRevisionOf(loaded.change),
				path: anchor.path,
				line: anchor.line,
				side: "RIGHT",
			},
		);
		return receipt({
			operation: "note",
			ref,
			noteId: noteIdOf(created),
			discussionId: noteIdOf(created),
			url: noteUrlOf(created, asString(loaded.change.url)),
		});
	}
	const created = await githubCall(
		deps,
		token,
		"POST",
		repoUrl(target, `/issues/${number}/comments`),
		{ body: bodyText },
	);
	return receipt({
		operation: "note",
		ref,
		noteId: noteIdOf(created),
		url: noteUrlOf(created),
	});
}

async function handleReply(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const discussionRef = requireText(input, "discussionId");
	if (discussionRef.startsWith("issue-comment:")) {
		fail("GitHub issue comments are not review threads.");
	}
	const created = await githubCall(
		deps,
		token,
		"POST",
		repoUrl(target, `/pulls/${number}/comments`),
		{
			body: requireText(input, "body"),
			in_reply_to: Number(discussionRef),
		},
	);
	return receipt({
		operation: "reply",
		ref,
		noteId: noteIdOf(created),
		discussionId: discussionRef,
		url: noteUrlOf(created),
	});
}

export async function runGitHubForge(
	operation: string,
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	if (FORBIDDEN_OPERATIONS.has(operation)) {
		fail(
			"This forge adapter does not merge, close, approve, delete, or resolve discussions.",
		);
	}
	if (!isGitHubForgeOperation(operation)) {
		fail(`Unknown GitHub forge operation '${operation}'.`);
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

export async function handleGitHubForgeCli(options: {
	argv: string[];
	stdin: string;
	deps: GitHubDeps;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const operation = options.argv[0];
	if (!operation) {
		options.stderr(
			"usage: github-forge <find|read|files|diff|commits|discussions|anchors|create|set-draft|note|reply>\n",
		);
		return 2;
	}
	let envelope: unknown;
	try {
		envelope = JSON.parse(options.stdin);
	} catch {
		options.stderr("GitHub adapter expected version-1 JSON on stdin.\n");
		return 1;
	}
	try {
		const result = await runGitHubForge(operation, envelope, options.deps);
		options.stdout(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	} catch (error) {
		options.stderr(
			`${error instanceof Error ? error.message : "GitHub adapter failed."}\n`,
		);
		return 1;
	}
}

if (import.meta.main) {
	const code = await handleGitHubForgeCli({
		argv: process.argv.slice(2),
		stdin: await Bun.stdin.text(),
		deps: defaultGitHubDeps(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	});
	process.exit(code);
}
