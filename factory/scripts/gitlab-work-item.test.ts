import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitLabRequest } from "../../providers/gitlab/gitlab-host";
import {
	type GitLabWorkItemDeps,
	gitlabIssueIidFromRef,
	handleGitLabWorkItemCli,
	runGitLabWorkItem,
} from "../../providers/gitlab/gitlab-work-item";
import { WorkItem } from "./work-item-provider";

const fixtures = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"gitlab",
	"fixtures",
);
const TOKEN = "glpat-fixture-token-never-leak";

function loadFixture(name: string): unknown {
	return JSON.parse(readFileSync(join(fixtures, name), "utf8")) as unknown;
}

function envelope(
	input: Record<string, unknown>,
	extra: Record<string, unknown> = {},
) {
	return {
		version: 1,
		provider: "gitlab",
		repositoryRoot: "/tmp/app",
		...extra,
		input,
	};
}

function pageOf(url: string): number {
	return Number(new URL(url).searchParams.get("page") || "1");
}

function paged(items: unknown[], url: string, perPage: number): unknown[] {
	const page = pageOf(url);
	return items.slice((page - 1) * perPage, page * perPage);
}

function resource(url: string): string {
	const marker = "/issues";
	const index = url.indexOf(marker);
	return index >= 0 ? url.slice(index) : url;
}

function recordingDeps(
	handler: (request: GitLabRequest) => unknown,
	perPage = 1,
): {
	deps: GitLabWorkItemDeps;
	requests: GitLabRequest[];
} {
	const requests: GitLabRequest[] = [];
	return {
		requests,
		deps: {
			env: { GITLAB_TOKEN: TOKEN },
			gitRemoteUrl: async () =>
				"https://oauth2:glpat-fixture-token-never-leak@gitlab.example/acme/app.git",
			readFile: async () => {
				throw new Error(
					"token file should not be read when GITLAB_TOKEN is set",
				);
			},
			fileExists: () => false,
			perPage,
			gitlabRequest: async (request) => {
				requests.push(request);
				expect(request.url).not.toContain(TOKEN);
				expect(request.headers["PRIVATE-TOKEN"]).toBe(TOKEN);
				return handler(request);
			},
		},
	};
}

function issueGraphHandler(): (request: GitLabRequest) => unknown {
	const issues = [
		loadFixture("issue.json"),
		loadFixture("issue-secondary.json"),
	];
	const links = loadFixture("issue-links.json") as unknown[];
	const notes = [
		...(loadFixture("issue-notes-page-1.json") as unknown[]),
		...(loadFixture("issue-notes-page-2.json") as unknown[]),
	];
	return (request) => {
		const path = resource(request.url);
		if (path.startsWith("/issues?") && path.includes("state=all")) {
			return paged(issues, request.url, 1);
		}
		if (path === "/issues/12" || path.startsWith("/issues/12?")) {
			return loadFixture("issue.json");
		}
		if (path === "/issues/13" || path.startsWith("/issues/13?")) {
			return loadFixture("issue-secondary.json");
		}
		if (path.startsWith("/issues/12/links")) {
			return paged(links, request.url, 1);
		}
		if (path.startsWith("/issues/13/links")) {
			return [];
		}
		if (path.startsWith("/issues/12/notes")) {
			return paged(notes, request.url, 1);
		}
		if (path.startsWith("/issues/13/notes")) {
			return [];
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	};
}

test("issue IIDs accept a hash prefix while merge-request bang refs are rejected", () => {
	expect(gitlabIssueIidFromRef("12")).toBe("12");
	expect(gitlabIssueIidFromRef("#12")).toBe("12");
	expect(() => gitlabIssueIidFromRef("!12")).toThrow(/numeric/);
	expect(() => gitlabIssueIidFromRef("native:12")).toThrow(/numeric/);
});

test("read returns a schema-valid work item without product fields or secrets", async () => {
	const { deps, requests } = recordingDeps(issueGraphHandler());
	const item = await runGitLabWorkItem("read", envelope({ ref: "#12" }), deps);
	expect(WorkItem.parse(item)).toMatchObject({
		version: 1,
		provider: "gitlab",
		ref: "12",
		type: "bug",
		title: "Keep provider notes",
		body: "The selected provider stores one note per audit id.",
		blockedBy: ["9"],
		sourceAuditId: "run-1:1",
		notes: [{ auditId: "draft:ready", body: "updated" }],
	});
	expect(JSON.stringify(item)).not.toContain("iid");
	expect(JSON.stringify(item)).not.toContain(TOKEN);
	expect(requests.every((request) => request.method === "GET")).toBe(true);
});

test("list paginates issues, links, and notes", async () => {
	const { deps, requests } = recordingDeps(issueGraphHandler());
	const items = await runGitLabWorkItem("list", envelope({}), deps);
	expect(Array.isArray(items)).toBe(true);
	expect(items).toHaveLength(2);
	for (const item of items as unknown[]) {
		expect(() => WorkItem.parse(item)).not.toThrow();
	}
	expect(requests.some((request) => request.url.includes("page=2"))).toBe(true);
	expect(
		requests.filter((request) => resource(request.url).startsWith("/issues?"))
			.length,
	).toBeGreaterThanOrEqual(2);
});

test("unapproved create and caller-supplied refs never write", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	await expect(
		runGitLabWorkItem(
			"create",
			envelope({
				approved: false,
				auditId: "run-1:1",
				title: "No",
				body: "No",
			}),
			deps,
		),
	).rejects.toThrow(/approved/);
	expect(requests).toEqual([]);

	const listing = recordingDeps(issueGraphHandler());
	await expect(
		runGitLabWorkItem(
			"create",
			envelope({
				approved: true,
				auditId: "run-1:new",
				ref: "99",
				title: "Chosen id",
				body: "GitLab assigns ids.",
			}),
			listing.deps,
		),
	).rejects.toThrow(/omit ref/);
	expect(listing.requests.every((request) => request.method === "GET")).toBe(
		true,
	);
});

test("create replay returns the existing item and conflict refuses without POST", async () => {
	const { deps, requests } = recordingDeps(issueGraphHandler());
	const replayed = await runGitLabWorkItem(
		"create",
		envelope({
			approved: true,
			auditId: "run-1:1",
			type: "bug",
			title: "Keep provider notes",
			body: "The selected provider stores one note per audit id.",
			blockedBy: ["9"],
		}),
		deps,
	);
	expect(WorkItem.parse(replayed)).toMatchObject({ ref: "12" });
	expect(requests.every((request) => request.method === "GET")).toBe(true);

	await expect(
		runGitLabWorkItem(
			"create",
			envelope({
				approved: true,
				auditId: "run-1:1",
				title: "Different",
				body: "Different",
			}),
			deps,
		),
	).rejects.toThrow(/different work-item content/);
	expect(requests.every((request) => request.method === "GET")).toBe(true);
});

test("approved create posts an issue then dependency links", async () => {
	const created = loadFixture("issue-create.json");
	const { deps, requests } = recordingDeps((request) => {
		if (request.method === "POST" && resource(request.url) === "/issues") {
			expect(request.body).toMatchObject({
				title: "Keep provider notes",
			});
			const description = (request.body as { description: string }).description;
			expect(description).toContain("delivery-audit-id: run-1:new");
			expect(description).toContain("delivery-type: bug");
			expect(description).not.toContain(TOKEN);
			return created;
		}
		if (request.method === "POST" && resource(request.url).includes("/links")) {
			expect(request.body).toMatchObject({
				target_issue_iid: 9,
				link_type: "is_blocked_by",
			});
			expect(request.allowedStatuses).toContain(409);
			return loadFixture("issue-link-create.json");
		}
		return issueGraphHandler()(request);
	});
	const item = await runGitLabWorkItem(
		"create",
		envelope({
			approved: true,
			auditId: "run-1:new",
			type: "bug",
			title: "Keep provider notes",
			body: "The selected provider stores one note per audit id.",
			blockedBy: ["9"],
		}),
		deps,
	);
	expect(WorkItem.parse(item).ref).toBe("12");
	expect(
		requests.some(
			(request) =>
				request.method === "POST" && resource(request.url) === "/issues",
		),
	).toBe(true);
});

test("link adds missing blockers and refuses a shrinking set without DELETE", async () => {
	const added: GitLabRequest[] = [];
	const { deps } = recordingDeps((request) => {
		if (request.method === "POST" && resource(request.url).includes("/links")) {
			added.push(request);
			expect(request.body).toMatchObject({
				target_issue_iid: 4,
				link_type: "is_blocked_by",
			});
			return loadFixture("issue-link-create.json");
		}
		return issueGraphHandler()(request);
	});
	const item = await runGitLabWorkItem(
		"link",
		envelope({ approved: true, ref: "12", blockedBy: ["9", "4"] }),
		deps,
	);
	expect(WorkItem.parse(item)).toBeTruthy();
	expect(added).toHaveLength(1);

	const shrinking = recordingDeps(issueGraphHandler());
	await expect(
		runGitLabWorkItem(
			"link",
			envelope({ approved: true, ref: "12", blockedBy: [] }),
			shrinking.deps,
		),
	).rejects.toThrow(/cannot be removed/);
	expect(shrinking.requests.every((request) => request.method === "GET")).toBe(
		true,
	);
});

test("note replay updates the existing audit note", async () => {
	const { deps, requests } = recordingDeps((request) => {
		if (request.method === "PUT") {
			expect(resource(request.url)).toBe("/issues/12/notes/102");
			expect(request.body).toMatchObject({
				body: "<!-- delivery-audit-id: draft:ready -->\nlatest",
			});
			return loadFixture("issue-note.json");
		}
		if (request.method === "POST") {
			throw new Error("note replay must not create a second note");
		}
		return issueGraphHandler()(request);
	});
	const item = await runGitLabWorkItem(
		"note",
		envelope({
			ref: "12",
			auditId: "draft:ready",
			body: "latest",
		}),
		deps,
	);
	expect(WorkItem.parse(item).notes).toEqual([
		{ auditId: "draft:ready", body: "updated" },
	]);
	expect(requests.some((request) => request.method === "PUT")).toBe(true);
});

test("close, delete, and status stay human-owned", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	for (const operation of [
		"close",
		"delete",
		"transition",
		"status",
		"reopen",
	]) {
		await expect(
			runGitLabWorkItem(
				operation,
				envelope({ approved: true, ref: "12" }),
				deps,
			),
		).rejects.toThrow(/does not close, delete, or transition/);
	}
	expect(requests).toEqual([]);
});

test("CLI speaks operation argv plus version-1 JSON stdin", async () => {
	const { deps } = recordingDeps(issueGraphHandler());
	let stdout = "";
	let stderr = "";
	const code = await handleGitLabWorkItemCli({
		argv: ["read"],
		stdin: JSON.stringify(envelope({ ref: "12" })),
		deps,
		stdout: (text) => {
			stdout += text;
		},
		stderr: (text) => {
			stderr += text;
		},
	});
	expect(code).toBe(0);
	expect(stderr).toBe("");
	expect(JSON.parse(stdout)).toMatchObject({ provider: "gitlab", ref: "12" });
	expect(stdout).not.toContain(TOKEN);
});

test("CLI rejects missing credentials without putting secrets on argv or stderr dumps", async () => {
	const root = await mkdtemp(join(tmpdir(), "gitlab-work-item-cli-"));
	try {
		const proc = Bun.spawn(
			[
				"bun",
				join(
					import.meta.dir,
					"..",
					"..",
					"providers",
					"gitlab",
					"gitlab-work-item.ts",
				),
				"read",
			],
			{
				cwd: root,
				env: {
					PATH: process.env.PATH,
					HOME: root,
					GITLAB_TOKEN: "",
					GL_TOKEN_FILE: join(root, "missing"),
				},
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		proc.stdin.write(
			JSON.stringify({
				version: 1,
				repositoryRoot: root,
				input: { ref: "12" },
			}),
		);
		proc.stdin.end();
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(code).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toMatch(/GITLAB_TOKEN/);
		expect(stderr).not.toContain(TOKEN);
		expect(stderr).not.toMatch(/at |Trace|Error:/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("token files are used when GITLAB_TOKEN is absent", async () => {
	const root = await mkdtemp(join(tmpdir(), "gitlab-work-item-token-"));
	try {
		const tokenPath = join(root, "token");
		await writeFile(tokenPath, `${TOKEN}\n`);
		const { deps, requests } = recordingDeps(issueGraphHandler());
		deps.env = { HOME: root, GITLAB_TOKEN: "" };
		deps.fileExists = (path) => path === tokenPath;
		deps.readFile = async (path) => {
			expect(path).toBe(tokenPath);
			return `${TOKEN}\r\n`;
		};
		await runGitLabWorkItem("read", envelope({ ref: "12" }), deps);
		expect(requests[0]?.headers["PRIVATE-TOKEN"]).toBe(TOKEN);
		expect(requests[0]?.url).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
