#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";

export const PROTOCOL_VERSION = 1;
export const PROVIDER_ID = "jira";
export const PER_PAGE = 100;
export const MAX_PAGES = 50;
export const PROPERTY_KEY = "delivery.sourceAuditId";
export const NOTE_MARKER = "delivery-audit-id:";

export const JIRA_TRACKER_OPERATIONS = [
	"list",
	"read",
	"create",
	"link",
	"note",
	"statuses",
	"transition",
] as const;
export type JiraTrackerOperation = (typeof JIRA_TRACKER_OPERATIONS)[number];

const FORBIDDEN_OPERATIONS = new Set([
	"delete",
	"close",
	"resolve",
	"assign",
	"status",
	"merge",
]);

const ISSUE_FIELDS =
	"summary,description,issuetype,issuelinks,labels,comment,project";

export interface JiraRequest {
	method: "GET" | "POST" | "PUT" | "DELETE";
	url: string;
	headers: Record<string, string>;
	body?: unknown;
}

export interface JiraTrackerDeps {
	env: Record<string, string | undefined>;
	readFile: (path: string) => Promise<string>;
	fileExists: (path: string) => boolean;
	jiraRequest: (request: JiraRequest) => Promise<unknown>;
	perPage?: number;
	maxPages?: number;
}

export interface JiraCredentials {
	email: string;
	token: string;
}

export interface JiraConfig extends JiraCredentials {
	site: string;
	project: string;
}

interface NormalizedBoard {
	version: 1;
	provider: "jira";
	ref: string;
	current: string | null;
	statuses: string[];
}

interface NormalizedWorkItem {
	version: 1;
	provider: "jira";
	ref: string;
	type: "bug" | "story" | "task" | "other";
	title: string;
	body: string;
	blockedBy: string[];
	sourceAuditId?: string;
	notes: Array<{ auditId: string; body: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function secretsOf(email: string, token: string): string[] {
	const basic = Buffer.from(`${email}:${token}`).toString("base64");
	return [token, email, `${email}:${token}`, basic, `Basic ${basic}`].filter(
		(value) => value.length > 0,
	);
}

export function redact(text: string, secrets: string[]): string {
	let output = text;
	for (const secret of [...secrets]
		.filter((value) => value.length > 0)
		.sort((left, right) => right.length - left.length)) {
		output = output.split(secret).join("[redacted]");
	}
	return output;
}

function fail(message: string, secrets: string[] = []): never {
	throw new Error(redact(message, secrets));
}

export function isJiraTrackerOperation(
	value: string,
): value is JiraTrackerOperation {
	return (JIRA_TRACKER_OPERATIONS as readonly string[]).includes(value);
}

export function parseJiraSite(raw: string, secrets: string[] = []): string {
	const trimmed = raw.trim();
	if (!trimmed) fail("Set JIRA_SITE to your Jira Cloud site URL.", secrets);
	let url: URL;
	try {
		url = new URL(
			/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
		);
	} catch {
		fail("JIRA_SITE is not a valid URL.", secrets);
	}
	if (url.username || url.password) {
		fail("JIRA_SITE must not include credentials.", secrets);
	}
	if (url.protocol !== "https:") {
		fail("JIRA_SITE must be an https URL.", secrets);
	}
	return `${url.protocol}//${url.host}`;
}

export const PROJECT_SETTING_REMEDY =
	"Set this repository's Jira project with delivery init --work-items jira --setting project=<KEY>.";

export function parseJiraProject(raw: string, secrets: string[] = []): string {
	const project = raw.trim();
	if (!project) {
		fail(
			`No Jira project is set for this repository. ${PROJECT_SETTING_REMEDY}`,
			secrets,
		);
	}
	if (!/^[A-Z][A-Z0-9_]*$/.test(project)) {
		fail(
			`The repository's Jira project setting is not a valid project key. ${PROJECT_SETTING_REMEDY}`,
			secrets,
		);
	}
	return project;
}

export function auditLabel(auditId: string): string {
	const encoded = [...auditId]
		.map((character) =>
			/[a-z0-9-]/.test(character)
				? character
				: `x${character.charCodeAt(0).toString(16)}`,
		)
		.join("");
	const label = `dlv-${encoded}`;
	if (label.length <= 255) return label;
	const digest = new Bun.CryptoHasher("sha256")
		.update(auditId)
		.digest("hex")
		.slice(0, 40);
	return `dlv-h-${digest}`;
}

export function adfToText(value: unknown): string {
	if (typeof value === "string") return value.replace(/\r\n/g, "\n").trim();
	if (!isRecord(value)) return "";
	const type = asString(value.type);
	if (type === "text") return asString(value.text) ?? "";
	if (type === "hardBreak") return "\n";
	const children = Array.isArray(value.content) ? value.content : [];
	if (type === "bulletList" || type === "orderedList") {
		return children
			.map((child, index) => {
				const text = adfToText(child).trim();
				if (!text) return "";
				return type === "orderedList" ? `${index + 1}. ${text}` : `- ${text}`;
			})
			.filter(Boolean)
			.join("\n");
	}
	const inner = children.map(adfToText).join("");
	if (type === "paragraph" || type === "heading" || type === "listItem") {
		return inner;
	}
	if (type === "doc") {
		return children
			.map(adfToText)
			.map((part) => part.trim())
			.filter(Boolean)
			.join("\n\n");
	}
	return inner;
}

export function textToAdf(text: string): Record<string, unknown> {
	const paragraphs = text.replace(/\r\n/g, "\n").split(/\n\n+/);
	return {
		type: "doc",
		version: 1,
		content: paragraphs.map((paragraph) => {
			const lines = paragraph.split("\n");
			const content: Array<Record<string, unknown>> = [];
			for (const [index, line] of lines.entries()) {
				if (index > 0) content.push({ type: "hardBreak" });
				if (line.length > 0) content.push({ type: "text", text: line });
			}
			return { type: "paragraph", content };
		}),
	};
}

export function mapIssueType(name: string): "bug" | "story" | "task" | "other" {
	const lower = name.trim().toLowerCase();
	if (lower === "bug" || lower === "fault") return "bug";
	if (lower === "story" || lower === "user story") return "story";
	if (lower === "task" || lower === "sub-task" || lower === "subtask") {
		return "task";
	}
	return "other";
}

function createTypeCandidates(
	type: "bug" | "story" | "task" | "other",
): string[] {
	switch (type) {
		case "bug":
			return ["Bug"];
		case "story":
			return ["Story"];
		case "task":
			return ["Task"];
		case "other":
			return ["Task", "Other"];
	}
}

function jqlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function sameSet(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	const expected = [...right].sort();
	return [...left].sort().every((value, index) => value === expected[index]);
}

export async function resolveJiraCredentials(
	deps: JiraTrackerDeps,
): Promise<JiraCredentials> {
	const envEmail = deps.env.JIRA_EMAIL?.trim() ?? "";
	const envToken =
		deps.env.JIRA_API_TOKEN?.trim() || deps.env.JIRA_TOKEN?.trim() || "";
	if (envEmail && envToken) return { email: envEmail, token: envToken };
	const tokenFile =
		deps.env.JIRA_TOKEN_FILE?.trim() ||
		(deps.env.HOME ? join(deps.env.HOME, "jira-token") : "");
	if (!tokenFile || !deps.fileExists(tokenFile)) {
		fail(
			"Set JIRA_EMAIL and JIRA_API_TOKEN, or JIRA_TOKEN_FILE, or ~/jira-token for Jira access.",
		);
	}
	const raw = await deps.readFile(tokenFile).catch(() => {
		fail("Could not read the Jira token file.");
	});
	const contents = raw.replace(/^\uFEFF/, "").trim();
	if (!contents) fail("Jira token file is empty.");
	const lines = contents
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const first = lines[0];
	const second = lines[1];
	if (first && second) return { email: first, token: second };
	if (first) {
		const colon = first.indexOf(":");
		if (colon > 0) {
			const email = first.slice(0, colon).trim() || envEmail;
			const token = first.slice(colon + 1).trim();
			if (email && token) return { email, token };
		}
		if (envEmail && first) return { email: envEmail, token: first };
	}
	fail("Jira token file must contain email and token.");
}

// The project is per repository: one machine files work items for repositories in different
// projects, so it comes only from the repository's settings, never the environment. The site may
// be overridden per repository too, and otherwise falls back to JIRA_SITE.
export async function resolveJiraConfig(
	deps: JiraTrackerDeps,
	settings: Record<string, string> = {},
): Promise<JiraConfig> {
	const credentials = await resolveJiraCredentials(deps);
	const secrets = secretsOf(credentials.email, credentials.token);
	const site = parseJiraSite(
		settings.site ?? deps.env.JIRA_SITE ?? "",
		secrets,
	);
	const project = parseJiraProject(settings.project ?? "", secrets);
	return { ...credentials, site, project };
}

function requestHeaders(
	credentials: JiraCredentials,
	jsonBody: boolean,
): Record<string, string> {
	return {
		Authorization: `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString("base64")}`,
		Accept: "application/json",
		...(jsonBody ? { "Content-Type": "application/json" } : {}),
	};
}

function assertSafeRequest(request: JiraRequest, secrets: string[]): void {
	for (const secret of secrets) {
		if (secret.length > 0 && request.url.includes(secret)) {
			fail("Refusing to send a Jira URL that embeds a credential.", secrets);
		}
	}
	const path = (request.url.split("?")[0] ?? "").toLowerCase();
	if (
		path.includes("/transitions") &&
		!/\/rest\/api\/3\/issue\/[^/]+\/transitions$/.test(path)
	) {
		fail(
			"Jira adapter only moves issues through the issue transitions endpoint.",
			secrets,
		);
	}
	if (
		request.method === "DELETE" &&
		/\/rest\/api\/3\/issue\/[^/]+$/.test(path)
	) {
		fail("Jira adapter does not delete issues.", secrets);
	}
}

async function jiraCall(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	method: JiraRequest["method"],
	url: string,
	body?: unknown,
): Promise<unknown> {
	const secrets = secretsOf(config.email, config.token);
	if (url.includes(config.token) || url.includes(config.email)) {
		fail("Refusing to send a Jira URL that embeds a credential.", secrets);
	}
	const request: JiraRequest = {
		method,
		url,
		headers: requestHeaders(config, body !== undefined),
		...(body !== undefined ? { body } : {}),
	};
	assertSafeRequest(request, secrets);
	try {
		return await deps.jiraRequest(request);
	} catch (error) {
		fail(
			error instanceof Error ? error.message : "Jira request failed.",
			secrets,
		);
	}
}

function apiUrl(config: JiraConfig, resource: string): string {
	return `${config.site}/rest/api/3${resource}`;
}

// Jira Cloud retired `/search` (it answers 410); `/search/jql` pages by an
// opaque `nextPageToken` and reports `isLast` instead of `startAt`/`total`.
function searchUrl(
	config: JiraConfig,
	jql: string,
	nextPageToken: string | undefined,
	maxResults: number,
): string {
	const url = new URL(apiUrl(config, "/search/jql"));
	url.searchParams.set("jql", jql);
	if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
	url.searchParams.set("maxResults", String(maxResults));
	url.searchParams.set("fields", ISSUE_FIELDS);
	return url.toString();
}

function issueUrl(config: JiraConfig, ref: string): string {
	const url = new URL(apiUrl(config, `/issue/${encodeURIComponent(ref)}`));
	url.searchParams.set("fields", ISSUE_FIELDS);
	url.searchParams.set("properties", PROPERTY_KEY);
	return url.toString();
}

async function searchIssues(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	jql: string,
): Promise<unknown[]> {
	const secrets = secretsOf(config.email, config.token);
	const perPage = deps.perPage ?? PER_PAGE;
	const maxPages = deps.maxPages ?? MAX_PAGES;
	const issues: unknown[] = [];
	let nextPageToken: string | undefined;
	for (let page = 0; page < maxPages; page += 1) {
		const payload = await jiraCall(
			deps,
			config,
			"GET",
			searchUrl(config, jql, nextPageToken, perPage),
		);
		if (!isRecord(payload) || !Array.isArray(payload.issues)) {
			fail("Jira listing was not an issue search result.", secrets);
		}
		issues.push(...payload.issues);
		// A short page is not the end: only `isLast` or a missing token is.
		nextPageToken = asString(payload.nextPageToken)?.trim() || undefined;
		if (payload.isLast === true || !nextPageToken) return issues;
	}
	fail("Jira listing exceeded the page limit.", secrets);
}

function propertyValue(raw: unknown): string | undefined {
	if (typeof raw === "string" && raw.trim()) return raw.trim();
	if (isRecord(raw)) {
		const auditId = asString(raw.auditId)?.trim();
		if (auditId) return auditId;
		const value = raw.value;
		if (typeof value === "string" && value.trim()) return value.trim();
		if (isRecord(value)) return asString(value.auditId)?.trim();
	}
	return undefined;
}

function sourceAuditIdOf(raw: Record<string, unknown>): string | undefined {
	if (isRecord(raw.properties)) {
		const direct = propertyValue(raw.properties[PROPERTY_KEY]);
		if (direct) return direct;
	}
	return undefined;
}

function blockedByFromLinks(links: unknown): string[] {
	if (!Array.isArray(links)) return [];
	const keys: string[] = [];
	for (const link of links) {
		if (!isRecord(link)) continue;
		const type = isRecord(link.type) ? link.type : {};
		const name = asString(type.name)?.toLowerCase() ?? "";
		const inward = asString(type.inward)?.toLowerCase() ?? "";
		if (name !== "blocks" && inward !== "is blocked by") continue;
		const blocker = isRecord(link.outwardIssue)
			? asString(link.outwardIssue.key)?.trim()
			: undefined;
		if (blocker) keys.push(blocker);
	}
	return keys;
}

function blockerLinkId(link: unknown, blocker: string): string | undefined {
	if (!isRecord(link)) return undefined;
	const type = isRecord(link.type) ? link.type : {};
	const name = asString(type.name)?.toLowerCase() ?? "";
	const inward = asString(type.inward)?.toLowerCase() ?? "";
	if (name !== "blocks" && inward !== "is blocked by") return undefined;
	const key = isRecord(link.outwardIssue)
		? asString(link.outwardIssue.key)?.trim()
		: undefined;
	if (key !== blocker) return undefined;
	return asString(link.id)?.trim();
}

export function parseTaggedNote(
	text: string,
): { auditId: string; body: string } | null {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	for (const [index, line] of lines.entries()) {
		const match = line
			.trim()
			.match(/^delivery-audit-id:\s*([a-z0-9][a-z0-9._:-]*)$/);
		const auditId = match?.[1];
		if (!auditId || auditId.length > 200) continue;
		const body = lines
			.slice(index + 1)
			.join("\n")
			.trim();
		if (!body) continue;
		return { auditId, body };
	}
	return null;
}

function commentsFromField(raw: unknown): unknown[] {
	if (Array.isArray(raw)) return raw;
	if (isRecord(raw) && Array.isArray(raw.comments)) return raw.comments;
	return [];
}

function commentTotal(raw: unknown, fallback: number): number {
	if (isRecord(raw) && asNumber(raw.total) !== undefined) {
		return asNumber(raw.total) ?? fallback;
	}
	return fallback;
}

function notesFromComments(comments: unknown[]): NormalizedWorkItem["notes"] {
	const notes: NormalizedWorkItem["notes"] = [];
	const seen = new Set<string>();
	for (const comment of comments) {
		if (!isRecord(comment)) continue;
		const parsed = parseTaggedNote(adfToText(comment.body));
		if (!parsed || seen.has(parsed.auditId)) continue;
		seen.add(parsed.auditId);
		notes.push(parsed);
	}
	return notes;
}

function requireIssue(
	raw: unknown,
	secrets: string[],
	requestedRef?: string,
): Record<string, unknown> {
	if (!isRecord(raw)) fail("Jira issue is malformed.", secrets);
	const key = asString(raw.key)?.trim() || requestedRef;
	if (!key) fail("Jira issue is missing a key.", secrets);
	if (!isRecord(raw.fields)) fail("Jira issue is missing fields.", secrets);
	return raw;
}

function normalizeIssue(
	raw: unknown,
	secrets: string[],
	requestedRef?: string,
	comments?: unknown[],
): NormalizedWorkItem {
	const issue = requireIssue(raw, secrets, requestedRef);
	const fields = issue.fields as Record<string, unknown>;
	const ref = asString(issue.key)?.trim() || requestedRef;
	if (!ref) fail("Jira issue is missing a key.", secrets);
	const title = asString(fields.summary)?.trim();
	if (!title) fail("Jira issue is missing a title.", secrets);
	const description = adfToText(fields.description);
	const typeName = isRecord(fields.issuetype)
		? asString(fields.issuetype.name)?.trim()
		: undefined;
	if (!typeName) fail("Jira issue is missing a type.", secrets);
	const sourceAuditId = sourceAuditIdOf(issue);
	const loadedComments = comments ?? commentsFromField(fields.comment);
	const item: NormalizedWorkItem = {
		version: PROTOCOL_VERSION,
		provider: PROVIDER_ID,
		ref,
		type: mapIssueType(typeName),
		title,
		body: description || title,
		blockedBy: blockedByFromLinks(fields.issuelinks),
		notes: notesFromComments(loadedComments),
	};
	if (sourceAuditId) item.sourceAuditId = sourceAuditId;
	return item;
}

async function loadComments(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	ref: string,
	embedded: unknown,
): Promise<unknown[]> {
	const comments = commentsFromField(embedded);
	const total = commentTotal(embedded, comments.length);
	if (total <= comments.length) return comments;
	const secrets = secretsOf(config.email, config.token);
	const perPage = deps.perPage ?? PER_PAGE;
	const maxPages = deps.maxPages ?? MAX_PAGES;
	const all: unknown[] = [];
	for (let page = 0; page < maxPages; page += 1) {
		const startAt = page * perPage;
		const url = new URL(
			apiUrl(config, `/issue/${encodeURIComponent(ref)}/comment`),
		);
		url.searchParams.set("startAt", String(startAt));
		url.searchParams.set("maxResults", String(perPage));
		const payload = await jiraCall(deps, config, "GET", url.toString());
		if (!isRecord(payload) || !Array.isArray(payload.comments)) {
			fail("Jira comments were not a list.", secrets);
		}
		all.push(...payload.comments);
		const listed = asNumber(payload.total) ?? all.length;
		if (payload.comments.length < perPage || all.length >= listed) return all;
	}
	fail("Jira comment listing exceeded the page limit.", secrets);
}

async function loadIssue(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	ref: string,
): Promise<NormalizedWorkItem> {
	const secrets = secretsOf(config.email, config.token);
	const trimmed = ref.trim();
	if (!trimmed) fail("Jira issue reference is required.", secrets);
	const raw = await jiraCall(deps, config, "GET", issueUrl(config, trimmed));
	const issue = requireIssue(raw, secrets, trimmed);
	const fields = issue.fields as Record<string, unknown>;
	const comments = await loadComments(deps, config, trimmed, fields.comment);
	return normalizeIssue(issue, secrets, trimmed, comments);
}

function envelopeSettings(
	raw: Record<string, unknown>,
	secrets: string[],
): Record<string, string> {
	if (raw.settings === undefined) return {};
	if (!isRecord(raw.settings)) {
		fail("Jira adapter settings must be an object.", secrets);
	}
	const settings: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw.settings)) {
		const text = asString(value);
		if (text === undefined) {
			fail(`Jira adapter setting ${key} must be text.`, secrets);
		}
		settings[key] = text;
	}
	return settings;
}

function envelopeInput(
	raw: unknown,
	secrets: string[],
): {
	input: Record<string, unknown>;
	settings: Record<string, string>;
} {
	if (!isRecord(raw)) {
		fail("Jira adapter expected version-1 JSON on stdin.", secrets);
	}
	if (raw.version !== PROTOCOL_VERSION) {
		fail("Jira adapter expected a version-1 JSON request.", secrets);
	}
	const provider = asString(raw.provider);
	if (provider !== undefined && provider !== PROVIDER_ID) {
		fail("This adapter only serves the jira provider.", secrets);
	}
	const settings = envelopeSettings(raw, secrets);
	const nested = isRecord(raw.input) ? raw.input : undefined;
	if (nested) return { input: nested, settings };
	const input: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (
			key === "version" ||
			key === "provider" ||
			key === "repositoryRoot" ||
			key === "settings" ||
			key === "input"
		) {
			continue;
		}
		input[key] = value;
	}
	return { input, settings };
}

function requireApproved(
	input: Record<string, unknown>,
	secrets: string[],
): void {
	if (input.approved !== true) {
		fail("Work-item mutations require approved input.", secrets);
	}
}

function requireText(
	input: Record<string, unknown>,
	field: string,
	secrets: string[],
): string {
	const value = asString(input[field])?.trim();
	if (!value) fail(`Jira ${field} is required.`, secrets);
	return value;
}

function requireRef(input: Record<string, unknown>, secrets: string[]): string {
	return requireText(input, "ref", secrets);
}

function requireStringArray(
	input: Record<string, unknown>,
	field: string,
	secrets: string[],
): string[] {
	const raw = input[field];
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) fail(`Jira ${field} must be an array.`, secrets);
	return raw.map((value) => {
		const text = asString(value)?.trim();
		if (!text) fail(`Jira ${field} entries must be references.`, secrets);
		return text;
	});
}

function requireAuditId(
	input: Record<string, unknown>,
	secrets: string[],
): string {
	const auditId = asString(input.auditId)?.trim();
	if (
		!auditId ||
		!/^[a-z0-9][a-z0-9._:-]*$/.test(auditId) ||
		auditId.length > 200
	) {
		fail("Jira audit id is invalid.", secrets);
	}
	return auditId;
}

async function handleList(
	deps: JiraTrackerDeps,
	config: JiraConfig,
): Promise<NormalizedWorkItem[]> {
	const secrets = secretsOf(config.email, config.token);
	const issues = await searchIssues(
		deps,
		config,
		`project = ${jqlString(config.project)} ORDER BY key ASC`,
	);
	const items: NormalizedWorkItem[] = [];
	for (const issue of issues) {
		const record = requireIssue(issue, secrets);
		const fields = record.fields as Record<string, unknown>;
		const ref = asString(record.key)?.trim();
		if (!ref) fail("Jira issue is missing a key.", secrets);
		const comments = await loadComments(deps, config, ref, fields.comment);
		items.push(normalizeIssue(record, secrets, ref, comments));
	}
	return items;
}

async function findByAuditId(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	auditId: string,
): Promise<NormalizedWorkItem | null> {
	const secrets = secretsOf(config.email, config.token);
	const label = auditLabel(auditId);
	const issues = await searchIssues(
		deps,
		config,
		`project = ${jqlString(config.project)} AND labels = ${jqlString(label)} ORDER BY key ASC`,
	);
	for (const issue of issues) {
		const record = requireIssue(issue, secrets);
		const ref = asString(record.key)?.trim();
		if (!ref) continue;
		const loaded = await loadIssue(deps, config, ref);
		if (loaded.sourceAuditId && loaded.sourceAuditId !== auditId) continue;
		if (!loaded.sourceAuditId) {
			await jiraCall(
				deps,
				config,
				"PUT",
				apiUrl(
					config,
					`/issue/${encodeURIComponent(ref)}/properties/${encodeURIComponent(PROPERTY_KEY)}`,
				),
				{ auditId },
			);
			loaded.sourceAuditId = auditId;
		}
		return loaded;
	}
	return null;
}

async function resolveCreateType(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	type: "bug" | "story" | "task" | "other",
): Promise<string> {
	const secrets = secretsOf(config.email, config.token);
	const project = await jiraCall(
		deps,
		config,
		"GET",
		apiUrl(config, `/project/${encodeURIComponent(config.project)}`),
	);
	if (!isRecord(project) || !Array.isArray(project.issueTypes)) {
		fail("Jira project did not list issue types.", secrets);
	}
	const names = project.issueTypes
		.map((entry) =>
			isRecord(entry) ? asString(entry.name)?.trim() : undefined,
		)
		.filter((name): name is string => Boolean(name));
	for (const candidate of createTypeCandidates(type)) {
		const match = names.find(
			(name) => name.toLowerCase() === candidate.toLowerCase(),
		);
		if (match) return match;
	}
	fail(
		`Jira project ${config.project} has no issue type for ${type} work items.`,
		secrets,
	);
}

async function setBlockedBy(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	ref: string,
	desired: string[],
	currentItem: NormalizedWorkItem,
	currentRaw: unknown,
): Promise<void> {
	const secrets = secretsOf(config.email, config.token);
	const current = currentItem.blockedBy;
	const toAdd = desired.filter((key) => !current.includes(key));
	const toRemove = current.filter((key) => !desired.includes(key));
	const fields =
		isRecord(currentRaw) && isRecord(currentRaw.fields)
			? currentRaw.fields
			: {};
	const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
	for (const blocker of toAdd) {
		await jiraCall(deps, config, "POST", apiUrl(config, "/issueLink"), {
			type: { name: "Blocks" },
			inwardIssue: { key: ref },
			outwardIssue: { key: blocker },
		});
	}
	for (const blocker of toRemove) {
		const id = links
			.map((link) => blockerLinkId(link, blocker))
			.find((value): value is string => Boolean(value));
		if (!id) {
			fail(`Jira blocker link for ${blocker} is missing an id.`, secrets);
		}
		await jiraCall(
			deps,
			config,
			"DELETE",
			apiUrl(config, `/issueLink/${encodeURIComponent(id)}`),
		);
	}
}

async function handleCreate(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	input: Record<string, unknown>,
): Promise<NormalizedWorkItem> {
	const secrets = secretsOf(config.email, config.token);
	requireApproved(input, secrets);
	const auditId = requireAuditId(input, secrets);
	const title = requireText(input, "title", secrets);
	const body = requireText(input, "body", secrets);
	const typeRaw = asString(input.type)?.trim() ?? "story";
	if (!["bug", "story", "task", "other"].includes(typeRaw)) {
		fail("Jira work-item type is invalid.", secrets);
	}
	const type = typeRaw as "bug" | "story" | "task" | "other";
	const blockedBy = requireStringArray(input, "blockedBy", secrets);
	const requestedRef = asString(input.ref)?.trim();
	const existing = await findByAuditId(deps, config, auditId);
	if (existing) {
		if (requestedRef && requestedRef !== existing.ref) {
			fail(
				`audit id '${auditId}' already identifies different work-item content`,
				secrets,
			);
		}
		if (
			existing.title !== title ||
			existing.body !== body ||
			existing.type !== type ||
			!sameSet(existing.blockedBy, blockedBy)
		) {
			fail(
				`audit id '${auditId}' already identifies different work-item content`,
				secrets,
			);
		}
		return existing;
	}
	if (requestedRef) {
		fail(
			"Jira allocates issue keys; omit ref to create a new issue or reuse the audit id of an existing one.",
			secrets,
		);
	}
	const issueType = await resolveCreateType(deps, config, type);
	const created = await jiraCall(
		deps,
		config,
		"POST",
		apiUrl(config, "/issue"),
		{
			fields: {
				project: { key: config.project },
				summary: title,
				description: textToAdf(body),
				issuetype: { name: issueType },
				labels: [auditLabel(auditId)],
			},
		},
	);
	if (!isRecord(created) || !asString(created.key)?.trim()) {
		fail("Jira did not return a created issue key.", secrets);
	}
	const ref = asString(created.key)?.trim() ?? "";
	await jiraCall(
		deps,
		config,
		"PUT",
		apiUrl(
			config,
			`/issue/${encodeURIComponent(ref)}/properties/${encodeURIComponent(PROPERTY_KEY)}`,
		),
		{ auditId },
	);
	if (blockedBy.length > 0) {
		const currentRaw = await jiraCall(
			deps,
			config,
			"GET",
			issueUrl(config, ref),
		);
		const current = normalizeIssue(currentRaw, secrets, ref);
		await setBlockedBy(deps, config, ref, blockedBy, current, currentRaw);
	}
	const loaded = await loadIssue(deps, config, ref);
	return { ...loaded, sourceAuditId: loaded.sourceAuditId ?? auditId };
}

async function handleLink(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	input: Record<string, unknown>,
): Promise<NormalizedWorkItem> {
	const secrets = secretsOf(config.email, config.token);
	requireApproved(input, secrets);
	const ref = requireRef(input, secrets);
	const blockedBy = requireStringArray(input, "blockedBy", secrets);
	const currentRaw = await jiraCall(deps, config, "GET", issueUrl(config, ref));
	const current = normalizeIssue(currentRaw, secrets, ref);
	if (sameSet(current.blockedBy, blockedBy)) {
		return loadIssue(deps, config, ref);
	}
	await setBlockedBy(deps, config, ref, blockedBy, current, currentRaw);
	return loadIssue(deps, config, ref);
}

async function loadCommentRecords(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	ref: string,
): Promise<Array<Record<string, unknown>>> {
	const secrets = secretsOf(config.email, config.token);
	const raw = await jiraCall(deps, config, "GET", issueUrl(config, ref));
	const issue = requireIssue(raw, secrets, ref);
	const fields = issue.fields as Record<string, unknown>;
	const comments = await loadComments(deps, config, ref, fields.comment);
	return comments.filter(isRecord);
}

async function handleNote(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	input: Record<string, unknown>,
): Promise<NormalizedWorkItem> {
	const secrets = secretsOf(config.email, config.token);
	const ref = requireRef(input, secrets);
	const auditId = requireAuditId(input, secrets);
	const body = requireText(input, "body", secrets);
	const comments = await loadCommentRecords(deps, config, ref);
	const existing = comments.find((comment) => {
		const parsed = parseTaggedNote(adfToText(comment.body));
		return parsed?.auditId === auditId;
	});
	const adf = textToAdf(`${NOTE_MARKER} ${auditId}\n\n${body}`);
	if (existing) {
		const parsed = parseTaggedNote(adfToText(existing.body));
		if (parsed?.body === body) return loadIssue(deps, config, ref);
		const id = asString(existing.id)?.trim();
		if (!id) fail("Jira comment is missing an id.", secrets);
		await jiraCall(
			deps,
			config,
			"PUT",
			apiUrl(
				config,
				`/issue/${encodeURIComponent(ref)}/comment/${encodeURIComponent(id)}`,
			),
			{ body: adf },
		);
		return loadIssue(deps, config, ref);
	}
	await jiraCall(
		deps,
		config,
		"POST",
		apiUrl(config, `/issue/${encodeURIComponent(ref)}/comment`),
		{ body: adf },
	);
	return loadIssue(deps, config, ref);
}

function requireBoard(
	settings: Record<string, string>,
	secrets: string[],
): string {
	const board = settings.board?.trim();
	if (!board) {
		fail(
			"Set the Jira board setting to the board id so the factory can read the column order.",
			secrets,
		);
	}
	if (!/^\d+$/.test(board))
		fail("The Jira board setting must be a numeric board id.", secrets);
	return board;
}

async function boardStatuses(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	board: string,
): Promise<string[]> {
	const secrets = secretsOf(config.email, config.token);
	const configuration = await jiraCall(
		deps,
		config,
		"GET",
		`${config.site}/rest/agile/1.0/board/${board}/configuration`,
	);
	const columns =
		isRecord(configuration) && isRecord(configuration.columnConfig)
			? configuration.columnConfig.columns
			: undefined;
	if (!Array.isArray(columns))
		fail("Jira board configuration is malformed.", secrets);
	const known = await jiraCall(deps, config, "GET", apiUrl(config, "/status"));
	if (!Array.isArray(known)) fail("Jira status listing is malformed.", secrets);
	const names = new Map<string, string>();
	for (const status of known) {
		if (!isRecord(status)) continue;
		const id = asString(status.id);
		const name = asString(status.name)?.trim();
		if (id && name) names.set(id, name);
	}
	const statuses: string[] = [];
	for (const column of columns) {
		if (!isRecord(column) || !Array.isArray(column.statuses)) continue;
		for (const status of column.statuses) {
			const id = isRecord(status) ? asString(status.id) : undefined;
			const name = id ? names.get(id) : undefined;
			if (!name)
				fail("Jira board column names a status Jira did not list.", secrets);
			if (!statuses.includes(name)) statuses.push(name);
		}
	}
	if (statuses.length === 0)
		fail("The Jira board has no mapped statuses.", secrets);
	return statuses;
}

async function currentStatus(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	ref: string,
): Promise<string | null> {
	const url = new URL(apiUrl(config, `/issue/${encodeURIComponent(ref)}`));
	url.searchParams.set("fields", "status");
	const issue = await jiraCall(deps, config, "GET", url.toString());
	const fields =
		isRecord(issue) && isRecord(issue.fields) ? issue.fields : undefined;
	const status =
		fields && isRecord(fields.status)
			? asString(fields.status.name)?.trim()
			: undefined;
	return status || null;
}

async function handleStatuses(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	input: Record<string, unknown>,
	settings: Record<string, string>,
): Promise<NormalizedBoard> {
	const secrets = secretsOf(config.email, config.token);
	const ref = requireRef(input, secrets);
	const statuses = await boardStatuses(
		deps,
		config,
		requireBoard(settings, secrets),
	);
	return {
		version: 1,
		provider: PROVIDER_ID,
		ref,
		current: await currentStatus(deps, config, ref),
		statuses,
	};
}

async function handleTransition(
	deps: JiraTrackerDeps,
	config: JiraConfig,
	input: Record<string, unknown>,
	settings: Record<string, string>,
): Promise<NormalizedBoard> {
	const secrets = secretsOf(config.email, config.token);
	requireApproved(input, secrets);
	const ref = requireRef(input, secrets);
	const to = requireText(input, "to", secrets);
	const board = requireBoard(settings, secrets);
	const statuses = await boardStatuses(deps, config, board);
	if (!statuses.includes(to))
		fail(`'${to}' is not a status on the Jira board.`, secrets);
	const current = await currentStatus(deps, config, ref);
	if (current !== to) {
		const url = apiUrl(config, `/issue/${encodeURIComponent(ref)}/transitions`);
		const listed = await jiraCall(deps, config, "GET", url);
		const transitions =
			isRecord(listed) && Array.isArray(listed.transitions)
				? listed.transitions
				: [];
		const matches = transitions.filter(
			(transition) =>
				isRecord(transition) &&
				isRecord(transition.to) &&
				asString(transition.to.name)?.trim() === to,
		) as Array<Record<string, unknown>>;
		if (matches.length !== 1) {
			fail(
				matches.length === 0
					? `Jira has no transition from '${current ?? "no status"}' to '${to}' for ${ref}.`
					: `Jira has more than one transition to '${to}' for ${ref}.`,
				secrets,
			);
		}
		const id = asString(matches[0]?.id)?.trim();
		if (!id) fail("Jira transition is missing an id.", secrets);
		await jiraCall(deps, config, "POST", url, { transition: { id } });
	}
	return {
		version: 1,
		provider: PROVIDER_ID,
		ref,
		current: await currentStatus(deps, config, ref),
		statuses,
	};
}

export async function runJiraTracker(
	operation: string,
	rawEnvelope: unknown,
	deps: JiraTrackerDeps,
): Promise<NormalizedWorkItem | NormalizedWorkItem[] | NormalizedBoard> {
	if (FORBIDDEN_OPERATIONS.has(operation)) {
		fail(
			"Jira adapter does not delete issues or perform other human-owned lifecycle actions.",
		);
	}
	if (!isJiraTrackerOperation(operation)) {
		fail(
			"usage: jira-tracker <list|read|create|link|note|statuses|transition>",
		);
	}
	const { input, settings } = envelopeInput(rawEnvelope, []);
	const config = await resolveJiraConfig(deps, settings);
	const secrets = secretsOf(config.email, config.token);
	switch (operation) {
		case "list":
			return handleList(deps, config);
		case "read":
			return loadIssue(deps, config, requireRef(input, secrets));
		case "create":
			return handleCreate(deps, config, input);
		case "link":
			return handleLink(deps, config, input);
		case "note":
			return handleNote(deps, config, input);
		case "statuses":
			return handleStatuses(deps, config, input, settings);
		case "transition":
			return handleTransition(deps, config, input, settings);
	}
}

export function defaultJiraTrackerDeps(
	env: Record<string, string | undefined> = process.env,
): JiraTrackerDeps {
	return {
		env,
		readFile: (path) => Bun.file(path).text(),
		fileExists: (path) => existsSync(path),
		jiraRequest: async (request) => {
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
					fail("Jira authentication failed.");
				}
				if (response.status === 404) {
					if (request.url.includes("/properties/")) return null;
					fail("Jira did not find that issue.");
				}
				fail(`Jira request failed (HTTP ${response.status}).`);
			}
			if (!text.trim()) return null;
			try {
				return JSON.parse(text) as unknown;
			} catch {
				fail("Jira returned an invalid JSON response.");
			}
		},
	};
}

export async function handleJiraTrackerCli(options: {
	argv: string[];
	stdin: string;
	deps: JiraTrackerDeps;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const operation = options.argv[0];
	if (!operation) {
		options.stderr(
			"usage: jira-tracker <list|read|create|link|note|statuses|transition>\n",
		);
		return 2;
	}
	let envelope: unknown;
	try {
		envelope = JSON.parse(options.stdin);
	} catch {
		options.stderr("Jira adapter expected version-1 JSON on stdin.\n");
		return 1;
	}
	try {
		const result = await runJiraTracker(operation, envelope, options.deps);
		options.stdout(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	} catch (error) {
		options.stderr(
			`${error instanceof Error ? error.message : "Jira adapter failed."}\n`,
		);
		return 1;
	}
}

if (import.meta.main) {
	const code = await handleJiraTrackerCli({
		argv: process.argv.slice(2),
		stdin: await Bun.stdin.text(),
		deps: defaultJiraTrackerDeps(),
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	});
	process.exit(code);
}
