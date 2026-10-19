import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type JiraRequest,
	type JiraTrackerDeps,
	adfToText,
	auditLabel,
	handleJiraTrackerCli,
	parseJiraSite,
	runJiraTracker,
	textToAdf,
} from "../../providers/jira/jira-tracker";
import { WorkItem } from "./work-item-provider";

const fixtures = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"jira",
	"fixtures",
);
const TOKEN = "jira-fixture-token-never-leak";
const EMAIL = "ada@example.test";
const SITE = "https://acme.atlassian.net";
const PROJECT = "DELIV";

function loadFixture(name: string): unknown {
	return JSON.parse(readFileSync(join(fixtures, name), "utf8")) as unknown;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function envelope(
	input: Record<string, unknown>,
	extra: Record<string, unknown> = {},
) {
	return {
		version: 1,
		provider: "jira",
		repositoryRoot: "/tmp/app",
		...extra,
		input,
	};
}

function recordingDeps(handler: (request: JiraRequest) => unknown): {
	deps: JiraTrackerDeps;
	requests: JiraRequest[];
} {
	const requests: JiraRequest[] = [];
	const authorization = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
	return {
		requests,
		deps: {
			env: {
				JIRA_SITE: SITE,
				JIRA_PROJECT: PROJECT,
				JIRA_EMAIL: EMAIL,
				JIRA_API_TOKEN: TOKEN,
			},
			readFile: async () => {
				throw new Error(
					"token file should not be read when env credentials are set",
				);
			},
			fileExists: () => false,
			perPage: 1,
			jiraRequest: async (request) => {
				requests.push(request);
				expect(request.url).not.toContain(TOKEN);
				expect(request.url).not.toContain(EMAIL);
				expect(request.headers.Authorization).toBe(authorization);
				return handler(request);
			},
		},
	};
}

function restPath(url: string): string {
	const parsed = new URL(url);
	return `${parsed.pathname}${parsed.search}`;
}

test("site parsing rejects credentials and requires https", () => {
	expect(parseJiraSite("acme.atlassian.net")).toBe(SITE);
	expect(parseJiraSite(`${SITE}/jira`)).toBe(SITE);
	expect(() => parseJiraSite("http://acme.atlassian.net")).toThrow(/https/);
	expect(() =>
		parseJiraSite(`https://${EMAIL}:${TOKEN}@acme.atlassian.net`),
	).toThrow(/credentials/);
	expect(
		(() => {
			try {
				parseJiraSite(`https://${EMAIL}:${TOKEN}@acme.atlassian.net`);
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
			return "";
		})(),
	).not.toContain(TOKEN);
});

test("audit labels are stable and label-safe", () => {
	expect(auditLabel("run-1:1")).toBe("dlv-run-1x3a1");
	expect(auditLabel("draft:ready")).toBe("dlv-draftx3aready");
	expect(auditLabel("run-1:create")).toBe("dlv-run-1x3acreate");
});

test("ADF conversion round-trips plain work-item bodies", () => {
	const body = "First paragraph.\n\nSecond line\nstill second.";
	expect(adfToText(textToAdf(body))).toBe(body);
});

test("list paginates the project and returns normalized work items", async () => {
	const { deps, requests } = recordingDeps((request) => {
		const parsed = new URL(request.url);
		expect(parsed.pathname).toBe("/rest/api/3/search/jql");
		expect(parsed.searchParams.get("jql")).toContain(`project = "${PROJECT}"`);
		expect(parsed.searchParams.has("startAt")).toBe(false);
		expect(request.method).toBe("GET");
		const token = parsed.searchParams.get("nextPageToken");
		if (token === null) return loadFixture("search-page-1.json");
		if (token === "page-2-token") return loadFixture("search-page-2.json");
		throw new Error(`unexpected search ${parsed.search}`);
	});
	const result = await runJiraTracker("list", envelope({}), deps);
	expect(Array.isArray(result)).toBe(true);
	const items = result as ReturnType<typeof WorkItem.parse>[];
	expect(items).toHaveLength(2);
	expect(() => items.map((item) => WorkItem.parse(item))).not.toThrow();
	expect(items[0]).toMatchObject({
		version: 1,
		provider: "jira",
		ref: "DELIV-1",
		type: "bug",
		title: "Keep provider notes",
		body: "The selected provider stores one note per audit id.",
		blockedBy: ["DELIV-2"],
		sourceAuditId: "run-1:1",
		notes: [{ auditId: "draft:ready", body: "updated" }],
	});
	expect(items[1]).toMatchObject({
		ref: "DELIV-2",
		type: "story",
		blockedBy: [],
		notes: [],
	});
	expect(JSON.stringify(result)).not.toContain(TOKEN);
	expect(JSON.stringify(result)).not.toContain("issuetype");
	expect(requests.every((request) => request.method === "GET")).toBe(true);
});

test("list follows the next-page token past a short page until isLast", async () => {
	const page1 = loadFixture("search-page-1.json") as { issues: unknown[] };
	const page2 = loadFixture("search-page-2.json") as { issues: unknown[] };
	const { deps, requests } = recordingDeps((request) => {
		const token = new URL(request.url).searchParams.get("nextPageToken");
		if (token === null) {
			return { issues: [], nextPageToken: "after-empty", isLast: false };
		}
		if (token === "after-empty") {
			return { issues: page1.issues, nextPageToken: "last", isLast: false };
		}
		if (token === "last") return { issues: page2.issues, isLast: true };
		throw new Error(`unexpected token ${token}`);
	});
	deps.perPage = 5;
	const items = (await runJiraTracker("list", envelope({}), deps)) as Array<{
		ref: string;
	}>;
	expect(items.map((item) => item.ref)).toEqual(["DELIV-1", "DELIV-2"]);
	expect(requests).toHaveLength(3);
});

test("read maps type, blockers, tagged notes, and ignores unrelated links", async () => {
	const { deps } = recordingDeps((request) => {
		expect(new URL(request.url).pathname).toBe("/rest/api/3/issue/DELIV-1");
		return loadFixture("issue-deliv-1.json");
	});
	const item = WorkItem.parse(
		await runJiraTracker("read", envelope({ ref: "DELIV-1" }), deps),
	);
	expect(item).toMatchObject({
		provider: "jira",
		ref: "DELIV-1",
		type: "bug",
		blockedBy: ["DELIV-2"],
		sourceAuditId: "run-1:1",
		notes: [{ auditId: "draft:ready", body: "updated" }],
	});
	expect(item.blockedBy).not.toContain("DELIV-9");
});

test("unapproved create and link never reach Jira", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	await expect(
		runJiraTracker(
			"create",
			envelope({
				auditId: "run-1:1",
				title: "No",
				body: "No",
			}),
			deps,
		),
	).rejects.toThrow(/approved/);
	await expect(
		runJiraTracker(
			"link",
			envelope({ ref: "DELIV-1", blockedBy: ["DELIV-2"] }),
			deps,
		),
	).rejects.toThrow(/approved/);
	expect(requests).toEqual([]);
});

test("approved create is idempotent on audit id and refuses conflicting replay", async () => {
	const created = clone(loadFixture("issue-created.json")) as {
		fields: { issuelinks: unknown[] };
	};
	created.fields.issuelinks = [];
	let exists = false;
	const { deps, requests } = recordingDeps((request) => {
		const parsed = new URL(request.url);
		const path = parsed.pathname;
		if (request.method === "GET" && path === "/rest/api/3/search/jql") {
			if (exists) {
				return { issues: [created], isLast: true };
			}
			return loadFixture("search-empty.json");
		}
		if (request.method === "GET" && path === "/rest/api/3/project/DELIV") {
			return loadFixture("project.json");
		}
		if (request.method === "POST" && path === "/rest/api/3/issue") {
			expect(request.body).toMatchObject({
				fields: {
					project: { key: PROJECT },
					summary: "Create through the adapter",
					issuetype: { name: "Story" },
					labels: [auditLabel("run-1:create")],
				},
			});
			exists = true;
			return loadFixture("create-issue.json");
		}
		if (request.method === "PUT" && path.includes("/properties/")) {
			return null;
		}
		if (request.method === "POST" && path === "/rest/api/3/issueLink") {
			expect(request.body).toEqual({
				type: { name: "Blocks" },
				inwardIssue: { key: "DELIV-3" },
				outwardIssue: { key: "DELIV-2" },
			});
			created.fields.issuelinks = [
				{
					id: "10020",
					type: {
						id: "10000",
						name: "Blocks",
						inward: "is blocked by",
						outward: "blocks",
					},
					outwardIssue: { id: "10002", key: "DELIV-2" },
				},
			];
			return { id: "10020" };
		}
		if (request.method === "GET" && path === "/rest/api/3/issue/DELIV-3") {
			return created;
		}
		throw new Error(`unexpected ${request.method} ${restPath(request.url)}`);
	});
	const input = {
		approved: true,
		auditId: "run-1:create",
		type: "story",
		title: "Create through the adapter",
		body: "Approved creation should stay idempotent.",
		blockedBy: ["DELIV-2"],
	};
	const first = WorkItem.parse(
		await runJiraTracker("create", envelope(input), deps),
	);
	expect(first).toMatchObject({
		ref: "DELIV-3",
		type: "story",
		sourceAuditId: "run-1:create",
		blockedBy: ["DELIV-2"],
	});
	expect(
		requests.some(
			(request) =>
				request.method === "POST" &&
				new URL(request.url).pathname === "/rest/api/3/issueLink",
		),
	).toBe(true);
	const writesAfterCreate = requests.filter(
		(request) => request.method !== "GET",
	).length;
	const second = WorkItem.parse(
		await runJiraTracker("create", envelope(input), deps),
	);
	expect(second.ref).toBe("DELIV-3");
	expect(requests.filter((request) => request.method !== "GET")).toHaveLength(
		writesAfterCreate,
	);
	await expect(
		runJiraTracker(
			"create",
			envelope({ ...input, title: "Conflicting replay" }),
			deps,
		),
	).rejects.toThrow(/different work-item content/);
	expect(JSON.stringify({ first, second })).not.toContain(TOKEN);
	await expect(
		runJiraTracker(
			"create",
			envelope({
				approved: true,
				auditId: "run-1:chosen-key",
				title: "Chosen key",
				body: "Jira allocates keys.",
				ref: "DELIV-99",
			}),
			deps,
		),
	).rejects.toThrow(/allocates issue keys/);
});

test("approved link replaces blocked-by links and leaves other types", async () => {
	const issue = clone(loadFixture("issue-deliv-1.json")) as {
		fields: { issuelinks: Array<Record<string, unknown>> };
	};
	const { deps, requests } = recordingDeps((request) => {
		const path = new URL(request.url).pathname;
		if (request.method === "GET" && path === "/rest/api/3/issue/DELIV-1") {
			return issue;
		}
		if (request.method === "POST" && path === "/rest/api/3/issueLink") {
			expect(request.body).toEqual({
				type: { name: "Blocks" },
				inwardIssue: { key: "DELIV-1" },
				outwardIssue: { key: "DELIV-4" },
			});
			issue.fields.issuelinks = issue.fields.issuelinks
				.filter((link) => link.id !== "10010")
				.concat([
					{
						id: "10030",
						type: {
							id: "10000",
							name: "Blocks",
							inward: "is blocked by",
							outward: "blocks",
						},
						outwardIssue: { id: "10004", key: "DELIV-4" },
					},
				]);
			return { id: "10030" };
		}
		if (request.method === "DELETE" && path === "/rest/api/3/issueLink/10010") {
			issue.fields.issuelinks = issue.fields.issuelinks.filter(
				(link) => link.id !== "10010",
			);
			return null;
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const linked = WorkItem.parse(
		await runJiraTracker(
			"link",
			envelope({ approved: true, ref: "DELIV-1", blockedBy: ["DELIV-4"] }),
			deps,
		),
	);
	expect(linked.blockedBy).toEqual(["DELIV-4"]);
	expect(issue.fields.issuelinks.some((link) => link.id === "10011")).toBe(
		true,
	);
	expect(requests.some((request) => request.method === "DELETE")).toBe(true);
	expect(requests.some((request) => request.method === "POST")).toBe(true);
});

test("notes keep one tagged comment per audit id", async () => {
	const issue = clone(loadFixture("issue-deliv-2.json")) as {
		fields: { comment: { comments: unknown[]; total: number } };
	};
	const { deps, requests } = recordingDeps((request) => {
		const path = new URL(request.url).pathname;
		if (request.method === "GET" && path === "/rest/api/3/issue/DELIV-2") {
			return issue;
		}
		if (
			request.method === "POST" &&
			path === "/rest/api/3/issue/DELIV-2/comment"
		) {
			expect(request.body).toEqual({
				body: textToAdf("delivery-audit-id: draft:ready\n\nfirst"),
			});
			const comment = loadFixture("comment-create.json");
			issue.fields.comment.comments = [comment];
			issue.fields.comment.total = 1;
			return comment;
		}
		if (
			request.method === "PUT" &&
			path === "/rest/api/3/issue/DELIV-2/comment/10200"
		) {
			expect(request.body).toEqual({
				body: textToAdf("delivery-audit-id: draft:ready\n\nupdated"),
			});
			const updated = {
				id: "10200",
				body: textToAdf("delivery-audit-id: draft:ready\n\nupdated"),
			};
			issue.fields.comment.comments = [updated];
			return updated;
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	});
	const first = WorkItem.parse(
		await runJiraTracker(
			"note",
			envelope({ ref: "DELIV-2", auditId: "draft:ready", body: "first" }),
			deps,
		),
	);
	expect(first.notes).toEqual([{ auditId: "draft:ready", body: "first" }]);
	const repeated = WorkItem.parse(
		await runJiraTracker(
			"note",
			envelope({ ref: "DELIV-2", auditId: "draft:ready", body: "first" }),
			deps,
		),
	);
	expect(repeated.notes).toEqual([{ auditId: "draft:ready", body: "first" }]);
	expect(requests.filter((request) => request.method === "POST")).toHaveLength(
		1,
	);
	const updated = WorkItem.parse(
		await runJiraTracker(
			"note",
			envelope({ ref: "DELIV-2", auditId: "draft:ready", body: "updated" }),
			deps,
		),
	);
	expect(updated.notes).toEqual([{ auditId: "draft:ready", body: "updated" }]);
	expect(requests.filter((request) => request.method === "POST")).toHaveLength(
		1,
	);
	expect(requests.filter((request) => request.method === "PUT")).toHaveLength(
		1,
	);
});

test("status transitions and deletes stay human-owned", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	for (const operation of [
		"transition",
		"delete",
		"close",
		"resolve",
		"status",
	]) {
		await expect(
			runJiraTracker(
				operation,
				envelope({ approved: true, ref: "DELIV-1" }),
				deps,
			),
		).rejects.toThrow(/does not transition status, delete issues/);
	}
	expect(requests).toEqual([]);
});

test("CLI speaks operation argv plus version-1 JSON stdin", async () => {
	const { deps } = recordingDeps(() => loadFixture("issue-deliv-1.json"));
	let stdout = "";
	let stderr = "";
	const code = await handleJiraTrackerCli({
		argv: ["read"],
		stdin: JSON.stringify(envelope({ ref: "DELIV-1" })),
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
	expect(JSON.parse(stdout)).toMatchObject({
		provider: "jira",
		ref: "DELIV-1",
	});
	expect(stdout).not.toContain(TOKEN);
});

test("authentication failures and thrown secrets are sanitised", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error(`Unauthorized ${TOKEN} for ${EMAIL}`);
	});
	await expect(
		runJiraTracker("read", envelope({ ref: "DELIV-1" }), deps),
	).rejects.toThrow(/\[redacted\]/);
	expect(requests).toHaveLength(1);
	try {
		await runJiraTracker("read", envelope({ ref: "DELIV-1" }), deps);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		expect(message).not.toContain(TOKEN);
		expect(message).not.toContain(EMAIL);
	}
});

test("CLI rejects missing credentials without putting secrets on argv", async () => {
	const root = await mkdtemp(join(tmpdir(), "jira-tracker-cli-"));
	try {
		const proc = Bun.spawn(
			[
				"bun",
				join(
					import.meta.dir,
					"..",
					"..",
					"providers",
					"jira",
					"jira-tracker.ts",
				),
				"read",
			],
			{
				cwd: root,
				env: {
					PATH: process.env.PATH,
					HOME: root,
					JIRA_SITE: SITE,
					JIRA_PROJECT: PROJECT,
					JIRA_EMAIL: "",
					JIRA_API_TOKEN: "",
					JIRA_TOKEN: "",
					JIRA_TOKEN_FILE: join(root, "missing"),
				},
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		proc.stdin.write(
			JSON.stringify({
				version: 1,
				provider: "jira",
				repositoryRoot: root,
				input: { ref: "DELIV-1" },
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
		expect(stderr).toMatch(/JIRA_EMAIL|JIRA_TOKEN_FILE|jira-token/);
		expect(stderr).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("token files are used when env tokens are absent", async () => {
	const root = await mkdtemp(join(tmpdir(), "jira-tracker-token-"));
	try {
		const tokenPath = join(root, "jira-token");
		await writeFile(tokenPath, `${EMAIL}\n${TOKEN}\n`);
		const { deps, requests } = recordingDeps(() =>
			loadFixture("issue-deliv-1.json"),
		);
		deps.env = {
			HOME: root,
			JIRA_SITE: SITE,
			JIRA_PROJECT: PROJECT,
			JIRA_EMAIL: "",
			JIRA_API_TOKEN: "",
		};
		deps.fileExists = (path) => path === tokenPath;
		deps.readFile = async (path) => {
			expect(path).toBe(tokenPath);
			return `${EMAIL}\r\n${TOKEN}\r\n`;
		};
		await runJiraTracker("read", envelope({ ref: "DELIV-1" }), deps);
		expect(requests[0]?.headers.Authorization).toBe(
			`Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`,
		);
		expect(requests[0]?.url).not.toContain(TOKEN);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
