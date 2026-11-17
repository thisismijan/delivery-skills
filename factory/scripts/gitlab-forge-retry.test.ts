import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type GitLabForgeDeps,
	type GitLabRequest,
	failedJobsOf,
	logTail,
	pipelineKind,
	runGitLabForge,
} from "../../providers/gitlab/gitlab-forge";
import { parseForgeOperationResult } from "./forge-provider";

const TOKEN = "glpat-fixture-token-never-leak";
const HEAD = "aaa111bbb222ccc333ddd444eee555fff666aaa1";
const BASE = "b".repeat(40);
const ESC = String.fromCharCode(27);

const MERGE_REQUEST = JSON.parse(
	readFileSync(
		join(
			import.meta.dir,
			"..",
			"..",
			"providers",
			"gitlab",
			"fixtures",
			"merge-request.json",
		),
		"utf8",
	),
) as Record<string, unknown>;

function envelope(input: Record<string, unknown>) {
	return { version: 1, provider: "gitlab", repositoryRoot: "/tmp/app", input };
}

interface Fake {
	pipelines?: unknown[];
	jobs?: unknown[];
	traces?: Record<string, string | Error>;
	mergeRequest?: Record<string, unknown>;
	mergeParents?: Record<string, string[]>;
}

function fakeGitLab(fake: Fake): {
	deps: GitLabForgeDeps;
	requests: GitLabRequest[];
} {
	const requests: GitLabRequest[] = [];
	const deps: GitLabForgeDeps = {
		env: { GITLAB_TOKEN: TOKEN },
		gitRemoteUrl: async () => "https://gitlab.example/acme/app.git",
		readFile: async () => {
			throw new Error("no token file");
		},
		fileExists: () => false,
		gitlabRequest: async (request) => {
			requests.push(request);
			expect(request.url).not.toContain(TOKEN);
			const path = new URL(request.url).pathname.replace(
				/^\/api\/v4\/projects\/[^/]+/,
				"",
			);
			if (path === "/merge_requests/42") {
				return fake.mergeRequest ?? MERGE_REQUEST;
			}
			if (path === "/merge_requests/42/pipelines") return fake.pipelines ?? [];
			if (path.startsWith("/repository/commits/")) {
				const sha = decodeURIComponent(path.split("/").pop() ?? "");
				return { parent_ids: fake.mergeParents?.[sha] ?? [] };
			}
			if (path === "/pipelines/500/jobs") return fake.jobs ?? [];
			const trace = path.match(/^\/jobs\/(\d+)\/trace$/);
			if (trace) {
				expect(request.responseType).toBe("text");
				const body = fake.traces?.[trace[1] as string] ?? "";
				if (body instanceof Error) throw body;
				return body;
			}
			const retry = path.match(/^\/jobs\/(\d+)\/retry$/);
			if (retry && request.method === "POST") {
				return {
					id: Number(retry[1]) + 1000,
					web_url: `https://gitlab.example/acme/app/-/jobs/${Number(retry[1]) + 1000}`,
				};
			}
			if (
				path === "/merge_trains/merge_requests/42" &&
				request.method === "POST"
			) {
				return [{ id: 1, merge_request: { iid: 42 } }];
			}
			throw new Error(`unexpected request ${request.method} ${path}`);
		},
	};
	return { deps, requests };
}

function job(
	id: number,
	name: string,
	status: string,
	extra: Record<string, unknown> = {},
) {
	return { id, name, status, stage: "test", ...extra };
}

describe("GitLab failures", () => {
	test("reads the failed jobs of the head pipeline with retries counted", async () => {
		const { deps } = fakeGitLab({
			pipelines: [
				{
					id: 500,
					sha: HEAD,
					ref: "refs/merge-requests/42/head",
					status: "failed",
					web_url: "https://gitlab.example/acme/app/-/pipelines/500",
				},
			],
			jobs: [
				job(70, "workspace-build", "failed", {
					failure_reason: "runner_system_failure",
				}),
				job(71, "workspace-build", "failed", {
					failure_reason: "runner_system_failure",
				}),
				job(72, "lint", "success"),
				job(73, "spotbugs-sast", "failed", { allow_failure: true }),
				job(74, "test:api", "failed"),
				job(75, "test:api", "success"),
			],
			traces: {
				"71": `section_start:1:step_script\r${ESC}[0K${ESC}[31;1mERROR: Job failed (system failure)${ESC}[0;m\r\n`,
			},
		});
		const result = await runGitLabForge(
			"failures",
			envelope({ ref: "42", headRevision: HEAD }),
			deps,
		);
		expect(parseForgeOperationResult("failures", result)).toEqual({
			version: 1,
			provider: "gitlab",
			ref: "42",
			headRevision: HEAD,
			pipeline: {
				available: true,
				id: "500",
				status: "failed",
				kind: "merge-request",
				attempt: 1,
				url: "https://gitlab.example/acme/app/-/pipelines/500",
				failedJobs: [
					{
						id: "71",
						name: "workspace-build",
						stage: "test",
						failureReason: "runner_system_failure",
						attempt: 2,
						logTail: "ERROR: Job failed (system failure)\n",
					},
				],
			},
		});
	});

	test("reports no pipeline when the newest one is not at the head", async () => {
		const { deps } = fakeGitLab({
			pipelines: [
				{ id: 500, sha: "c".repeat(40), ref: "topic", status: "failed" },
			],
		});
		const result = (await runGitLabForge(
			"failures",
			envelope({ ref: "42" }),
			deps,
		)) as { pipeline: unknown };
		expect(result.pipeline).toEqual({ available: false });
	});

	test("refuses to read failures for a head the change has moved past", async () => {
		const { deps } = fakeGitLab({});
		await expect(
			runGitLabForge(
				"failures",
				envelope({ ref: "42", headRevision: "d".repeat(40) }),
				deps,
			),
		).rejects.toThrow(/new commits/);
	});

	test("counts consecutive failed merge train pipelines for the head", async () => {
		const { deps } = fakeGitLab({
			pipelines: [
				{
					id: 400,
					sha: HEAD,
					ref: "refs/merge-requests/42/head",
					status: "success",
				},
				{
					id: 500,
					sha: "e".repeat(40),
					ref: "refs/merge-requests/42/train",
					status: "failed",
				},
				{
					id: 450,
					sha: "f".repeat(40),
					ref: "refs/merge-requests/42/train",
					status: "failed",
				},
			],
			mergeParents: {
				["e".repeat(40)]: [BASE, HEAD],
				["f".repeat(40)]: [BASE, HEAD],
			},
			jobs: [
				job(80, "spotbugs-sast", "failed", {
					failure_reason: "runner_system_failure",
				}),
			],
		});
		const result = parseForgeOperationResult(
			"failures",
			await runGitLabForge("failures", envelope({ ref: "42" }), deps),
		) as { pipeline: { kind: string; attempt: number } };
		expect(result.pipeline).toMatchObject({ kind: "merge-train", attempt: 2 });
	});

	test("leaves out a log the forge would not return", async () => {
		const { deps } = fakeGitLab({
			pipelines: [
				{
					id: 500,
					sha: HEAD,
					ref: "refs/merge-requests/42/head",
					status: "failed",
				},
			],
			jobs: [job(71, "build", "failed")],
			traces: { "71": new Error("GitLab request failed (HTTP 500).") },
		});
		const result = (await runGitLabForge(
			"failures",
			envelope({ ref: "42" }),
			deps,
		)) as { pipeline: { failedJobs: Array<Record<string, unknown>> } };
		expect(result.pipeline.failedJobs[0]).not.toHaveProperty("logTail");
	});

	test("keeps only the end of a long log", () => {
		const tail = logTail(
			`${"x".repeat(10_000)}\nERROR: no space left on device\n`,
		);
		expect(tail.length).toBe(4000);
		expect(tail.endsWith("no space left on device\n")).toBe(true);
	});

	test("names the kind of pipeline from its ref", () => {
		expect(pipelineKind("refs/merge-requests/7/train")).toBe("merge-train");
		expect(pipelineKind("refs/merge-requests/7/merge")).toBe("merge-request");
		expect(pipelineKind("refs/merge-requests/7/head")).toBe("merge-request");
		expect(pipelineKind("main")).toBe("branch");
	});

	test("refuses job evidence without a name or id", () => {
		expect(() => failedJobsOf([{ id: 1, status: "failed" }])).toThrow(
			/missing a name or id/,
		);
	});
});

describe("GitLab retry", () => {
	test("retries the named jobs at the guarded head", async () => {
		const { deps, requests } = fakeGitLab({});
		const result = await runGitLabForge(
			"retry",
			envelope({
				approved: true,
				ref: "42",
				headRevision: HEAD,
				jobIds: ["71", "72"],
			}),
			deps,
		);
		expect(parseForgeOperationResult("retry", result)).toEqual({
			version: 1,
			provider: "gitlab",
			operation: "retry",
			ref: "42",
			url: "https://gitlab.example/acme/app/-/jobs/1071",
			retriedJobIds: ["71", "72"],
		});
		expect(
			requests
				.filter((request) => request.method === "POST")
				.map((request) => new URL(request.url).pathname.split("/projects/")[1]),
		).toEqual(["acme%2Fapp/jobs/71/retry", "acme%2Fapp/jobs/72/retry"]);
	});

	test("re-adds the change to the merge train at the guarded head", async () => {
		const { deps, requests } = fakeGitLab({});
		const result = await runGitLabForge(
			"retry",
			envelope({
				approved: true,
				ref: "42",
				headRevision: HEAD,
				mergeTrain: true,
			}),
			deps,
		);
		expect(parseForgeOperationResult("retry", result)).toMatchObject({
			operation: "retry",
			mergeTrain: true,
		});
		const post = requests.find((request) => request.method === "POST");
		expect(post?.url).toEndWith("/merge_trains/merge_requests/42");
		expect(post?.body).toEqual({ sha: HEAD });
	});

	test("refuses an unapproved, ambiguous, or stale retry before posting", async () => {
		const { deps, requests } = fakeGitLab({});
		await expect(
			runGitLabForge(
				"retry",
				envelope({ ref: "42", headRevision: HEAD, jobIds: ["71"] }),
				deps,
			),
		).rejects.toThrow(/approved/);
		await expect(
			runGitLabForge(
				"retry",
				envelope({
					approved: true,
					ref: "42",
					headRevision: HEAD,
					jobIds: ["71"],
					mergeTrain: true,
				}),
				deps,
			),
		).rejects.toThrow(/not both/);
		await expect(
			runGitLabForge(
				"retry",
				envelope({ approved: true, ref: "42", headRevision: HEAD }),
				deps,
			),
		).rejects.toThrow(/not both/);
		await expect(
			runGitLabForge(
				"retry",
				envelope({
					approved: true,
					ref: "42",
					headRevision: HEAD,
					jobIds: ["../71"],
				}),
				deps,
			),
		).rejects.toThrow(/numeric/);
		await expect(
			runGitLabForge(
				"retry",
				envelope({
					approved: true,
					ref: "42",
					headRevision: "d".repeat(40),
					jobIds: ["71"],
				}),
				deps,
			),
		).rejects.toThrow(/new commits/);
		expect(requests.some((request) => request.method === "POST")).toBe(false);
	});
});
