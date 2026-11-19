#!/usr/bin/env bun
import {
	type GitHubDeps,
	type GitHubTarget,
	PROTOCOL_VERSION,
	PROVIDER_ID,
	SOURCE_AUDIT_PREFIX,
	TYPE_MARKER_PREFIX,
	asNumber,
	asString,
	defaultGitHubDeps,
	fail,
	githubCall,
	githubGet,
	githubNumberFromRef,
	githubPaged,
	isRecord,
	noteAuditMarker,
	parseMarker,
	repoUrl,
	requireText,
	sourceAuditMarker,
	stripMarkers,
	typeMarker,
	withGitHubContext,
	withQuery,
} from "./github-client";

export {
	defaultGitHubDeps,
	parseGitHubOrigin,
	resolveGitHubToken,
	resolveGitHubTarget,
} from "./github-client";
export type { GitHubDeps, GitHubRequest } from "./github-client";

export const GITHUB_TRACKER_OPERATIONS = [
	"list",
	"read",
	"create",
	"link",
	"note",
] as const;
export type GitHubTrackerOperation = (typeof GITHUB_TRACKER_OPERATIONS)[number];

const FORBIDDEN_OPERATIONS = new Set([
	"close",
	"delete",
	"transition",
	"status",
	"resolve",
]);

const WORK_ITEM_TYPES = ["bug", "story", "task", "other"] as const;
type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export function isGitHubTrackerOperation(
	value: string,
): value is GitHubTrackerOperation {
	return (GITHUB_TRACKER_OPERATIONS as readonly string[]).includes(value);
}

function requireApproved(input: Record<string, unknown>): void {
	if (input.approved !== true) {
		fail("Work-item mutations require approved input.");
	}
}

function workItemType(
	raw: Record<string, unknown>,
	body: string,
): WorkItemType {
	const marked = parseMarker(body, TYPE_MARKER_PREFIX);
	if (marked && (WORK_ITEM_TYPES as readonly string[]).includes(marked)) {
		return marked as WorkItemType;
	}
	const named = isRecord(raw.type)
		? asString(raw.type.name)?.trim()
		: undefined;
	if (named) {
		const lower = named.toLowerCase();
		if (lower === "bug") return "bug";
		if (lower === "story" || lower === "feature") return "story";
		if (lower === "task") return "task";
	}
	if (Array.isArray(raw.labels)) {
		const names = raw.labels
			.map((label) =>
				isRecord(label)
					? asString(label.name)?.trim().toLowerCase()
					: undefined,
			)
			.filter((value): value is string => Boolean(value));
		if (names.includes("bug")) return "bug";
		if (
			names.some(
				(name) =>
					name === "story" || name === "feature" || name === "enhancement",
			)
		) {
			return "story";
		}
		if (names.includes("task")) return "task";
	}
	return "other";
}

function issueNumber(raw: Record<string, unknown>): string {
	const number = raw.number;
	if (typeof number === "number" || typeof number === "string") {
		return String(number);
	}
	fail("GitHub issue is missing a number.");
}

function isPullRequest(raw: Record<string, unknown>): boolean {
	return raw.pull_request !== undefined && raw.pull_request !== null;
}

function isNotFound(error: unknown): boolean {
	const message = error instanceof Error ? error.message : "";
	return message.includes("did not find") || message.includes("HTTP 404");
}

function firstAssignee(raw: Record<string, unknown>): string | undefined {
	const first = Array.isArray(raw.assignees) ? raw.assignees[0] : undefined;
	const login = isRecord(first) ? asString(first.login)?.trim() : undefined;
	if (login) return login;
	return isRecord(raw.assignee)
		? asString(raw.assignee.login)?.trim() || undefined
		: undefined;
}

function milestoneTitle(raw: Record<string, unknown>): string | undefined {
	return isRecord(raw.milestone)
		? asString(raw.milestone.title)?.trim() || undefined
		: undefined;
}

// A parent in this repository is reported as its issue number, like every other reference here.
// GitHub also allows a parent in another repository of the same owner, reported as owner/repo#n.
function parentRef(
	target: GitHubTarget,
	raw: Record<string, unknown>,
): string | undefined {
	const url = asString(raw.parent_issue_url)?.trim();
	const match = url?.match(/\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/?$/);
	const repository = match?.[1];
	const number = match?.[2];
	if (!repository || !number) return undefined;
	return repository.toLowerCase() === target.repository.toLowerCase()
		? number
		: `${repository}#${number}`;
}

async function loadBlockedBy(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	number: string,
): Promise<string[]> {
	try {
		const listed = await githubPaged(
			deps,
			token,
			repoUrl(target, `/issues/${number}/dependencies/blocked_by`),
		);
		return listed.map((entry) => {
			if (!isRecord(entry)) fail("GitHub dependency is malformed.");
			return issueNumber(entry);
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message.includes("did not find") || message.includes("HTTP 404")) {
			fail("GitHub issue dependencies are not available on this repository.");
		}
		throw error;
	}
}

function parseNotes(
	comments: unknown[],
): Array<{ auditId: string; body: string }> {
	const notes: Array<{ auditId: string; body: string }> = [];
	for (const entry of comments) {
		if (!isRecord(entry)) continue;
		const body = asString(entry.body) ?? "";
		const auditId = parseMarker(body, "<!-- delivery-note-audit-id:");
		if (!auditId) continue;
		const text = stripMarkers(body);
		if (!text) continue;
		const existing = notes.findIndex((note) => note.auditId === auditId);
		const next = { auditId, body: text };
		if (existing >= 0) notes[existing] = next;
		else notes.push(next);
	}
	return notes;
}

async function normalizeIssue(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	raw: unknown,
	comments?: unknown[],
): Promise<Record<string, unknown>> {
	if (!isRecord(raw)) fail("GitHub issue is malformed.");
	if (isPullRequest(raw)) fail("GitHub pull requests are not work items.");
	const number = issueNumber(raw);
	const rawBody = asString(raw.body) ?? "";
	const body = stripMarkers(rawBody);
	if (!body) fail("GitHub issue is missing a body.");
	const title = asString(raw.title)?.trim();
	if (!title) fail("GitHub issue is missing a title.");
	const loadedComments =
		comments ??
		(await githubPaged(
			deps,
			token,
			repoUrl(target, `/issues/${number}/comments`),
		));
	const assignee = firstAssignee(raw);
	const sprint = milestoneTitle(raw);
	const parent = parentRef(target, raw);
	return {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		ref: number,
		type: workItemType(raw, rawBody),
		title,
		body,
		blockedBy: await loadBlockedBy(deps, token, target, number),
		...(parseMarker(rawBody, SOURCE_AUDIT_PREFIX)
			? { sourceAuditId: parseMarker(rawBody, SOURCE_AUDIT_PREFIX) }
			: {}),
		...(assignee ? { assignee } : {}),
		...(sprint ? { sprint } : {}),
		...(parent ? { parent } : {}),
		notes: parseNotes(loadedComments),
	};
}

async function listIssues(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
): Promise<unknown[]> {
	const listed = await githubPaged(
		deps,
		token,
		withQuery(repoUrl(target, "/issues"), { state: "all" }),
	);
	return listed.filter((entry) => isRecord(entry) && !isPullRequest(entry));
}

async function handleList(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { target, token } = await withGitHubContext(envelope, deps);
	const issues = await listIssues(deps, token, target);
	const items: unknown[] = [];
	for (const issue of issues) {
		try {
			items.push(await normalizeIssue(deps, token, target, issue));
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message.includes("missing a body")) continue;
			throw error;
		}
	}
	return items;
}

async function handleRead(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const raw = await githubGet(
		deps,
		token,
		repoUrl(target, `/issues/${number}`),
	);
	return normalizeIssue(deps, token, target, raw);
}

async function findByAuditId(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	auditId: string,
): Promise<Record<string, unknown> | undefined> {
	const issues = await listIssues(deps, token, target);
	for (const issue of issues) {
		if (!isRecord(issue)) continue;
		const found = parseMarker(asString(issue.body) ?? "", SOURCE_AUDIT_PREFIX);
		if (found === auditId) return issue;
	}
	return undefined;
}

function sameCreateContent(
	existing: Record<string, unknown>,
	input: Record<string, unknown>,
): boolean {
	const rawBody = asString(existing.body) ?? "";
	const body = stripMarkers(rawBody);
	const title = asString(existing.title)?.trim();
	const type = workItemType(existing, rawBody);
	const requestedType = asString(input.type)?.trim() || "story";
	return (
		title === asString(input.title)?.trim() &&
		body === asString(input.body)?.trim() &&
		type === requestedType
	);
}

function requestedParent(input: Record<string, unknown>): string | undefined {
	if (input.parent === undefined) return undefined;
	const match = asString(input.parent)
		?.trim()
		.match(/^#?(\d+)$/);
	const number = match?.[1];
	if (!number) {
		fail(
			"GitHub parent must be an issue number in this repository, such as 12 or #12.",
		);
	}
	return number;
}

async function resolveAssignee(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	settings: Record<string, string>,
): Promise<string | undefined> {
	const setting = settings.assignee?.trim() || "me";
	if (setting === "none") return undefined;
	if (setting === "me") {
		const user = await githubGet(deps, token, `${target.apiBase}/user`);
		const login = isRecord(user) ? asString(user.login)?.trim() : undefined;
		if (!login)
			fail("GitHub did not say which user the credential belongs to.");
		return login;
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(setting)) {
		fail(`GitHub assignee '${setting}' is not a valid login.`);
	}
	let user: unknown;
	try {
		user = await githubGet(
			deps,
			token,
			`${target.apiBase}/users/${encodeURIComponent(setting)}`,
		);
	} catch (error) {
		if (isNotFound(error))
			fail(`GitHub has no user with the login '${setting}'.`);
		throw error;
	}
	const login = isRecord(user) ? asString(user.login)?.trim() : undefined;
	if (!login || login.toLowerCase() !== setting.toLowerCase()) {
		fail(`GitHub has no user with the login '${setting}'.`);
	}
	return login;
}

async function resolveMilestone(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	settings: Record<string, string>,
): Promise<number | undefined> {
	const title = settings.milestone?.trim();
	if (!title || title === "none") return undefined;
	const listed = await githubPaged(
		deps,
		token,
		withQuery(repoUrl(target, "/milestones"), { state: "open" }),
	);
	const matches = listed.filter(
		(entry) => isRecord(entry) && asString(entry.title) === title,
	);
	if (matches.length === 0) {
		fail(`GitHub has no open milestone titled '${title}'.`);
	}
	if (matches.length > 1) {
		fail(`GitHub has more than one open milestone titled '${title}'.`);
	}
	const match = matches[0];
	const number = isRecord(match) ? asNumber(match.number) : undefined;
	if (number === undefined) {
		fail(`GitHub milestone '${title}' is missing a number.`);
	}
	return number;
}

async function requireParentIssue(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	parent: string,
): Promise<void> {
	let raw: unknown;
	try {
		raw = await githubGet(deps, token, repoUrl(target, `/issues/${parent}`));
	} catch (error) {
		if (isNotFound(error)) {
			fail(`GitHub parent issue #${parent} does not exist in this repository.`);
		}
		throw error;
	}
	if (!isRecord(raw) || isPullRequest(raw)) {
		fail(`GitHub parent #${parent} is a pull request, not an issue.`);
	}
}

async function attachToParent(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	child: Record<string, unknown>,
	parent: string,
): Promise<unknown> {
	const childId = asNumber(child.id);
	if (childId === undefined) fail("GitHub issue is missing its numeric id.");
	await githubCall(
		deps,
		token,
		"POST",
		repoUrl(target, `/issues/${parent}/sub_issues`),
		{ sub_issue_id: childId },
	);
	return githubGet(
		deps,
		token,
		repoUrl(target, `/issues/${issueNumber(child)}`),
	);
}

// Replay returns the issue a person may since have reassigned or re-planned, so it is not
// placed again. Only a missing parent is added, the same additive way links are.
async function replayCreate(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	existing: Record<string, unknown>,
	parent: string | undefined,
): Promise<unknown> {
	const current = parentRef(target, existing);
	if (parent && current !== undefined && current !== parent) {
		fail(
			`audit id already identifies different work-item content: issue #${issueNumber(existing)} is under parent ${current}, not #${parent}.`,
		);
	}
	if (!parent || current !== undefined) {
		return normalizeIssue(deps, token, target, existing);
	}
	if (parent === issueNumber(existing)) {
		fail(`GitHub issue #${parent} cannot be its own parent.`);
	}
	await requireParentIssue(deps, token, target, parent);
	const refreshed = await attachToParent(deps, token, target, existing, parent);
	return normalizeIssue(deps, token, target, refreshed);
}

async function handleCreate(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, settings, target, token } = await withGitHubContext(
		envelope,
		deps,
	);
	requireApproved(input);
	const auditId = requireText(input, "auditId");
	const title = requireText(input, "title");
	const body = requireText(input, "body");
	const type = asString(input.type)?.trim() || "story";
	if (!(WORK_ITEM_TYPES as readonly string[]).includes(type)) {
		fail("GitHub work-item type is invalid.");
	}
	const parent = requestedParent(input);
	const existing = await findByAuditId(deps, token, target, auditId);
	if (existing) {
		if (!sameCreateContent(existing, input)) {
			fail(
				`audit id '${auditId}' already identifies different work-item content`,
			);
		}
		return replayCreate(deps, token, target, existing, parent);
	}
	const requestedRef = asString(input.ref)?.trim();
	if (requestedRef) {
		fail("GitHub assigns issue numbers; omit ref when creating an issue.");
	}
	const assignee = await resolveAssignee(deps, token, target, settings);
	const milestone = await resolveMilestone(deps, token, target, settings);
	if (parent) await requireParentIssue(deps, token, target, parent);
	let created = await githubCall(
		deps,
		token,
		"POST",
		repoUrl(target, "/issues"),
		{
			title,
			body: `${body}\n\n${sourceAuditMarker(auditId)}\n${typeMarker(type)}`,
			...(assignee ? { assignees: [assignee] } : {}),
			...(milestone !== undefined ? { milestone } : {}),
		},
	);
	if (!isRecord(created)) fail("GitHub returned a malformed issue.");
	const blockedBy = Array.isArray(input.blockedBy)
		? input.blockedBy.map((value) => String(value))
		: [];
	if (blockedBy.length > 0) {
		await addBlockedBy(deps, token, target, issueNumber(created), blockedBy);
	}
	if (parent) {
		created = await attachToParent(deps, token, target, created, parent);
	}
	return normalizeIssue(deps, token, target, created);
}

async function addBlockedBy(
	deps: GitHubDeps,
	token: string,
	target: GitHubTarget,
	number: string,
	blockedBy: string[],
): Promise<void> {
	const current = await loadBlockedBy(deps, token, target, number);
	for (const ref of blockedBy) {
		if (current.includes(ref)) continue;
		const blocking = await githubGet(
			deps,
			token,
			repoUrl(target, `/issues/${githubNumberFromRef(ref)}`),
		);
		if (!isRecord(blocking) || blocking.id === undefined) {
			fail(`GitHub blocking issue '${ref}' is missing an id.`);
		}
		await githubCall(
			deps,
			token,
			"POST",
			repoUrl(target, `/issues/${number}/dependencies/blocked_by`),
			{ issue_id: blocking.id },
		);
	}
}

async function handleLink(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	requireApproved(input);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	if (!Array.isArray(input.blockedBy)) {
		fail("GitHub link requires blockedBy references.");
	}
	const requested = input.blockedBy.map((value) => String(value));
	const current = await loadBlockedBy(deps, token, target, number);
	const extra = current.filter((value) => !requested.includes(value));
	if (extra.length > 0) {
		fail("GitHub issue adapter does not delete dependency links.");
	}
	await addBlockedBy(deps, token, target, number, requested);
	const raw = await githubGet(
		deps,
		token,
		repoUrl(target, `/issues/${number}`),
	);
	return normalizeIssue(deps, token, target, raw);
}

async function handleNote(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	const { input, target, token } = await withGitHubContext(envelope, deps);
	const ref = requireText(input, "ref");
	const number = githubNumberFromRef(ref);
	const auditId = requireText(input, "auditId");
	const body = requireText(input, "body");
	const comments = await githubPaged(
		deps,
		token,
		repoUrl(target, `/issues/${number}/comments`),
	);
	const marker = noteAuditMarker(auditId);
	const existing = comments.find((entry) => {
		return (
			isRecord(entry) &&
			parseMarker(
				asString(entry.body) ?? "",
				"<!-- delivery-note-audit-id:",
			) === auditId
		);
	});
	const payload = `${marker}\n${body}`;
	if (existing && isRecord(existing)) {
		const id = existing.id;
		await githubCall(
			deps,
			token,
			"PATCH",
			repoUrl(target, `/issues/comments/${id}`),
			{ body: payload },
		);
	} else {
		await githubCall(
			deps,
			token,
			"POST",
			repoUrl(target, `/issues/${number}/comments`),
			{ body: payload },
		);
	}
	const raw = await githubGet(
		deps,
		token,
		repoUrl(target, `/issues/${number}`),
	);
	const refreshed = await githubPaged(
		deps,
		token,
		repoUrl(target, `/issues/${number}/comments`),
	);
	return normalizeIssue(deps, token, target, raw, refreshed);
}

export async function runGitHubTracker(
	operation: string,
	envelope: unknown,
	deps: GitHubDeps,
): Promise<unknown> {
	if (FORBIDDEN_OPERATIONS.has(operation)) {
		fail(
			"This work-item adapter does not change status, delete issues, or delete dependency links.",
		);
	}
	if (!isGitHubTrackerOperation(operation)) {
		fail(`Unknown GitHub work-item operation '${operation}'.`);
	}
	switch (operation) {
		case "list":
			return handleList(envelope, deps);
		case "read":
			return handleRead(envelope, deps);
		case "create":
			return handleCreate(envelope, deps);
		case "link":
			return handleLink(envelope, deps);
		case "note":
			return handleNote(envelope, deps);
	}
}

export async function handleGitHubTrackerCli(options: {
	argv: string[];
	stdin: string;
	deps: GitHubDeps;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const operation = options.argv[0];
	if (!operation) {
		options.stderr("usage: github-tracker <list|read|create|link|note>\n");
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
		const result = await runGitHubTracker(operation, envelope, options.deps);
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
	const code = await handleGitHubTrackerCli({
		argv: process.argv.slice(2),
		stdin: await Bun.stdin.text(),
		deps: defaultGitHubDeps(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	});
	process.exit(code);
}
