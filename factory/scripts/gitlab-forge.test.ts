import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type GitLabForgeDeps,
	type GitLabRequest,
	addedLineAnchors,
	gitlabIidFromRef,
	handleGitLabForgeCli,
	parseGitOrigin,
	runGitLabForge,
} from "../../providers/gitlab/gitlab-forge";
import { parseForgeOperationResult } from "./forge-provider";

const fixtures = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"gitlab",
	"fixtures",
);
const TOKEN = "glpat-fixture-token-never-leak";
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
		provider: "gitlab",
		repositoryRoot: "/tmp/app",
		...extra,
		input,
	};
}

function recordingDeps(handler: (request: GitLabRequest) => unknown): {
	deps: GitLabForgeDeps;
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
			perPage: 2,
			gitlabRequest: async (request) => {
				requests.push(request);
				expect(request.url).not.toContain(TOKEN);
				expect(request.headers["PRIVATE-TOKEN"]).toBe(TOKEN);
				return handler(request);
			},
		},
	};
}

function resource(url: string): string {
	const marker = "/merge_requests";
	const index = url.indexOf(marker);
	return index >= 0 ? url.slice(index) : url;
}

test("origin parsing strips credentials and nested groups stay one project path", () => {
	expect(
		parseGitOrigin(
			"https://oauth2:glpat-fixture-token-never-leak@gitlab.example/acme/nested/app.git",
		),
	).toEqual({
		host: "https://gitlab.example",
		project: "acme/nested/app",
	});
	expect(parseGitOrigin("git@gitlab.example:acme/app.git")).toEqual({
		host: "https://gitlab.example",
		project: "acme/app",
	});
	expect(parseGitOrigin("ssh://git@gitlab.example/acme/app.git")).toEqual({
		host: "https://gitlab.example",
		project: "acme/app",
	});
	expect(
		JSON.stringify(
			parseGitOrigin(
				"https://oauth2:glpat-fixture-token-never-leak@gitlab.example/acme/app.git",
			),
		),
	).not.toContain(TOKEN);
});

test("GitLab IIDs are accepted while opaque core refs are rejected at the API boundary", () => {
	expect(gitlabIidFromRef("42")).toBe("42");
	expect(gitlabIidFromRef("!42")).toBe("42");
	expect(() => gitlabIidFromRef("native:42")).toThrow(/numeric/);
	expect(() => gitlabIidFromRef("abc")).toThrow(/numeric/);
});

test("added-line anchors skip file headers and count from hunk starts", () => {
	const changes = loadFixture("changes.json") as {
		changes: Array<{ new_path: string; diff: string }>;
	};
	expect(addedLineAnchors(changes.changes)).toEqual([
		{ path: "src/example.ts", line: 2 },
		{ path: "docs/README.md", line: 2 },
	]);
});

test("find returns normalized summaries for a source branch without product fields", async () => {
	const { deps, requests } = recordingDeps((request) => {
		expect(resource(request.url)).toMatch(/^\/merge_requests\?/);
		expect(request.url).toContain(
			"source_branch=cursor%2Fgeneric-forge-provider-327b",
		);
		expect(request.url).toContain("acme%2Fapp");
		if (request.url.includes("page=1")) return loadFixture("find.json");
		return [];
	});
	const result = (await runGitLabForge(
		"find",
		envelope({ sourceBranch: "cursor/generic-forge-provider-327b" }),
		deps,
	)) as { changes: Array<Record<string, unknown>> };
	expect(result.changes).toHaveLength(2);
	expect(() => parseForgeOperationResult("find", result)).not.toThrow();
	expect(result.changes[0]).toMatchObject({
		version: 1,
		provider: "gitlab",
		ref: "42",
		state: "open",
		branches: {
			source: "cursor/generic-forge-provider-327b",
			target: "main",
		},
		title: "Keep review evidence complete",
	});
	expect(JSON.stringify(result)).not.toContain("iid");
	expect(JSON.stringify(result)).not.toContain(TOKEN);
	expect(requests.every((request) => request.method === "GET")).toBe(true);
});

test("read binds revisions and represents missing pipeline evidence explicitly", async () => {
	const withPipeline = recordingDeps(() => loadFixture("merge-request.json"));
	const opened = (await runGitLabForge(
		"read",
		envelope({ ref: "42" }),
		withPipeline.deps,
	)) as Record<string, unknown>;
	expect(opened).toMatchObject({
		provider: "gitlab",
		ref: "42",
		revisions: { head: HEAD },
		pipeline: {
			available: true,
			status: "success",
			revision: HEAD,
			current: true,
			url: "https://gitlab.example/acme/app/-/pipelines/88",
		},
	});
	expect(() => parseForgeOperationResult("read", opened)).not.toThrow();

	const without = recordingDeps(() =>
		loadFixture("merge-request-no-pipeline.json"),
	);
	const bare = (await runGitLabForge(
		"read",
		envelope({ ref: "7" }),
		without.deps,
	)) as Record<string, unknown>;
	expect(bare.pipeline).toEqual({ available: false });
	expect(bare.author).toBe("ada");
});

test("read verifies merged-results and stale pipeline revisions against the change head", async () => {
	const base = loadFixture("merge-request.json") as Record<string, unknown>;
	const pipeline = base.head_pipeline as Record<string, unknown>;
	const mergedRevision = "merged-results-revision";
	const merged = recordingDeps((request) => {
		if (request.url.includes("/repository/commits/")) {
			return { parent_ids: ["target-head", HEAD] };
		}
		return {
			...base,
			head_pipeline: { ...pipeline, sha: mergedRevision },
		};
	});
	const current = (await runGitLabForge(
		"read",
		envelope({ ref: "42" }),
		merged.deps,
	)) as { pipeline: { current: boolean; revision: string } };
	expect(current.pipeline).toMatchObject({
		current: true,
		revision: mergedRevision,
	});

	const stale = recordingDeps((request) => {
		if (request.url.includes("/repository/commits/")) {
			return { parent_ids: ["target-head", "older-source-head"] };
		}
		return {
			...base,
			head_pipeline: { ...pipeline, sha: "stale-revision" },
		};
	});
	const outdated = (await runGitLabForge(
		"read",
		envelope({ ref: "42" }),
		stale.deps,
	)) as { pipeline: { current: boolean } };
	expect(outdated.pipeline.current).toBe(false);
});

test("files, diff, commits, discussions, and anchors bind the requested change and head revision", async () => {
	const { deps } = recordingDeps((request) => {
		const path = resource(request.url);
		if (
			path === "/merge_requests/42" ||
			path.startsWith("/merge_requests/42?")
		) {
			return loadFixture("merge-request.json");
		}
		if (path.startsWith("/merge_requests/42/changes"))
			return loadFixture("changes.json");
		if (
			path.startsWith("/merge_requests/42/commits") &&
			request.url.includes("page=1")
		) {
			return loadFixture("commits-page-1.json");
		}
		if (
			path.startsWith("/merge_requests/42/commits") &&
			request.url.includes("page=2")
		) {
			return loadFixture("commits-page-2.json");
		}
		if (
			path.startsWith("/merge_requests/42/discussions") &&
			request.url.includes("page=1")
		) {
			return loadFixture("discussions-page-1.json");
		}
		if (
			path.startsWith("/merge_requests/42/discussions") &&
			request.url.includes("page=2")
		) {
			return loadFixture("discussions-page-2.json");
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
		const result = (await runGitLabForge(
			operation,
			envelope({ ref: "!42" }),
			deps,
		)) as Record<string, unknown>;
		expect(result).toMatchObject({
			version: 1,
			provider: "gitlab",
			ref: "!42",
			headRevision: HEAD,
		});
		expect(() => parseForgeOperationResult(operation, result)).not.toThrow();
	}

	const files = (await runGitLabForge(
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

	const diff = (await runGitLabForge(
		"diff",
		envelope({ ref: "42" }),
		deps,
	)) as { unifiedDiff: string; complete: boolean };
	expect(diff.complete).toBe(true);
	expect(diff.unifiedDiff).toContain("=== src/example.ts ===");
	expect(diff.unifiedDiff).toContain("+added");

	const commits = (await runGitLabForge(
		"commits",
		envelope({ ref: "42" }),
		deps,
	)) as { commits: Array<{ title: string; sha: string }> };
	expect(commits.commits.map((commit) => commit.title)).toEqual([
		"Oldest commit",
		"Middle commit",
		"Newest commit",
	]);

	const discussions = (await runGitLabForge(
		"discussions",
		envelope({ ref: "42" }),
		deps,
	)) as { discussions: Array<{ id: string; notes: Array<{ id: string }> }> };
	expect(discussions.discussions.map((thread) => thread.id)).toEqual([
		"discussion-one",
		"discussion-two",
		"discussion-three",
	]);
	expect(discussions.discussions[0]?.notes[0]).toMatchObject({
		id: "101",
		anchor: { path: "src/example.ts", line: 2, side: "new" },
	});

	const anchors = (await runGitLabForge(
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
	const { deps, requests } = recordingDeps((request) => {
		if (resource(request.url).startsWith("/merge_requests/42/changes")) {
			return loadFixture("changes-overflow.json");
		}
		return loadFixture("merge-request.json");
	});
	await expect(
		runGitLabForge("diff", envelope({ ref: "42" }), deps),
	).rejects.toThrow(/truncated/);
	await expect(
		runGitLabForge("files", envelope({ ref: "42" }), deps),
	).rejects.toThrow(/truncated/);
	expect(requests.some((request) => request.method !== "GET")).toBe(false);
});

test("unapproved mutations never reach GitLab", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	for (const [operation, input] of [
		["create", { title: "x", sourceBranch: "a", targetBranch: "main" }],
		["set-draft", { ref: "42", draft: false }],
		["note", { ref: "42", body: "hello" }],
		["reply", { ref: "42", discussionRef: "discussion-one", body: "hello" }],
	] as const) {
		await expect(
			runGitLabForge(operation, envelope(input), deps),
		).rejects.toThrow(/approved/);
	}
	expect(requests).toEqual([]);
});

test("approved mutations return receipts and never expose credentials", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url).split("?")[0] ?? "";
		if (request.method === "POST" && path === "/merge_requests") {
			expect(request.body).toEqual({
				title: "Draft: Open a draft change",
				source_branch: "cursor/generic-forge-provider-327b",
				target_branch: "main",
				description: "Created from the normalized envelope.",
			});
			return loadFixture("create-mr.json");
		}
		if (request.method === "PUT" && path === "/merge_requests/42") {
			expect(request.body).toEqual({ title: "Keep review evidence complete" });
			const mr = loadFixture("merge-request.json") as Record<string, unknown>;
			return { ...mr, draft: false };
		}
		if (request.method === "POST" && path === "/merge_requests/42/notes") {
			expect(request.body).toEqual({ body: "Holdout review passed." });
			return loadFixture("note.json");
		}
		if (
			request.method === "POST" &&
			path === "/merge_requests/42/discussions/discussion-one/notes"
		) {
			expect(request.body).toEqual({ body: "Acknowledged." });
			return loadFixture("note.json");
		}
		if (request.method === "GET") return loadFixture("merge-request.json");
		throw new Error(`unexpected ${request.method} ${path}`);
	});

	const created = (await runGitLabForge(
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
		provider: "gitlab",
		operation: "create",
		ref: "99",
		url: "https://gitlab.example/acme/app/-/merge_requests/99",
	});
	expect(() => parseForgeOperationResult("create", created)).not.toThrow();

	const draft = await runGitLabForge(
		"set-draft",
		envelope({ approved: true, ref: "42", draft: false }),
		deps,
	);
	expect(draft).toMatchObject({ operation: "set-draft", ref: "42" });
	expect(() => parseForgeOperationResult("set-draft", draft)).not.toThrow();

	const note = await runGitLabForge(
		"note",
		envelope({ approved: true, ref: "42", body: "Holdout review passed." }),
		deps,
	);
	expect(note).toMatchObject({
		operation: "note",
		noteId: "501",
		url: "https://gitlab.example/acme/app/-/merge_requests/42#note_501",
	});
	expect(() => parseForgeOperationResult("note", note)).not.toThrow();

	const reply = await runGitLabForge(
		"reply",
		envelope({
			approved: true,
			ref: "42",
			discussionId: "discussion-one",
			body: "Acknowledged.",
		}),
		deps,
	);
	expect(reply).toMatchObject({
		operation: "reply",
		noteId: "501",
		discussionId: "discussion-one",
	});
	expect(() => parseForgeOperationResult("reply", reply)).not.toThrow();
	expect(JSON.stringify({ created, draft, note, reply })).not.toContain(TOKEN);
	expect(requests.every((request) => !request.url.includes(TOKEN))).toBe(true);
	expect(requests.length).toBeGreaterThan(0);
});

test("inline notes validate anchors and use normalized diff refs", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const path = resource(request.url);
		if (path.startsWith("/merge_requests/42/changes"))
			return loadFixture("changes.json");
		if (request.method === "POST") {
			expect(request.body).toMatchObject({
				body: "Inline finding.",
				position: {
					position_type: "text",
					new_path: "src/example.ts",
					new_line: 2,
					head_sha: HEAD,
				},
			});
			return loadFixture("discussion-create.json");
		}
		return loadFixture("merge-request.json");
	});
	const result = (await runGitLabForge(
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
	});
	expect(() => parseForgeOperationResult("note", result)).not.toThrow();
	expect(requests.some((request) => request.method === "POST")).toBe(true);

	await expect(
		runGitLabForge(
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
			runGitLabForge(operation, envelope({ approved: true, ref: "42" }), deps),
		).rejects.toThrow(/does not merge, close, approve, delete, or resolve/);
	}
	expect(requests).toEqual([]);
});

test("CLI speaks operation argv plus version-1 JSON stdin", async () => {
	const { deps } = recordingDeps(() => loadFixture("merge-request.json"));
	let stdout = "";
	let stderr = "";
	const code = await handleGitLabForgeCli({
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
	expect(JSON.parse(stdout)).toMatchObject({ provider: "gitlab", ref: "42" });
	expect(stdout).not.toContain(TOKEN);
});

test("CLI rejects missing credentials without putting secrets on argv", async () => {
	const root = await mkdtemp(join(tmpdir(), "gitlab-forge-cli-"));
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
					"gitlab-forge.ts",
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
		expect(stderr).toMatch(/GITLAB_TOKEN/);
		expect(stderr).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("token files are used when GITLAB_TOKEN is absent", async () => {
	const root = await mkdtemp(join(tmpdir(), "gitlab-forge-token-"));
	try {
		const tokenPath = join(root, "token");
		await writeFile(tokenPath, `${TOKEN}\n`);
		const { deps, requests } = recordingDeps(() =>
			loadFixture("merge-request.json"),
		);
		deps.env = { HOME: root, GITLAB_TOKEN: "" };
		deps.fileExists = (path) => path === tokenPath;
		deps.readFile = async (path) => {
			expect(path).toBe(tokenPath);
			return `${TOKEN}\r\n`;
		};
		await runGitLabForge("read", envelope({ ref: "42" }), deps);
		expect(requests[0]?.headers["PRIVATE-TOKEN"]).toBe(TOKEN);
		expect(requests[0]?.url).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
