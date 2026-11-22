import { afterAll, expect, test } from "bun:test";
import {
	defaultGitHubDeps,
	githubNotFoundMessage,
} from "../../providers/github/github-client";
import {
	defaultGitLabHostDeps,
	gitlabNotFoundMessage,
} from "../../providers/gitlab/gitlab-host";
import {
	defaultJiraTrackerDeps,
	jiraNotFoundMessage,
} from "../../providers/jira/jira-tracker";

const server = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	fetch: () => new Response("{}", { status: 404 }),
});
afterAll(() => server.stop(true));
const base = `http://127.0.0.1:${server.port}`;

async function failure(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("expected the request to fail");
}

test("a GitLab 404 names the request and the token, and says it may be missing access", async () => {
	const url = `${base}/api/v4/projects/acme%2Fapp/merge_requests?source_branch=feature`;
	const message = await failure(() =>
		defaultGitLabHostDeps({ GITLAB_TOKEN: "secret-gl" }).gitlabRequest({
			method: "GET",
			url,
			headers: {},
		}),
	);
	expect(message).toBe(
		"GitLab answered HTTP 404 for GET /projects/acme/app/merge_requests. Either it does not exist, or the token from GITLAB_TOKEN cannot see that project: GitLab answers 404, not 403, when a token cannot read a private project.",
	);
	expect(message).not.toContain("secret-gl");
	expect(message).not.toContain("merge request.");
	expect(
		gitlabNotFoundMessage("POST", url, { GL_TOKEN_FILE: "/run/token" }),
	).toContain(
		"POST /projects/acme/app/merge_requests. Either it does not exist, or the token from the file in GL_TOKEN_FILE",
	);
	expect(gitlabNotFoundMessage("GET", url, {})).toContain(
		"the token from ~/token",
	);
});

test("a GitHub 404 names the request and the token, and keeps the not-found status", async () => {
	const url = `${base}/repos/acme/app/pulls?head=acme:feature`;
	const deps = defaultGitHubDeps({ GH_TOKEN: "secret-gh" });
	let status: unknown;
	const message = await failure(async () => {
		try {
			await deps.githubRequest({ method: "GET", url, headers: {} });
		} catch (error) {
			status = (error as { status?: number }).status;
			throw error;
		}
	});
	expect(status).toBe(404);
	expect(message).toBe(githubNotFoundMessage("GET", url, { GH_TOKEN: "x" }));
	expect(message).toContain(
		"GET /repos/acme/app/pulls. Either it does not exist, or the token from GH_TOKEN",
	);
	expect(message).toContain("HTTP 404");
	expect(message).not.toContain("secret-gh");
});

test("a Jira 404 names the request and says the account may lack browse permission", async () => {
	const url = `${base}/rest/api/3/issue/DEL-7?fields=summary`;
	const message = await failure(() =>
		defaultJiraTrackerDeps({}).jiraRequest({ method: "GET", url, headers: {} }),
	);
	expect(message).toBe(jiraNotFoundMessage("GET", url));
	expect(message).toContain(
		"Jira answered HTTP 404 for GET /rest/api/3/issue/DEL-7. Either it does not exist, or the Jira account these credentials belong to cannot browse it",
	);
});
