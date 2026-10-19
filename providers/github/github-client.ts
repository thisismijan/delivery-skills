import { existsSync } from "node:fs";
import { join } from "node:path";

export const PROTOCOL_VERSION = 1;
export const PROVIDER_ID = "github";
export const PER_PAGE = 100;
export const MAX_PAGES = 50;

export const SOURCE_AUDIT_PREFIX = "<!-- delivery-source-audit-id:";
export const NOTE_AUDIT_PREFIX = "<!-- delivery-note-audit-id:";
export const TYPE_MARKER_PREFIX = "<!-- delivery-work-item-type:";

export interface GitHubTarget {
	host: string;
	apiBase: string;
	repository: string;
	owner: string;
}

export interface GitHubRequest {
	method: "GET" | "POST" | "PUT" | "PATCH";
	url: string;
	headers: Record<string, string>;
	body?: unknown;
}

export interface GitHubDeps {
	env: Record<string, string | undefined>;
	gitRemoteUrl: (repositoryRoot: string) => Promise<string | null>;
	readFile: (path: string) => Promise<string>;
	fileExists: (path: string) => boolean;
	githubRequest: (request: GitHubRequest) => Promise<unknown>;
	cwd?: () => string;
	perPage?: number;
	maxPages?: number;
}

export class GitHubHttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

export function redact(text: string, token: string | undefined): string {
	if (!token || token.length === 0) return text;
	return text.split(token).join("[redacted]");
}

export function fail(message: string, token?: string): never {
	throw new Error(redact(message, token));
}

export function parseGitHubOrigin(remoteUrl: string): GitHubTarget | null {
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
	return targetFromHostRepository(`https://${host}`, path);
}

function targetFromUrl(url: URL): GitHubTarget | null {
	return targetFromHostRepository(`${url.protocol}//${url.host}`, url.pathname);
}

export function targetFromHostRepository(
	host: string,
	repositoryPath: string,
): GitHubTarget | null {
	const repository = repositoryPath.replace(/^\/+/, "").replace(/\/+$/, "");
	if (!repository || repository.includes("..")) return null;
	const [owner, name, ...rest] = repository.split("/");
	if (!owner || !name || rest.length > 0) return null;
	const normalizedHost = host.replace(/\/+$/, "");
	return {
		host: normalizedHost,
		apiBase: apiBaseForHost(normalizedHost),
		repository: `${owner}/${name}`,
		owner,
	};
}

function apiBaseForHost(host: string): string {
	try {
		const url = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
		if (url.hostname === "github.com" || url.hostname === "www.github.com") {
			return "https://api.github.com";
		}
		return `${url.protocol}//${url.host}/api/v3`;
	} catch {
		return `${host.replace(/\/+$/, "")}/api/v3`;
	}
}

function normalizeHost(host: string | undefined): string | undefined {
	if (!host) return undefined;
	if (/^https?:\/\//i.test(host)) return host.replace(/\/+$/, "");
	return `https://${host.replace(/\/+$/, "")}`;
}

export function githubNumberFromRef(ref: string): string {
	const trimmed = ref.trim();
	const match = trimmed.match(/^#?(\d+)$/);
	const number = match?.[1];
	if (!number) {
		fail("GitHub reference must be numeric.");
	}
	return number;
}

export function sourceAuditMarker(auditId: string): string {
	return `<!-- delivery-source-audit-id: ${auditId} -->`;
}

export function noteAuditMarker(auditId: string): string {
	return `<!-- delivery-note-audit-id: ${auditId} -->`;
}

export function typeMarker(type: string): string {
	return `<!-- delivery-work-item-type: ${type} -->`;
}

export function parseMarker(
	body: string,
	prefix: string,
): string | undefined {
	const match = body.match(
		new RegExp(`${escapeRegExp(prefix)}\\s*([^\\s][^>]*)\\s*-->`),
	);
	const value = match?.[1]?.trim();
	return value || undefined;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripMarkers(body: string): string {
	return body
		.replace(/<!-- delivery-(?:source-audit-id|note-audit-id|work-item-type):.*?-->/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export async function resolveGitHubToken(deps: GitHubDeps): Promise<string> {
	const envToken =
		deps.env.GITHUB_TOKEN?.trim() || deps.env.GH_TOKEN?.trim();
	if (envToken) return envToken;
	const tokenFile =
		deps.env.GH_TOKEN_FILE?.trim() ||
		(deps.env.HOME ? join(deps.env.HOME, "token") : "");
	if (!tokenFile || !deps.fileExists(tokenFile)) {
		fail("Set GITHUB_TOKEN, GH_TOKEN, GH_TOKEN_FILE, or ~/token for GitHub access.");
	}
	const raw = await deps.readFile(tokenFile).catch(() => {
		fail("Could not read the GitHub token file.");
	});
	const token = raw.replace(/\r?\n/g, "").trim();
	if (!token) fail("GitHub token is empty.");
	return token;
}

export async function resolveGitHubTarget(
	repositoryRoot: string,
	deps: GitHubDeps,
): Promise<GitHubTarget> {
	const envRepo =
		deps.env.GH_REPO?.trim() || deps.env.GITHUB_REPOSITORY?.trim();
	const envHost = normalizeHost(
		deps.env.GH_HOST?.trim() || deps.env.GITHUB_HOST?.trim(),
	);
	if (envRepo && envHost) {
		const target = targetFromHostRepository(envHost, envRepo);
		if (!target) fail("GH_REPO is not a valid GitHub owner/repository path.");
		return target;
	}
	const remote = await deps.gitRemoteUrl(repositoryRoot);
	const fromOrigin = remote ? parseGitHubOrigin(remote) : null;
	const repository = envRepo || fromOrigin?.repository;
	const host = envHost || fromOrigin?.host || "https://github.com";
	if (!repository) {
		fail(
			"Cannot determine the GitHub repository from the repository origin; set GH_REPO.",
		);
	}
	const target = targetFromHostRepository(host, repository);
	if (!target) {
		fail("Cannot determine the GitHub repository from the repository origin.");
	}
	return target;
}

export function repoUrl(target: GitHubTarget, resource: string): string {
	return `${target.apiBase}/repos/${target.repository}${resource}`;
}

export function withQuery(url: string, params: Record<string, string>): string {
	const query = new URLSearchParams(params).toString();
	return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function requestHeaders(
	token: string,
	jsonBody: boolean,
): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		...(jsonBody ? { "Content-Type": "application/json" } : {}),
	};
}

export async function githubCall(
	deps: GitHubDeps,
	token: string,
	method: GitHubRequest["method"],
	url: string,
	body?: unknown,
): Promise<unknown> {
	if (url.includes(token)) {
		fail("Refusing to send a GitHub URL that embeds a credential.", token);
	}
	const request: GitHubRequest = {
		method,
		url,
		headers: requestHeaders(token, body !== undefined),
		...(body !== undefined ? { body } : {}),
	};
	try {
		return await deps.githubRequest(request);
	} catch (error) {
		if (error instanceof GitHubHttpError) {
			fail(error.message, token);
		}
		fail(
			error instanceof Error ? error.message : "GitHub request failed.",
			token,
		);
	}
}

export async function githubGet(
	deps: GitHubDeps,
	token: string,
	url: string,
): Promise<unknown> {
	return githubCall(deps, token, "GET", url);
}

export async function githubPaged(
	deps: GitHubDeps,
	token: string,
	url: string,
): Promise<unknown[]> {
	const perPage = deps.perPage ?? PER_PAGE;
	const maxPages = deps.maxPages ?? MAX_PAGES;
	const items: unknown[] = [];
	for (let page = 1; page <= maxPages; page += 1) {
		const pagedUrl = withQuery(url, {
			per_page: String(perPage),
			page: String(page),
		});
		const body = await githubGet(deps, token, pagedUrl);
		if (!Array.isArray(body)) {
			fail("GitHub listing was not an array.");
		}
		items.push(...body);
		if (body.length < perPage) return items;
	}
	fail("GitHub listing exceeded the page limit.");
}

export function envelopeInput(raw: unknown): {
	repositoryRoot: string;
	input: Record<string, unknown>;
	dryRun: boolean;
} {
	if (!isRecord(raw)) fail("GitHub adapter expected version-1 JSON on stdin.");
	if (raw.version !== PROTOCOL_VERSION) {
		fail("GitHub adapter expected a version-1 JSON request.");
	}
	const provider = asString(raw.provider);
	if (provider !== undefined && provider !== PROVIDER_ID) {
		fail("This adapter only serves the github provider.");
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

export async function withGitHubContext(
	envelope: unknown,
	deps: GitHubDeps,
): Promise<{
	input: Record<string, unknown>;
	target: GitHubTarget;
	token: string;
	repositoryRoot: string;
}> {
	const parsed = envelopeInput(envelope);
	const repositoryRoot =
		parsed.repositoryRoot || (deps.cwd ? deps.cwd() : process.cwd());
	const token = await resolveGitHubToken(deps);
	const target = await resolveGitHubTarget(repositoryRoot, deps);
	return {
		input: parsed.input,
		target,
		token,
		repositoryRoot,
	};
}

export function requireApproved(input: Record<string, unknown>): void {
	if (input.approved !== true) {
		fail("Forge mutations require approved input.");
	}
}

export function requireText(
	input: Record<string, unknown>,
	field: string,
): string {
	const value = asString(input[field])?.trim();
	if (!value) fail(`GitHub ${field} is required.`);
	return value;
}

export function authorName(raw: unknown): string {
	if (typeof raw === "string" && raw.trim()) return raw.trim();
	if (isRecord(raw)) {
		const name =
			asString(raw.login)?.trim() ||
			asString(raw.name)?.trim() ||
			asString(raw.username)?.trim();
		if (name) return name;
	}
	fail("GitHub change is missing an author.");
}

export function defaultGitHubDeps(
	env: Record<string, string | undefined> = process.env,
): GitHubDeps {
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
		githubRequest: async (request) => {
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
					throw new GitHubHttpError("GitHub authentication failed.", response.status);
				}
				if (response.status === 404) {
					throw new GitHubHttpError(
						"GitHub did not find that pull request or issue.",
						response.status,
					);
				}
				throw new GitHubHttpError(
					`GitHub request failed (HTTP ${response.status}).`,
					response.status,
				);
			}
			if (!text.trim()) return null;
			try {
				return JSON.parse(text) as unknown;
			} catch {
				fail("GitHub returned an invalid JSON response.");
			}
		},
	};
}
