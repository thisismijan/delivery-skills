import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubHttpError } from "../../providers/github/github-client";
import {
	type GitHubDeps,
	type GitHubRequest,
	handleGitHubTrackerCli,
	runGitHubTracker,
} from "../../providers/github/github-tracker";
import { WorkItem } from "./work-item-provider";

const fixtures = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"github",
	"fixtures",
);
const TOKEN = "github_pat_fixture-token-never-leak";

function loadFixture(name: string): unknown {
	return JSON.parse(readFileSync(join(fixtures, name), "utf8")) as unknown;
}

function envelope(
	input: Record<string, unknown>,
	extra: Record<string, unknown> = {},
) {
	return {
		version: 1,
		provider: "github",
		repositoryRoot: "/tmp/app",
		...extra,
		input,
	};
}

function recordingDeps(handler: (request: GitHubRequest) => unknown): {
	deps: GitHubDeps;
	requests: GitHubRequest[];
} {
	const requests: GitHubRequest[] = [];
	return {
		requests,
		deps: {
			env: { GH_TOKEN: TOKEN },
			gitRemoteUrl: async () => "git@github.com:acme/app.git",
			readFile: async () => {
				throw new Error("token file should not be read when GH_TOKEN is set");
			},
			fileExists: () => false,
			perPage: 100,
			githubRequest: async (request) => {
				requests.push(request);
				expect(request.url).not.toContain(TOKEN);
				expect(request.headers.Authorization).toBe(`Bearer ${TOKEN}`);
				return handler(request);
			},
		},
	};
}

function resource(url: string): string {
	const marker = "/repos/acme/app";
	const index = url.indexOf(marker);
	if (index >= 0) return url.slice(index + marker.length);
	const api = "https://api.github.com";
	return url.startsWith(api) ? url.slice(api.length) : url;
}

const CREATE_INPUT = {
	approved: true,
	auditId: "run-1:1",
	type: "bug",
	title: "Keep provider notes",
	body: "The selected provider stores one note per audit id.",
};

const NOT_FOUND = "GitHub did not find that pull request or issue.";

// Answers every lookup a placed create can make. Issue 21 is the new issue, 5 the parent.
function placementDeps(existing: unknown[] = []) {
	return recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (request.method === "GET" && path === "/issues") return existing;
		if (path === "/user") return loadFixture("current-user.json");
		if (path === "/users/grace") return loadFixture("user.json");
		if (path.startsWith("/users/")) throw new GitHubHttpError(NOT_FOUND, 404);
		if (path === "/milestones") return loadFixture("milestones.json");
		if (path === "/issues/5") return loadFixture("parent-issue.json");
		if (path === "/issues/12")
			return (loadFixture("issues.json") as unknown[])[1];
		if (path === "/issues/404") throw new GitHubHttpError(NOT_FOUND, 404);
		if (request.method === "POST" && path === "/issues") {
			return loadFixture("create-issue.json");
		}
		if (request.method === "POST" && path === "/issues/5/sub_issues") {
			return loadFixture("parent-issue.json");
		}
		if (path === "/issues/21") return loadFixture("placed-issue.json");
		if (path === "/issues/11") {
			return {
				...(loadFixture("issue.json") as Record<string, unknown>),
				parent_issue_url: "https://api.github.com/repos/acme/app/issues/5",
			};
		}
		if (path.endsWith("/dependencies/blocked_by")) return [];
		if (path.endsWith("/comments")) return [];
		throw new Error(`unexpected ${request.method} ${path}`);
	});
}

function paths(requests: GitHubRequest[]): string[] {
	return requests.map(
		(request) =>
			`${request.method} ${resource(request.url).split("?")[0] ?? ""}`,
	);
}

function createBody(requests: GitHubRequest[]): Record<string, unknown> {
	const create = requests.find(
		(request) =>
			request.method === "POST" &&
			resource(request.url).split("?")[0] === "/issues",
	);
	expect(create).toBeDefined();
	return create?.body as Record<string, unknown>;
}

test("list and read return normalized issues and skip pull requests", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues") return loadFixture("issues.json");
		if (path === "/issues/11/dependencies/blocked_by") {
			return loadFixture("blocked-by.json");
		}
		if (path === "/issues/11/comments") return loadFixture("issue-notes.json");
		if (path === "/issues/11") return loadFixture("issue.json");
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const listed = WorkItem.array().parse(
		await runGitHubTracker("list", envelope({}), deps),
	);
	expect(listed).toHaveLength(1);
	expect(listed[0]).toMatchObject({
		version: 1,
		provider: "github",
		ref: "11",
		type: "bug",
		title: "Keep provider notes",
		body: "The selected provider stores one note per audit id.",
		blockedBy: ["9"],
		sourceAuditId: "run-1:1",
		notes: [{ auditId: "draft:ready", body: "updated" }],
	});
	const read = WorkItem.parse(
		await runGitHubTracker("read", envelope({ ref: "11" }), deps),
	);
	expect(read.ref).toBe("11");
	expect(JSON.stringify(listed)).not.toContain(TOKEN);
	expect(requests.every((request) => request.method === "GET")).toBe(true);
});

test("create is idempotent for the same audit id and refuses conflicting replay", async () => {
	const createdCalls: GitHubRequest[] = [];
	const create = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (request.method === "GET" && path === "/issues") return [];
		if (path === "/user") return loadFixture("current-user.json");
		if (request.method === "POST" && path === "/issues") {
			createdCalls.push(request);
			expect(request.body).toMatchObject({
				title: "Keep provider notes",
				assignees: ["ada"],
			});
			const body = (request.body as { body: string }).body;
			expect(body).toContain("<!-- delivery-source-audit-id: run-1:1 -->");
			expect(body).toContain("<!-- delivery-work-item-type: bug -->");
			return loadFixture("create-issue.json");
		}
		if (path === "/issues/21/dependencies/blocked_by") return [];
		if (path === "/issues/21/comments") return [];
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const created = WorkItem.parse(
		await runGitHubTracker(
			"create",
			envelope({
				approved: true,
				auditId: "run-1:1",
				type: "bug",
				title: "Keep provider notes",
				body: "The selected provider stores one note per audit id.",
			}),
			create.deps,
		),
	);
	expect(created.ref).toBe("21");
	expect(created.sourceAuditId).toBe("run-1:1");
	expect(createdCalls).toHaveLength(1);

	const replay = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues") return [loadFixture("issue.json")];
		if (path.startsWith("/issues/11/dependencies/blocked_by")) return [];
		if (path === "/issues/11/comments") return [];
		throw new Error(`unexpected mutation ${request.method} ${path}`);
	});
	const repeated = WorkItem.parse(
		await runGitHubTracker(
			"create",
			envelope({
				approved: true,
				auditId: "run-1:1",
				type: "bug",
				title: "Keep provider notes",
				body: "The selected provider stores one note per audit id.",
			}),
			replay.deps,
		),
	);
	expect(repeated.ref).toBe("11");
	expect(replay.requests.some((request) => request.method !== "GET")).toBe(
		false,
	);

	const conflict = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues") return [loadFixture("conflict-issue.json")];
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	await expect(
		runGitHubTracker(
			"create",
			envelope({
				approved: true,
				auditId: "run-1:1",
				type: "bug",
				title: "Keep provider notes",
				body: "The selected provider stores one note per audit id.",
			}),
			conflict.deps,
		),
	).rejects.toThrow(/different work-item content/);
	expect(conflict.requests.some((request) => request.method !== "GET")).toBe(
		false,
	);
});

test("link adds missing dependencies and refuses deletions or status changes", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues/11/dependencies/blocked_by") {
			return request.method === "GET" ? [] : { ok: true };
		}
		if (path === "/issues/9") return loadFixture("blocking-issue.json");
		if (path === "/issues/11") return loadFixture("issue.json");
		if (path === "/issues/11/comments") return loadFixture("issue-notes.json");
		if (request.method === "POST" && path.endsWith("/blocked_by")) {
			expect(request.body).toEqual({ issue_id: 8009 });
			return { ok: true };
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const linked = WorkItem.parse(
		await runGitHubTracker(
			"link",
			envelope({ approved: true, ref: "11", blockedBy: ["9"] }),
			deps,
		),
	);
	expect(linked.ref).toBe("11");
	expect(requests.some((request) => request.method === "POST")).toBe(true);

	const existing = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues/11/dependencies/blocked_by") {
			return loadFixture("blocked-by.json");
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	await expect(
		runGitHubTracker(
			"link",
			envelope({ approved: true, ref: "11", blockedBy: [] }),
			existing.deps,
		),
	).rejects.toThrow(/does not delete dependency links/);
	expect(existing.requests.some((request) => request.method !== "GET")).toBe(
		false,
	);

	await expect(
		runGitHubTracker("close", envelope({ approved: true, ref: "11" }), deps),
	).rejects.toThrow(/does not change status, delete issues/);
	await expect(
		runGitHubTracker("delete", envelope({ approved: true, ref: "11" }), deps),
	).rejects.toThrow(/does not change status, delete issues/);
});

test("note updates one audit comment in place", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues/11/comments" && request.method === "GET") {
			return loadFixture("issue-notes.json");
		}
		if (request.method === "PATCH" && path === "/issues/comments/901") {
			expect(request.body).toEqual({
				body: "<!-- delivery-note-audit-id: draft:ready -->\nfinal",
			});
			return { id: 901 };
		}
		if (path === "/issues/11") return loadFixture("issue.json");
		if (path === "/issues/11/dependencies/blocked_by") {
			return loadFixture("blocked-by.json");
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const noted = WorkItem.parse(
		await runGitHubTracker(
			"note",
			envelope({ ref: "11", auditId: "draft:ready", body: "final" }),
			deps,
		),
	);
	expect(noted.notes).toEqual([{ auditId: "draft:ready", body: "updated" }]);
	expect(requests.some((request) => request.method === "PATCH")).toBe(true);
	expect(requests.every((request) => request.method !== "PUT")).toBe(true);
});

test("unapproved create never reaches GitHub", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	await expect(
		runGitHubTracker(
			"create",
			envelope({
				auditId: "run-1:1",
				title: "No",
				body: "No",
			}),
			deps,
		),
	).rejects.toThrow(/approved/);
	expect(requests).toEqual([]);
});

test("CLI speaks operation argv plus version-1 JSON stdin", async () => {
	const { deps } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues/11") return loadFixture("issue.json");
		if (path === "/issues/11/comments") return [];
		if (path === "/issues/11/dependencies/blocked_by") return [];
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	let stdout = "";
	let stderr = "";
	const code = await handleGitHubTrackerCli({
		argv: ["read"],
		stdin: JSON.stringify(envelope({ ref: "11" })),
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
	expect(WorkItem.parse(JSON.parse(stdout)).ref).toBe("11");
	expect(stdout).not.toContain(TOKEN);
});

test("shared client uses GH_TOKEN and origin without argv secrets", async () => {
	const root = await mkdtemp(join(tmpdir(), "github-tracker-cli-"));
	try {
		const tokenPath = join(root, "github-token");
		await writeFile(tokenPath, `${TOKEN}\n`);
		const { deps, requests } = recordingDeps((request) => {
			const path = resource(request.url).split("?")[0] ?? "";
			if (path === "/issues/11") return loadFixture("issue.json");
			if (path === "/issues/11/comments") return [];
			if (path === "/issues/11/dependencies/blocked_by") return [];
			throw new Error(`unexpected ${request.method} ${path}`);
		});
		deps.env = { GH_TOKEN_FILE: tokenPath, GITHUB_TOKEN: "", GH_TOKEN: "" };
		deps.fileExists = (path) => path === tokenPath;
		deps.readFile = async (path) => {
			expect(path).toBe(tokenPath);
			return TOKEN;
		};
		await runGitHubTracker("read", envelope({ ref: "#11" }), deps);
		expect(requests[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
		expect(requests[0]?.url).toContain("/issues/11");
		expect(requests[0]?.url).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("create assigns the credential's user when the setting is unset or me", async () => {
	for (const settings of [undefined, { assignee: "me" }]) {
		const { deps, requests } = placementDeps();
		const created = WorkItem.parse(
			await runGitHubTracker(
				"create",
				envelope(CREATE_INPUT, settings ? { settings } : {}),
				deps,
			),
		);
		expect(createBody(requests).assignees).toEqual(["ada"]);
		expect(createBody(requests)).not.toHaveProperty("milestone");
		expect(paths(requests).indexOf("GET /user")).toBeLessThan(
			paths(requests).indexOf("POST /issues"),
		);
		expect(created.ref).toBe("21");
	}
});

test("create leaves the issue unassigned when the assignee setting is none", async () => {
	const { deps, requests } = placementDeps();
	await runGitHubTracker(
		"create",
		envelope(CREATE_INPUT, { settings: { assignee: "none" } }),
		deps,
	);
	expect(createBody(requests)).not.toHaveProperty("assignees");
	expect(paths(requests)).not.toContain("GET /user");
});

test("create assigns an explicit login after GitHub confirms it", async () => {
	const { deps, requests } = placementDeps();
	await runGitHubTracker(
		"create",
		envelope(CREATE_INPUT, { settings: { assignee: "grace" } }),
		deps,
	);
	expect(createBody(requests).assignees).toEqual(["Grace"]);
	expect(paths(requests)).not.toContain("GET /user");
	expect(paths(requests).indexOf("GET /users/grace")).toBeLessThan(
		paths(requests).indexOf("POST /issues"),
	);
});

test("an unknown or malformed assignee fails before any issue is created", async () => {
	const unknown = placementDeps();
	await expect(
		runGitHubTracker(
			"create",
			envelope(CREATE_INPUT, { settings: { assignee: "nobody" } }),
			unknown.deps,
		),
	).rejects.toThrow("GitHub has no user with the login 'nobody'.");
	expect(paths(unknown.requests)).toContain("GET /users/nobody");
	expect(unknown.requests.some((request) => request.method !== "GET")).toBe(
		false,
	);

	const malformed = placementDeps();
	await expect(
		runGitHubTracker(
			"create",
			envelope(CREATE_INPUT, { settings: { assignee: "../orgs/acme" } }),
			malformed.deps,
		),
	).rejects.toThrow("GitHub assignee '../orgs/acme' is not a valid login.");
	expect(malformed.requests.some((request) => request.method !== "GET")).toBe(
		false,
	);
});

test("create plans the issue into the open milestone with the exact title", async () => {
	const { deps, requests } = placementDeps();
	await runGitHubTracker(
		"create",
		envelope(CREATE_INPUT, {
			settings: { assignee: "none", milestone: "Sprint 9" },
		}),
		deps,
	);
	expect(createBody(requests).milestone).toBe(3);
	const listing = requests.find((request) =>
		request.url.includes("/milestones"),
	);
	expect(new URL(listing?.url ?? "").searchParams.get("state")).toBe("open");
	expect(paths(requests).indexOf("GET /milestones")).toBeLessThan(
		paths(requests).indexOf("POST /issues"),
	);

	const none = placementDeps();
	await runGitHubTracker(
		"create",
		envelope(CREATE_INPUT, { settings: { milestone: "none" } }),
		none.deps,
	);
	expect(createBody(none.requests)).not.toHaveProperty("milestone");
	expect(paths(none.requests)).not.toContain("GET /milestones");
});

test("an unknown milestone fails before any issue is created", async () => {
	const { deps, requests } = placementDeps();
	await expect(
		runGitHubTracker(
			"create",
			envelope(CREATE_INPUT, { settings: { milestone: "Sprint 1" } }),
			deps,
		),
	).rejects.toThrow("GitHub has no open milestone titled 'Sprint 1'.");
	expect(requests.some((request) => request.method !== "GET")).toBe(false);
});

test("replay returns the existing issue without placing it again", async () => {
	const { deps, requests } = placementDeps([loadFixture("placed-issue.json")]);
	const repeated = WorkItem.parse(
		await runGitHubTracker(
			"create",
			envelope(
				{ ...CREATE_INPUT, parent: "#5" },
				{ settings: { assignee: "grace", milestone: "Sprint 8" } },
			),
			deps,
		),
	);
	expect(repeated).toMatchObject({
		ref: "21",
		assignee: "ada",
		sprint: "Sprint 9",
		parent: "5",
	});
	expect(requests.some((request) => request.method !== "GET")).toBe(false);
	expect(
		paths(requests).filter(
			(path) =>
				path === "GET /user" ||
				path.startsWith("GET /users/") ||
				path === "GET /milestones",
		),
	).toEqual([]);
});

test("normalize reports the first assignee, the milestone title and the parent", async () => {
	const { deps } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (path === "/issues") return loadFixture("placed-issues.json");
		if (path.endsWith("/dependencies/blocked_by")) return [];
		if (path.endsWith("/comments")) return [];
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const listed = WorkItem.array().parse(
		await runGitHubTracker("list", envelope({}), deps),
	);
	expect(listed[0]).toMatchObject({
		ref: "21",
		assignee: "ada",
		sprint: "Sprint 9",
		parent: "5",
	});
	expect(listed[1]).toMatchObject({
		ref: "22",
		assignee: "grace",
		parent: "acme/platform#40",
	});
	expect(listed[1]).not.toHaveProperty("sprint");
	expect(listed[2]?.ref).toBe("23");
	for (const key of ["assignee", "sprint", "parent"]) {
		expect(listed[2]).not.toHaveProperty(key);
	}
});

test("create attaches the issue under a parent in this repository and reports it", async () => {
	const { deps, requests } = placementDeps();
	const created = WorkItem.parse(
		await runGitHubTracker(
			"create",
			envelope({ ...CREATE_INPUT, parent: "#5" }),
			deps,
		),
	);
	expect(created).toMatchObject({
		ref: "21",
		assignee: "ada",
		sprint: "Sprint 9",
		parent: "5",
	});
	const order = paths(requests);
	expect(order.indexOf("GET /issues/5")).toBeLessThan(
		order.indexOf("POST /issues"),
	);
	expect(order.indexOf("POST /issues")).toBeLessThan(
		order.indexOf("POST /issues/5/sub_issues"),
	);
	const attach = requests.find((request) =>
		request.url.endsWith("/issues/5/sub_issues"),
	);
	expect(attach?.body).toEqual({ sub_issue_id: 8010 });
	expect(createBody(requests)).not.toHaveProperty("parent");
});

test("a parent outside this repository, missing, or a pull request fails before create", async () => {
	for (const parent of [
		"acme/other#5",
		"PROJ-5",
		"https://github.com/acme/app/issues/5",
	]) {
		const { deps, requests } = placementDeps();
		await expect(
			runGitHubTracker("create", envelope({ ...CREATE_INPUT, parent }), deps),
		).rejects.toThrow(
			"GitHub parent must be an issue number in this repository, such as 12 or #12.",
		);
		expect(requests).toEqual([]);
	}
	const missing = placementDeps();
	await expect(
		runGitHubTracker(
			"create",
			envelope({ ...CREATE_INPUT, parent: "404" }),
			missing.deps,
		),
	).rejects.toThrow(
		"GitHub parent issue #404 does not exist in this repository.",
	);
	expect(missing.requests.some((request) => request.method !== "GET")).toBe(
		false,
	);
	const pull = placementDeps();
	await expect(
		runGitHubTracker(
			"create",
			envelope({ ...CREATE_INPUT, parent: "12" }),
			pull.deps,
		),
	).rejects.toThrow("GitHub parent #12 is a pull request, not an issue.");
	expect(pull.requests.some((request) => request.method !== "GET")).toBe(false);
});

test("replay attaches a missing parent and nothing else", async () => {
	const { deps, requests } = placementDeps([loadFixture("issue.json")]);
	const repeated = WorkItem.parse(
		await runGitHubTracker(
			"create",
			envelope(
				{ ...CREATE_INPUT, parent: "5" },
				{ settings: { milestone: "Sprint 9" } },
			),
			deps,
		),
	);
	expect(repeated).toMatchObject({ ref: "11", parent: "5" });
	expect(
		requests
			.filter((request) => request.method !== "GET")
			.map((request) => [resource(request.url), request.body]),
	).toEqual([["/issues/5/sub_issues", { sub_issue_id: 8001 }]]);
	expect(paths(requests)).not.toContain("GET /user");
	expect(paths(requests)).not.toContain("GET /milestones");
});

test("settings must be text", async () => {
	const { deps, requests } = placementDeps();
	await expect(
		runGitHubTracker(
			"create",
			envelope(CREATE_INPUT, { settings: { assignee: 7 } }),
			deps,
		),
	).rejects.toThrow("GitHub adapter setting assignee must be text.");
	expect(requests).toEqual([]);
});
