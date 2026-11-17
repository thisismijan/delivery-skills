import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type GitHubDeps,
	type GitHubRequest,
	addedLineAnchors,
	aggregateCheckRuns,
	githubNumberFromRef,
	handleGitHubForgeCli,
	parseGitHubOrigin,
	runGitHubForge,
} from "../../providers/github/github-forge";
import { parseForgeOperationResult } from "./forge-provider";

const fixtures = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"github",
	"fixtures",
);
const TOKEN = "github_pat_fixture-token-never-leak";
const HEAD = "aaa111bbb222ccc333ddd444eee555fff666aaa1";

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
			env: { GITHUB_TOKEN: TOKEN },
			gitRemoteUrl: async () =>
				"https://x-access-token:github_pat_fixture-token-never-leak@github.com/acme/app.git",
			readFile: async () => {
				throw new Error(
					"token file should not be read when GITHUB_TOKEN is set",
				);
			},
			fileExists: () => false,
			perPage: 2,
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

test("origin parsing strips credentials and keeps owner/repo", () => {
	expect(
		parseGitHubOrigin(
			"https://x-access-token:github_pat_fixture-token-never-leak@github.com/acme/app.git",
		),
	).toEqual({
		host: "https://github.com",
		apiBase: "https://api.github.com",
		repository: "acme/app",
		owner: "acme",
	});
	expect(parseGitHubOrigin("git@github.com:acme/app.git")).toEqual({
		host: "https://github.com",
		apiBase: "https://api.github.com",
		repository: "acme/app",
		owner: "acme",
	});
	expect(parseGitHubOrigin("ssh://git@github.example/acme/app.git")).toEqual({
		host: "https://github.example",
		apiBase: "https://github.example/api/v3",
		repository: "acme/app",
		owner: "acme",
	});
	expect(
		JSON.stringify(
			parseGitHubOrigin(
				"https://x-access-token:github_pat_fixture-token-never-leak@github.com/acme/app.git",
			),
		),
	).not.toContain(TOKEN);
});

test("GitHub numbers are accepted while opaque core refs are rejected at the API boundary", () => {
	expect(githubNumberFromRef("42")).toBe("42");
	expect(githubNumberFromRef("#42")).toBe("42");
	expect(() => githubNumberFromRef("native:42")).toThrow(/numeric/);
	expect(() => githubNumberFromRef("abc")).toThrow(/numeric/);
});

test("added-line anchors skip file headers and count from hunk starts", () => {
	const files = loadFixture("files.json") as Array<{
		filename: string;
		patch: string;
	}>;
	expect(
		addedLineAnchors(
			files.map((file) => ({ new_path: file.filename, diff: file.patch })),
		),
	).toEqual([
		{ path: "src/example.ts", line: 2 },
		{ path: "docs/README.md", line: 2 },
	]);
});

test("check-run aggregation fails on any failure and waits for any running job", () => {
	const success = {
		head_sha: HEAD,
		status: "completed",
		conclusion: "success",
		html_url: "https://github.com/acme/app/actions/runs/1",
	};
	expect(aggregateCheckRuns([success], HEAD).status).toBe("success");
	expect(
		aggregateCheckRuns(
			[success, { ...success, status: "in_progress", conclusion: null }],
			HEAD,
		).status,
	).toBe("pending");
	expect(
		aggregateCheckRuns([success, { ...success, conclusion: "failure" }], HEAD)
			.status,
	).toBe("failure");
	expect(() =>
		aggregateCheckRuns([{ ...success, head_sha: "other" }], HEAD),
	).toThrow(/different revision/);
});

test("explicit repository overrides win over origin", async () => {
	const { deps, requests } = recordingDeps((request) => {
		if (request.url.includes("page=1")) return loadFixture("find.json");
		return [];
	});
	deps.env = {
		GITHUB_TOKEN: TOKEN,
		GH_HOST: "github.example",
		GH_REPO: "other/app",
	};
	deps.gitRemoteUrl = async () => "https://github.com/acme/app.git";
	await runGitHubForge(
		"find",
		envelope({ sourceBranch: "cursor/generic-forge-provider-327b" }),
		deps,
	);
	expect(requests[0]?.url).toContain(
		"https://github.example/api/v3/repos/other/app/pulls",
	);
	expect(requests[0]?.url).toContain(
		"head=other%3Acursor%2Fgeneric-forge-provider-327b",
	);
});

test("find returns normalized summaries for a source branch without product fields", async () => {
	const { deps, requests } = recordingDeps((request) => {
		expect(resource(request.url)).toMatch(/^\/pulls\?/);
		expect(request.url).toContain(
			"head=acme%3Acursor%2Fgeneric-forge-provider-327b",
		);
		if (request.url.includes("page=1")) return loadFixture("find.json");
		return [];
	});
	const result = (await runGitHubForge(
		"find",
		envelope({ sourceBranch: "cursor/generic-forge-provider-327b" }),
		deps,
	)) as { changes: Array<Record<string, unknown>> };
	expect(result.changes).toHaveLength(2);
	expect(() => parseForgeOperationResult("find", result)).not.toThrow();
	expect(result.changes[0]).toMatchObject({
		version: 1,
		provider: "github",
		ref: "42",
		state: "open",
		draft: true,
		branches: {
			source: "cursor/generic-forge-provider-327b",
			target: "main",
		},
		title: "Keep review evidence complete",
	});
	expect(JSON.stringify(result)).not.toContain('"number"');
	expect(JSON.stringify(result)).not.toContain(TOKEN);
	expect(requests.every((request) => request.method === "GET")).toBe(true);
});

test("read binds revisions and represents missing pipeline evidence explicitly", async () => {
	const withStatus = recordingDeps((request) => {
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		if (request.url.includes("/check-runs"))
			return loadFixture("empty-check-runs.json");
		return loadFixture("pull.json");
	});
	const opened = (await runGitHubForge(
		"read",
		envelope({ ref: "42" }),
		withStatus.deps,
	)) as Record<string, unknown>;
	expect(opened).toMatchObject({
		provider: "github",
		ref: "42",
		revisions: { head: HEAD },
		pipeline: {
			available: true,
			status: "success",
			revision: HEAD,
			current: true,
			url: "https://github.com/acme/app/actions/runs/88",
		},
		mergeability: { available: true, conflicts: false, status: "clean" },
	});
	expect(() => parseForgeOperationResult("read", opened)).not.toThrow();

	const without = recordingDeps((request) => {
		if (request.url.includes("/status"))
			return loadFixture("empty-status.json");
		if (request.url.includes("/check-runs"))
			return loadFixture("empty-check-runs.json");
		return loadFixture("pull-no-status.json");
	});
	const bare = (await runGitHubForge(
		"read",
		envelope({ ref: "7" }),
		without.deps,
	)) as Record<string, unknown>;
	expect(bare.pipeline).toEqual({ available: false });
	expect(bare.author).toBe("ada");
	expect(bare.mergeability).toEqual({ available: false });
});

test("pipeline reads status for the exact requested revision", async () => {
	const { deps, requests } = recordingDeps((request) => {
		if (request.url.includes("/status")) {
			return loadFixture("combined-status.json");
		}
		return loadFixture("empty-check-runs.json");
	});
	const result = (await runGitHubForge(
		"pipeline",
		envelope({ revision: HEAD }),
		deps,
	)) as Record<string, unknown>;
	expect(result).toMatchObject({
		version: 1,
		provider: "github",
		revision: HEAD,
		pipeline: {
			available: true,
			status: "success",
			revision: HEAD,
		},
	});
	expect(() => parseForgeOperationResult("pipeline", result)).not.toThrow();
	expect(requests[0]?.url).toContain(
		`/commits/${encodeURIComponent(HEAD)}/status`,
	);
});

test("files, diff, commits, discussions, and anchors bind the requested change and head revision", async () => {
	const { deps } = recordingDeps((request) => {
		const path = resource(request.url);
		if (path.startsWith("/commits/") && path.includes("/status")) {
			return loadFixture("combined-status.json");
		}
		if (path.startsWith("/commits/") && path.includes("/check-runs")) {
			return loadFixture("empty-check-runs.json");
		}
		if (path === "/pulls/42" || path.startsWith("/pulls/42?")) {
			return loadFixture("pull.json");
		}
		if (path.startsWith("/pulls/42/files")) {
			return request.url.includes("page=1") ? loadFixture("files.json") : [];
		}
		if (
			path.startsWith("/pulls/42/commits") &&
			request.url.includes("page=1")
		) {
			return loadFixture("commits-page-1.json");
		}
		if (
			path.startsWith("/pulls/42/commits") &&
			request.url.includes("page=2")
		) {
			return loadFixture("commits-page-2.json");
		}
		if (path.startsWith("/issues/42/comments")) {
			return loadFixture("issue-comments.json");
		}
		if (
			path.startsWith("/pulls/42/comments") &&
			request.url.includes("page=1")
		) {
			return loadFixture("review-comments-page-1.json");
		}
		if (
			path.startsWith("/pulls/42/comments") &&
			request.url.includes("page=2")
		) {
			return loadFixture("review-comments-page-2.json");
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});

	for (const operation of [
		"files",
		"diff",
		"commits",
		"discussions",
		"anchors",
	] as const) {
		const result = (await runGitHubForge(
			operation,
			envelope({ ref: "#42" }),
			deps,
		)) as Record<string, unknown>;
		expect(result).toMatchObject({
			version: 1,
			provider: "github",
			ref: "#42",
			headRevision: HEAD,
		});
		expect(() => parseForgeOperationResult(operation, result)).not.toThrow();
	}

	const files = (await runGitHubForge(
		"files",
		envelope({ ref: "42" }),
		deps,
	)) as { files: Array<Record<string, unknown>> };
	expect(files.files).toEqual([
		{
			path: "src/example.ts",
			status: "modified",
			additions: 1,
			deletions: 1,
		},
		{
			path: "docs/README.md",
			previousPath: "README.md",
			status: "renamed",
			additions: 1,
			deletions: 0,
		},
	]);

	const diff = (await runGitHubForge(
		"diff",
		envelope({ ref: "42" }),
		deps,
	)) as { unifiedDiff: string; complete: boolean };
	expect(diff.complete).toBe(true);
	expect(diff.unifiedDiff).toContain("=== src/example.ts ===");
	expect(diff.unifiedDiff).toContain("+added");

	const commits = (await runGitHubForge(
		"commits",
		envelope({ ref: "42" }),
		deps,
	)) as { commits: Array<{ title: string; sha: string }> };
	expect(commits.commits.map((commit) => commit.title)).toEqual([
		"Oldest commit",
		"Middle commit",
		"Newest commit",
	]);

	const discussions = (await runGitHubForge(
		"discussions",
		envelope({ ref: "42" }),
		deps,
	)) as { discussions: Array<{ id: string; notes: Array<{ id: string }> }> };
	expect(discussions.discussions.map((thread) => thread.id)).toEqual([
		"issue-comment:201",
		"101",
		"102",
	]);
	expect(discussions.discussions[1]?.notes.map((note) => note.id)).toEqual([
		"101",
		"103",
	]);
	expect(discussions.discussions[1]?.notes[0]).toMatchObject({
		id: "101",
		anchor: { path: "src/example.ts", line: 2, side: "new" },
	});

	const anchors = (await runGitHubForge(
		"anchors",
		envelope({ ref: "42" }),
		deps,
	)) as { anchors: Array<{ path: string; line: number }> };
	expect(anchors.anchors).toEqual([
		{ path: "src/example.ts", line: 2 },
		{ path: "docs/README.md", line: 2 },
	]);
});

test("diff overflow is refused instead of returning a partial review", async () => {
	const missingPatch = recordingDeps((request) => {
		if (resource(request.url).startsWith("/pulls/42/files")) {
			return loadFixture("files-truncated.json");
		}
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		return loadFixture("pull.json");
	});
	await expect(
		runGitHubForge("diff", envelope({ ref: "42" }), missingPatch.deps),
	).rejects.toThrow(/truncated/);
	await expect(
		runGitHubForge("files", envelope({ ref: "42" }), missingPatch.deps),
	).rejects.toThrow(/truncated/);
	expect(
		missingPatch.requests.some((request) => request.method !== "GET"),
	).toBe(false);

	const shortList = recordingDeps((request) => {
		if (resource(request.url).startsWith("/pulls/42/files")) {
			return [loadFixture("files.json")].flat().slice(0, 1);
		}
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		return loadFixture("pull.json");
	});
	await expect(
		runGitHubForge("diff", envelope({ ref: "42" }), shortList.deps),
	).rejects.toThrow(/truncated/);
});

test("unapproved mutations never reach GitHub", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	for (const [operation, input] of [
		["create", { title: "x", sourceBranch: "a", targetBranch: "main" }],
		["set-draft", { ref: "42", draft: false }],
		["note", { ref: "42", body: "hello" }],
		["reply", { ref: "42", discussionId: "101", body: "hello" }],
	] as const) {
		await expect(
			runGitHubForge(operation, envelope(input), deps),
		).rejects.toThrow(/approved/);
	}
	expect(requests).toEqual([]);
});

test("approved mutations return receipts and never expose credentials", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (request.method === "POST" && path === "/pulls") {
			expect(request.body).toEqual({
				title: "Open a draft change",
				head: "cursor/generic-forge-provider-327b",
				base: "main",
				body: "Created from the normalized envelope.",
				draft: true,
			});
			return loadFixture("create-pull.json");
		}
		if (request.method === "POST" && path === "/pulls/42/ready_for_review") {
			const pull = loadFixture("pull.json") as Record<string, unknown>;
			return { ...pull, draft: false };
		}
		if (request.method === "POST" && path === "/issues/42/comments") {
			expect(request.body).toEqual({ body: "Holdout review passed." });
			return loadFixture("issue-comment.json");
		}
		if (request.method === "POST" && path === "/pulls/42/comments") {
			expect(request.body).toEqual({
				body: "Acknowledged.",
				in_reply_to: 101,
			});
			return loadFixture("issue-comment.json");
		}
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		if (request.method === "GET" && path === "/pulls/42") {
			return loadFixture("pull.json");
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});

	const created = (await runGitHubForge(
		"create",
		envelope({
			approved: true,
			title: "Open a draft change",
			sourceBranch: "cursor/generic-forge-provider-327b",
			targetBranch: "main",
			description: "Created from the normalized envelope.",
			draft: true,
		}),
		deps,
	)) as Record<string, unknown>;
	expect(created).toMatchObject({
		version: 1,
		provider: "github",
		operation: "create",
		ref: "99",
		url: "https://github.com/acme/app/pull/99",
	});
	expect(() => parseForgeOperationResult("create", created)).not.toThrow();

	const draft = await runGitHubForge(
		"set-draft",
		envelope({ approved: true, ref: "42", draft: false }),
		deps,
	);
	expect(draft).toMatchObject({
		operation: "set-draft",
		ref: "42",
		draft: false,
	});
	expect(() => parseForgeOperationResult("set-draft", draft)).not.toThrow();

	const note = await runGitHubForge(
		"note",
		envelope({ approved: true, ref: "42", body: "Holdout review passed." }),
		deps,
	);
	expect(note).toMatchObject({
		operation: "note",
		noteId: "501",
		url: "https://github.com/acme/app/pull/42#issuecomment-501",
	});
	expect(() => parseForgeOperationResult("note", note)).not.toThrow();

	const reply = await runGitHubForge(
		"reply",
		envelope({
			approved: true,
			ref: "42",
			discussionId: "101",
			body: "Acknowledged.",
		}),
		deps,
	);
	expect(reply).toMatchObject({
		operation: "reply",
		noteId: "501",
		discussionId: "101",
	});
	expect(() => parseForgeOperationResult("reply", reply)).not.toThrow();
	expect(JSON.stringify({ created, draft, note, reply })).not.toContain(TOKEN);
	expect(requests.every((request) => !request.url.includes(TOKEN))).toBe(true);
	expect(requests.length).toBeGreaterThan(0);

	await expect(
		runGitHubForge(
			"reply",
			envelope({
				approved: true,
				ref: "42",
				discussionId: "issue-comment:201",
				body: "nope",
			}),
			deps,
		),
	).rejects.toThrow(/not review threads/);
});

test("inline notes validate anchors and use the pull head commit", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url);
		if (path.startsWith("/pulls/42/files")) {
			return request.url.includes("page=1") ? loadFixture("files.json") : [];
		}
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		if (request.method === "POST") {
			expect(request.body).toMatchObject({
				body: "Inline finding.",
				commit_id: HEAD,
				path: "src/example.ts",
				line: 2,
				side: "RIGHT",
			});
			return loadFixture("review-comment-create.json");
		}
		return loadFixture("pull.json");
	});
	const result = (await runGitHubForge(
		"note",
		envelope({
			approved: true,
			ref: "42",
			body: "Inline finding.",
			anchor: { path: "src/example.ts", line: 2 },
		}),
		deps,
	)) as Record<string, unknown>;
	expect(result).toMatchObject({
		operation: "note",
		ref: "42",
		noteId: "502",
		discussionId: "502",
	});
	expect(() => parseForgeOperationResult("note", result)).not.toThrow();
	expect(requests.some((request) => request.method === "POST")).toBe(true);

	await expect(
		runGitHubForge(
			"note",
			envelope({
				approved: true,
				ref: "42",
				body: "Bad anchor.",
				anchor: { path: "src/example.ts", line: 99 },
			}),
			deps,
		),
	).rejects.toThrow(/added line/);
});

test("merge, close, and resolve stay human-owned", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	for (const operation of ["merge", "close", "resolve", "delete", "approve"]) {
		await expect(
			runGitHubForge(operation, envelope({ approved: true, ref: "42" }), deps),
		).rejects.toThrow(/does not merge, close, approve, delete, or resolve/);
	}
	expect(requests).toEqual([]);
});

test("CLI speaks operation argv plus version-1 JSON stdin", async () => {
	const { deps } = recordingDeps((request) => {
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		if (request.url.includes("/check-runs"))
			return loadFixture("empty-check-runs.json");
		return loadFixture("pull.json");
	});
	let stdout = "";
	let stderr = "";
	const code = await handleGitHubForgeCli({
		argv: ["read"],
		stdin: JSON.stringify(envelope({ ref: "42" })),
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
	expect(JSON.parse(stdout)).toMatchObject({ provider: "github", ref: "42" });
	expect(stdout).not.toContain(TOKEN);
});

test("CLI rejects missing credentials without putting secrets on argv", async () => {
	const root = await mkdtemp(join(tmpdir(), "github-forge-cli-"));
	try {
		const proc = Bun.spawn(
			[
				"bun",
				join(
					import.meta.dir,
					"..",
					"..",
					"providers",
					"github",
					"github-forge.ts",
				),
				"read",
			],
			{
				cwd: root,
				env: {
					PATH: process.env.PATH,
					HOME: root,
					GITHUB_TOKEN: "",
					GH_TOKEN: "",
					GH_TOKEN_FILE: join(root, "missing"),
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
				input: { ref: "42" },
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
		expect(stderr).toMatch(/GITHUB_TOKEN/);
		expect(stderr).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("token files are used when GITHUB_TOKEN is absent", async () => {
	const root = await mkdtemp(join(tmpdir(), "github-forge-token-"));
	try {
		const tokenPath = join(root, "token");
		await writeFile(tokenPath, `${TOKEN}\n`);
		const { deps, requests } = recordingDeps((request) => {
			if (request.url.includes("/status"))
				return loadFixture("combined-status.json");
			return loadFixture("pull.json");
		});
		deps.env = { HOME: root, GITHUB_TOKEN: "", GH_TOKEN: "" };
		deps.fileExists = (path) => path === tokenPath;
		deps.readFile = async (path) => {
			expect(path).toBe(tokenPath);
			return `${TOKEN}\r\n`;
		};
		await runGitHubForge("read", envelope({ ref: "42" }), deps);
		expect(requests[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
		expect(requests[0]?.url).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function pullDeps(extra: (request: GitHubRequest) => unknown | undefined) {
	return recordingDeps((request) => {
		const handled = extra(request);
		if (handled !== undefined) return handled;
		if (request.url.includes("/status"))
			return loadFixture("combined-status.json");
		if (request.url.includes("/check-runs"))
			return loadFixture("empty-check-runs.json");
		return loadFixture("pull.json");
	});
}

test("approvals use each reviewer's latest decision", async () => {
	const { deps } = pullDeps((request) =>
		request.url.includes("/pulls/42/reviews")
			? /[?&]page=2\b/.test(request.url)
				? [{ user: { login: "ben" }, state: "COMMENTED" }]
				: /[?&]page=1\b/.test(request.url)
					? [
							{ user: { login: "ana" }, state: "CHANGES_REQUESTED" },
							{ user: { login: "ana" }, state: "APPROVED" },
						]
					: []
			: undefined,
	);
	const result = (await runGitHubForge(
		"approvals",
		envelope({ ref: "42" }),
		deps,
	)) as Record<string, unknown>;
	expect(result.approval).toEqual({
		available: true,
		approvedBy: ["ana"],
		rulesMet: true,
	});
	expect(() => parseForgeOperationResult("approvals", result)).not.toThrow();

	const blocked = pullDeps((request) =>
		request.url.includes("/pulls/42/reviews")
			? /[?&]page=1\b/.test(request.url)
				? [
						{ user: { login: "ana" }, state: "APPROVED" },
						{ user: { login: "ben" }, state: "CHANGES_REQUESTED" },
					]
				: []
			: undefined,
	);
	const refused = (await runGitHubForge(
		"approvals",
		envelope({ ref: "42" }),
		blocked.deps,
	)) as Record<string, unknown>;
	expect(refused.approval).toEqual({
		available: true,
		approvedBy: ["ana"],
		rulesMet: false,
	});
});

test("land squash-merges with the head guard and reports the merged commit", async () => {
	const merged = "f".repeat(40);
	const { deps, requests } = pullDeps((request) =>
		request.method === "PUT" ? { merged: true, sha: merged } : undefined,
	);
	const result = (await runGitHubForge(
		"land",
		envelope({ approved: true, ref: "42", headRevision: HEAD }),
		deps,
	)) as Record<string, unknown>;
	expect(result).toMatchObject({ operation: "land", mergedRevision: merged });
	expect(() => parseForgeOperationResult("land", result)).not.toThrow();
	const put = requests.find((request) => request.method === "PUT");
	expect(resource(put?.url ?? "")).toBe("/pulls/42/merge");
	expect(put?.body).toEqual({ sha: HEAD, merge_method: "squash" });
});

test("land refuses a moved head or an unmerged response", async () => {
	const { deps, requests } = pullDeps((request) =>
		request.method === "PUT" ? { merged: false } : undefined,
	);
	await expect(
		runGitHubForge(
			"land",
			envelope({ approved: true, ref: "42", headRevision: "b".repeat(40) }),
			deps,
		),
	).rejects.toThrow(/new commits/);
	expect(requests.some((request) => request.method === "PUT")).toBe(false);
	await expect(
		runGitHubForge(
			"land",
			envelope({ approved: true, ref: "42", headRevision: HEAD }),
			deps,
		),
	).rejects.toThrow(/did not merge/);
});
