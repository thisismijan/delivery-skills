import { existsSync } from "node:fs";
import { join } from "node:path";

export const PROTOCOL_VERSION = 1;
export const PROVIDER_ID = "gitlab";
export const PER_PAGE = 100;
export const MAX_PAGES = 50;

export interface GitLabTarget {
	host: string;
	project: string;
}

export interface GitLabRequest {
	method: "GET" | "POST" | "PUT";
	url: string;
	headers: Record<string, string>;
	body?: unknown;
	allowedStatuses?: number[];
}

export interface GitLabHostDeps {
	env: Record<string, string | undefined>;
	gitRemoteUrl: (repositoryRoot: string) => Promise<string | null>;
	readFile: (path: string) => Promise<string>;
	fileExists: (path: string) => boolean;
	gitlabRequest: (request: GitLabRequest) => Promise<unknown>;
	cwd?: () => string;
	perPage?: number;
	maxPages?: number;
}

export type GitLabForgeDeps = GitLabHostDeps;

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

export function targetFromHostProject(
	host: string,
	projectPath: string,
): GitLabTarget | null {
	const project = projectPath.replace(/^\/+/, "").replace(/\/+$/, "");
	if (!project || project.includes("..")) return null;
	return { host: host.replace(/\/+$/, ""), project };
}

export async function resolveGitLabToken(
	deps: GitLabHostDeps,
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
	deps: GitLabHostDeps,
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

export function apiUrl(target: GitLabTarget, resource: string): string {
	return `${target.host}/api/v4/projects/${encodeURIComponent(target.project)}${resource}`;
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
		"PRIVATE-TOKEN": token,
		Accept: "application/json",
		...(jsonBody ? { "Content-Type": "application/json" } : {}),
	};
}

export async function gitlabCall(
	deps: GitLabHostDeps,
	token: string,
	method: GitLabRequest["method"],
	url: string,
	body?: unknown,
	allowedStatuses?: number[],
): Promise<unknown> {
	if (url.includes(token))
		fail("Refusing to send a GitLab URL that embeds a credential.", token);
	const request: GitLabRequest = {
		method,
		url,
		headers: requestHeaders(token, body !== undefined),
		...(body !== undefined ? { body } : {}),
		...(allowedStatuses ? { allowedStatuses } : {}),
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

export async function gitlabGet(
	deps: GitLabHostDeps,
	token: string,
	url: string,
): Promise<unknown> {
	return gitlabCall(deps, token, "GET", url);
}

export async function gitlabPaged(
	deps: GitLabHostDeps,
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

export function defaultGitLabHostDeps(
	env: Record<string, string | undefined> = process.env,
	options: { notFoundMessage?: string } = {},
): GitLabHostDeps {
	const notFoundMessage =
		options.notFoundMessage ?? "GitLab did not find that resource.";
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
			if (!response.ok && !request.allowedStatuses?.includes(response.status)) {
				if (response.status === 401 || response.status === 403) {
					fail("GitLab authentication failed.");
				}
				if (response.status === 404) {
					fail(notFoundMessage);
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
