import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	return index >= 0 ? url.slice(index + marker.length) : url;
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
		if (request.method === "POST" && path === "/issues") {
			createdCalls.push(request);
			expect(request.body).toMatchObject({
				title: "Keep provider notes",
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
