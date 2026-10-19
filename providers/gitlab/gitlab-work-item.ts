#!/usr/bin/env bun
import {
	type GitLabHostDeps,
	type GitLabTarget,
	PROTOCOL_VERSION,
	PROVIDER_ID,
	apiUrl,
	asString,
	defaultGitLabHostDeps,
	fail,
	gitlabCall,
	gitlabGet,
	gitlabPaged,
	isRecord,
	resolveGitLabTarget,
	resolveGitLabToken,
} from "./gitlab-host";

export const GITLAB_WORK_ITEM_OPERATIONS = [
	"list",
	"read",
	"create",
	"link",
	"note",
] as const;
export type GitLabWorkItemOperation =
	(typeof GITLAB_WORK_ITEM_OPERATIONS)[number];

const FORBIDDEN_OPERATIONS = new Set([
	"close",
	"delete",
	"merge",
	"approve",
	"resolve",
	"reopen",
	"transition",
	"status",
]);

const WORK_ITEM_TYPES = ["bug", "story", "task", "other"] as const;
type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

const AUDIT_ID = /^[a-z0-9][a-z0-9._:-]*$/;
const AUDIT_MARKER =
	/<!--\s*delivery-audit-id:\s*([a-z0-9][a-z0-9._:-]*)\s*-->/i;
const TYPE_MARKER = /<!--\s*delivery-type:\s*(bug|story|task|other)\s*-->/i;

export interface GitLabWorkItem {
	version: 1;
	provider: typeof PROVIDER_ID;
	ref: string;
	type: WorkItemType;
	title: string;
	body: string;
	blockedBy: string[];
	sourceAuditId?: string;
	notes: Array<{ auditId: string; body: string }>;
}

export type GitLabWorkItemDeps = GitLabHostDeps;

function isWorkItemOperation(value: string): value is GitLabWorkItemOperation {
	return (GITLAB_WORK_ITEM_OPERATIONS as readonly string[]).includes(value);
}

function envelopeInput(raw: unknown): {
	repositoryRoot: string;
	input: Record<string, unknown>;
} {
	if (!isRecord(raw)) fail("GitLab adapter expected version-1 JSON on stdin.");
	if (raw.version !== PROTOCOL_VERSION) {
		fail("GitLab adapter expected a version-1 JSON request.");
	}
	const provider = asString(raw.provider);
	if (provider !== undefined && provider !== PROVIDER_ID) {
		fail("This adapter only serves the gitlab provider.");
	}
	if (!isRecord(raw.input)) {
		fail("GitLab adapter expected an input object.");
	}
	const repositoryRoot = asString(raw.repositoryRoot)?.trim() || "";
	if (!repositoryRoot) {
		fail("GitLab adapter expected a repositoryRoot.");
	}
	return { repositoryRoot, input: raw.input };
}

function unexpectedKeys(
	input: Record<string, unknown>,
	allowed: string[],
): void {
	const allowedKeys = new Set(allowed);
	for (const key of Object.keys(input)) {
		if (!allowedKeys.has(key)) fail(`Unexpected field '${key}'.`);
	}
}

function requireApproved(input: Record<string, unknown>): void {
	if (input.approved !== true) {
		fail("Work-item mutations require approved input.");
	}
}

function parseReference(value: unknown, field: string): string {
	const ref = asString(value)?.trim();
	if (!ref) fail(`GitLab ${field} is required.`);
	if (ref.length > 200) fail(`GitLab ${field} is too long.`);
	if (
		[...ref].some((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 127;
		})
	) {
		fail("work-item reference contains control characters");
	}
	return ref;
}

export function gitlabIssueIidFromRef(ref: string): string {
	const trimmed = ref.trim();
	const match = trimmed.match(/^#?(\d+)$/);
	const iid = match?.[1];
	if (!iid) fail("GitLab issue id must be numeric.");
	return iid;
}

function parseAuditId(value: unknown, field: string): string {
	const auditId = asString(value)?.trim();
	if (!auditId || auditId.length > 200 || !AUDIT_ID.test(auditId)) {
		fail(`GitLab ${field} is not a valid audit id.`);
	}
	return auditId;
}

function parseType(value: unknown): WorkItemType {
	if (value === undefined) return "story";
	if (
		typeof value === "string" &&
		(WORK_ITEM_TYPES as readonly string[]).includes(value)
	) {
		return value as WorkItemType;
	}
	fail("GitLab work-item type is invalid.");
}

function parseBlockedBy(value: unknown): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) fail("GitLab blockedBy must be an array.");
	return value.map((entry) => parseReference(entry, "blockedBy"));
}

function parseText(value: unknown, field: string): string {
	const text = asString(value)?.trim();
	if (!text) fail(`GitLab ${field} is required.`);
	return text;
}

function markerValue(text: string, pattern: RegExp): string | undefined {
	return text.match(pattern)?.[1];
}

function stripMarkers(text: string): string {
	return text
		.replace(/<!--\s*delivery-audit-id:\s*[a-z0-9][a-z0-9._:-]*\s*-->/gi, "")
		.replace(/<!--\s*delivery-type:\s*(?:bug|story|task|other)\s*-->/gi, "")
		.trim();
}

function descriptionFor(
	type: WorkItemType,
	auditId: string,
	body: string,
): string {
	return [
		`<!-- delivery-audit-id: ${auditId} -->`,
		`<!-- delivery-type: ${type} -->`,
		"",
		body,
	].join("\n");
}

function noteBodyFor(auditId: string, body: string): string {
	return `<!-- delivery-audit-id: ${auditId} -->\n${body}`;
}

function iidOf(raw: unknown): string | undefined {
	if (!isRecord(raw)) return undefined;
	const iid = raw.iid;
	if (typeof iid === "number" && Number.isFinite(iid)) return String(iid);
	if (typeof iid === "string" && /^\d+$/.test(iid.trim())) return iid.trim();
	return undefined;
}

function blockedByFromLinks(raw: unknown[]): string[] {
	const refs: string[] = [];
	for (const entry of raw) {
		if (!isRecord(entry)) fail("GitLab issue link is malformed.");
		if (asString(entry.link_type) !== "is_blocked_by") continue;
		const iid = iidOf(entry);
		if (!iid) fail("GitLab issue link is missing an issue id.");
		if (!refs.includes(iid)) refs.push(iid);
	}
	return refs;
}

function notesFromRaw(raw: unknown[]): GitLabWorkItem["notes"] {
	const notes: GitLabWorkItem["notes"] = [];
	for (const entry of raw) {
		if (!isRecord(entry)) fail("GitLab issue note is malformed.");
		if (entry.system === true) continue;
		const body = asString(entry.body) ?? "";
		const auditId = markerValue(body, AUDIT_MARKER);
		if (!auditId) continue;
		const text = stripMarkers(body);
		if (!text) fail("GitLab issue note is missing a body.");
		const existing = notes.findIndex((note) => note.auditId === auditId);
		const note = { auditId, body: text };
		if (existing >= 0) notes[existing] = note;
		else notes.push(note);
	}
	return notes;
}

function normalizeIssue(
	raw: unknown,
	links: unknown[],
	notes: unknown[],
): GitLabWorkItem {
	if (!isRecord(raw)) fail("GitLab issue is malformed.");
	const ref = iidOf(raw);
	if (!ref) fail("GitLab issue is missing an id.");
	const title = asString(raw.title)?.trim();
	if (!title) fail("GitLab issue is missing a title.");
	const description = asString(raw.description) ?? "";
	const type =
		(markerValue(description, TYPE_MARKER) as WorkItemType | undefined) ??
		"story";
	const sourceAuditId = markerValue(description, AUDIT_MARKER);
	const body = stripMarkers(description) || title;
	const item: GitLabWorkItem = {
		version: 1,
		provider: PROVIDER_ID,
		ref,
		type,
		title,
		body,
		blockedBy: blockedByFromLinks(links),
		notes: notesFromRaw(notes),
	};
	if (sourceAuditId) item.sourceAuditId = sourceAuditId;
	return item;
}

async function loadIssue(
	deps: GitLabWorkItemDeps,
	token: string,
	target: GitLabTarget,
	iid: string,
): Promise<GitLabWorkItem> {
	const raw = await gitlabGet(deps, token, apiUrl(target, `/issues/${iid}`));
	const links = await gitlabPaged(deps, token, target, `/issues/${iid}/links`);
	const notes = await gitlabPaged(deps, token, target, `/issues/${iid}/notes`);
	return normalizeIssue(raw, links, notes);
}

async function context(envelope: unknown, deps: GitLabWorkItemDeps) {
	const parsed = envelopeInput(envelope);
	const token = await resolveGitLabToken(deps);
	const target = await resolveGitLabTarget(parsed.repositoryRoot, deps);
	return { ...parsed, token, target };
}

function sameContent(
	item: GitLabWorkItem,
	input: {
		title: string;
		body: string;
		type: WorkItemType;
		blockedBy: string[];
	},
): boolean {
	return (
		item.title === input.title &&
		item.body === input.body &&
		item.type === input.type &&
		JSON.stringify(item.blockedBy) === JSON.stringify(input.blockedBy)
	);
}

async function findByAuditId(
	deps: GitLabWorkItemDeps,
	token: string,
	target: GitLabTarget,
	auditId: string,
): Promise<GitLabWorkItem | undefined> {
	const issues = await gitlabPaged(deps, token, target, "/issues?state=all");
	for (const raw of issues) {
		if (!isRecord(raw)) continue;
		const description = asString(raw.description) ?? "";
		if (markerValue(description, AUDIT_MARKER) !== auditId) continue;
		const iid = iidOf(raw);
		if (!iid) fail("GitLab issue is missing an id.");
		return loadIssue(deps, token, target, iid);
	}
	return undefined;
}

async function addMissingLinks(
	deps: GitLabWorkItemDeps,
	token: string,
	target: GitLabTarget,
	iid: string,
	current: string[],
	requested: string[],
): Promise<void> {
	for (const ref of requested) {
		const blocker = gitlabIssueIidFromRef(ref);
		if (current.includes(blocker)) continue;
		await gitlabCall(
			deps,
			token,
			"POST",
			apiUrl(target, `/issues/${iid}/links`),
			{
				target_project_id: target.project,
				target_issue_iid: Number(blocker),
				link_type: "is_blocked_by",
			},
			[409],
		);
	}
}

async function handleList(
	envelope: unknown,
	deps: GitLabWorkItemDeps,
): Promise<GitLabWorkItem[]> {
	const { input, token, target } = await context(envelope, deps);
	unexpectedKeys(input, []);
	const issues = await gitlabPaged(deps, token, target, "/issues?state=all");
	const items: GitLabWorkItem[] = [];
	for (const raw of issues) {
		const iid = iidOf(raw);
		if (!iid) fail("GitLab issue is missing an id.");
		items.push(await loadIssue(deps, token, target, iid));
	}
	return items.sort((left, right) => left.ref.localeCompare(right.ref));
}

async function handleRead(
	envelope: unknown,
	deps: GitLabWorkItemDeps,
): Promise<GitLabWorkItem> {
	const { input, token, target } = await context(envelope, deps);
	unexpectedKeys(input, ["ref"]);
	const iid = gitlabIssueIidFromRef(parseReference(input.ref, "ref"));
	return loadIssue(deps, token, target, iid);
}

async function handleCreate(
	envelope: unknown,
	deps: GitLabWorkItemDeps,
): Promise<GitLabWorkItem> {
	const { input, token, target } = await context(envelope, deps);
	unexpectedKeys(input, [
		"approved",
		"auditId",
		"ref",
		"type",
		"title",
		"body",
		"blockedBy",
	]);
	requireApproved(input);
	const auditId = parseAuditId(input.auditId, "auditId");
	const type = parseType(input.type);
	const title = parseText(input.title, "title");
	const body = parseText(input.body, "body");
	const blockedBy = parseBlockedBy(input.blockedBy);
	if (input.ref !== undefined) {
		parseReference(input.ref, "ref");
	}
	const existing = await findByAuditId(deps, token, target, auditId);
	if (existing) {
		if (!sameContent(existing, { title, body, type, blockedBy })) {
			fail(
				`audit id '${auditId}' already identifies different work-item content`,
			);
		}
		return existing;
	}
	if (input.ref !== undefined) {
		fail("GitLab assigns issue ids; omit ref when creating.");
	}
	const created = await gitlabCall(
		deps,
		token,
		"POST",
		apiUrl(target, "/issues"),
		{
			title,
			description: descriptionFor(type, auditId, body),
		},
	);
	const iid = iidOf(created);
	if (!iid) fail("GitLab issue is missing an id.");
	await addMissingLinks(deps, token, target, iid, [], blockedBy);
	return loadIssue(deps, token, target, iid);
}

async function handleLink(
	envelope: unknown,
	deps: GitLabWorkItemDeps,
): Promise<GitLabWorkItem> {
	const { input, token, target } = await context(envelope, deps);
	unexpectedKeys(input, ["approved", "ref", "blockedBy"]);
	requireApproved(input);
	const iid = gitlabIssueIidFromRef(parseReference(input.ref, "ref"));
	const requested = parseBlockedBy(input.blockedBy).map(gitlabIssueIidFromRef);
	const current = await loadIssue(deps, token, target, iid);
	const extra = current.blockedBy.filter((ref) => !requested.includes(ref));
	if (extra.length > 0) {
		fail("GitLab issue links cannot be removed by this adapter.");
	}
	await addMissingLinks(deps, token, target, iid, current.blockedBy, requested);
	return loadIssue(deps, token, target, iid);
}

async function handleNote(
	envelope: unknown,
	deps: GitLabWorkItemDeps,
): Promise<GitLabWorkItem> {
	const { input, token, target } = await context(envelope, deps);
	unexpectedKeys(input, ["ref", "auditId", "body"]);
	const iid = gitlabIssueIidFromRef(parseReference(input.ref, "ref"));
	const auditId = parseAuditId(input.auditId, "auditId");
	const body = parseText(input.body, "body");
	const notes = await gitlabPaged(deps, token, target, `/issues/${iid}/notes`);
	let noteId: string | undefined;
	for (const entry of notes) {
		if (!isRecord(entry) || entry.system === true) continue;
		const text = asString(entry.body) ?? "";
		if (markerValue(text, AUDIT_MARKER) !== auditId) continue;
		const id = entry.id;
		noteId =
			typeof id === "number" || typeof id === "string" ? String(id) : undefined;
	}
	const payload = { body: noteBodyFor(auditId, body) };
	if (noteId) {
		await gitlabCall(
			deps,
			token,
			"PUT",
			apiUrl(target, `/issues/${iid}/notes/${noteId}`),
			payload,
		);
	} else {
		await gitlabCall(
			deps,
			token,
			"POST",
			apiUrl(target, `/issues/${iid}/notes`),
			payload,
		);
	}
	return loadIssue(deps, token, target, iid);
}

export async function runGitLabWorkItem(
	operation: string,
	envelope: unknown,
	deps: GitLabWorkItemDeps,
): Promise<GitLabWorkItem | GitLabWorkItem[]> {
	if (FORBIDDEN_OPERATIONS.has(operation)) {
		fail(
			"This work-item adapter does not close, delete, or transition issues.",
		);
	}
	if (!isWorkItemOperation(operation)) {
		fail(`Unknown GitLab work-item operation '${operation}'.`);
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

export function defaultGitLabWorkItemDeps(
	env: Record<string, string | undefined> = process.env,
): GitLabWorkItemDeps {
	return defaultGitLabHostDeps(env, {
		notFoundMessage: "GitLab did not find that issue.",
	});
}

export async function handleGitLabWorkItemCli(options: {
	argv: string[];
	stdin: string;
	deps: GitLabWorkItemDeps;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const operation = options.argv[0];
	if (!operation) {
		options.stderr("usage: gitlab-work-item <list|read|create|link|note>\n");
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
		const result = await runGitLabWorkItem(operation, envelope, options.deps);
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
	const code = await handleGitLabWorkItemCli({
		argv: process.argv.slice(2),
		stdin: await Bun.stdin.text(),
		deps: defaultGitLabWorkItemDeps(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	});
	process.exit(code);
}
