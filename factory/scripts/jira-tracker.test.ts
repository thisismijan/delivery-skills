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
		settings: { project: PROJECT },
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
		if (request.method === "GET" && path === "/rest/api/3/myself") {
			return { accountId: "acc-ada", displayName: "Ada Lovelace" };
		}
		if (request.method === "POST" && path === "/rest/api/3/issue") {
			expect(request.body).toMatchObject({
				fields: {
					project: { key: PROJECT },
					summary: "Create through the adapter",
					issuetype: { name: "Story" },
					labels: [auditLabel("run-1:create")],
					assignee: { accountId: "acc-ada" },
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

test("deletes, closes, and raw status changes stay human-owned", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run");
	});
	for (const operation of ["delete", "close", "resolve", "status"]) {
		await expect(
			runJiraTracker(
				operation,
				envelope({ approved: true, ref: "DELIV-1" }),
				deps,
			),
		).rejects.toThrow(/does not delete issues/);
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

test("the project comes from the repository settings, never JIRA_PROJECT", async () => {
	const { deps, requests } = recordingDeps(() => {
		throw new Error("network should not run without a repository project");
	});
	deps.env = { ...deps.env, JIRA_PROJECT: PROJECT };
	await expect(
		runJiraTracker(
			"read",
			envelope({ ref: "DELIV-1" }, { settings: {} }),
			deps,
		),
	).rejects.toThrow(
		/No Jira project is set for this repository.*--setting project=/,
	);
	expect(requests).toEqual([]);
});

test("each repository's project scopes its searches, and its site overrides JIRA_SITE", async () => {
	const { deps, requests } = recordingDeps(() =>
		loadFixture("search-empty.json"),
	);
	await runJiraTracker(
		"list",
		envelope(
			{},
			{ settings: { project: "OTHER", site: "other.atlassian.net" } },
		),
		deps,
	);
	const url = new URL(requests[0]?.url ?? "");
	expect(url.origin).toBe("https://other.atlassian.net");
	expect(url.searchParams.get("jql")).toContain('project = "OTHER"');
	expect(url.searchParams.get("jql")).not.toContain(PROJECT);
});

test("settings in a flat envelope are not read as operation input", async () => {
	const { deps } = recordingDeps((request) => {
		expect(new URL(request.url).pathname).toBe("/rest/api/3/issue/DELIV-1");
		return loadFixture("issue-deliv-1.json");
	});
	const item = await runJiraTracker(
		"read",
		{
			version: 1,
			provider: "jira",
			repositoryRoot: "/tmp/app",
			settings: { project: PROJECT },
			ref: "DELIV-1",
		},
		deps,
	);
	expect(item).toMatchObject({ ref: "DELIV-1" });
});

function boardHandler(state: { status: string }, transitions: unknown[]) {
	return (request: JiraRequest) => {
		const path = new URL(request.url).pathname;
		if (path === "/rest/agile/1.0/board/12/configuration") {
			return {
				columnConfig: {
					columns: [
						{ name: "To Do", statuses: [{ id: "1" }] },
						{ name: "In Progress", statuses: [{ id: "3" }] },
						{ name: "Review", statuses: [{ id: "4" }] },
						{ name: "Done", statuses: [{ id: "5" }] },
					],
				},
			};
		}
		if (path === "/rest/api/3/status") {
			return [
				{ id: "5", name: "Done" },
				{ id: "1", name: "To Do" },
				{ id: "4", name: "In Review" },
				{ id: "3", name: "In Progress" },
			];
		}
		if (path === "/rest/api/3/issue/DELIV-1") {
			return { key: "DELIV-1", fields: { status: { name: state.status } } };
		}
		if (path === "/rest/api/3/issue/DELIV-1/transitions") {
			if (request.method === "GET") return { transitions };
			const id = (request.body as { transition: { id: string } }).transition.id;
			const chosen = transitions.find(
				(transition) => (transition as { id: string }).id === id,
			) as { to: { name: string } };
			state.status = chosen.to.name;
			return null;
		}
		throw new Error(`unexpected ${request.method} ${path}`);
	};
}

const BOARD_SETTINGS = { settings: { project: PROJECT, board: "12" } };

test("statuses reads the board's statuses in column order", async () => {
	const { deps } = recordingDeps(boardHandler({ status: "In Progress" }, []));
	expect(
		await runJiraTracker(
			"statuses",
			envelope({ ref: "DELIV-1" }, BOARD_SETTINGS),
			deps,
		),
	).toEqual({
		version: 1,
		provider: "jira",
		ref: "DELIV-1",
		current: "In Progress",
		statuses: ["To Do", "In Progress", "In Review", "Done"],
	});
	await expect(
		runJiraTracker("statuses", envelope({ ref: "DELIV-1" }), deps),
	).rejects.toThrow(/Set the Jira board setting/);
});

test("transition applies the one workflow transition into the target status", async () => {
	const state = { status: "To Do" };
	const { deps, requests } = recordingDeps(
		boardHandler(state, [
			{ id: "21", to: { name: "In Progress" } },
			{ id: "31", to: { name: "Done" } },
		]),
	);
	const moved = await runJiraTracker(
		"transition",
		envelope(
			{ approved: true, ref: "DELIV-1", to: "In Progress" },
			BOARD_SETTINGS,
		),
		deps,
	);
	expect(moved).toMatchObject({ current: "In Progress" });
	expect(requests.find((request) => request.method === "POST")?.body).toEqual({
		transition: { id: "21" },
	});
	await expect(
		runJiraTracker(
			"transition",
			envelope({ ref: "DELIV-1", to: "Done" }, BOARD_SETTINGS),
			deps,
		),
	).rejects.toThrow(/approved/);
	await expect(
		runJiraTracker(
			"transition",
			envelope(
				{ approved: true, ref: "DELIV-1", to: "In Review" },
				BOARD_SETTINGS,
			),
			deps,
		),
	).rejects.toThrow(/no transition from 'In Progress' to 'In Review'/);
	await expect(
		runJiraTracker(
			"transition",
			envelope(
				{ approved: true, ref: "DELIV-1", to: "Blocked" },
				BOARD_SETTINGS,
			),
			deps,
		),
	).rejects.toThrow(/not a status on the Jira board/);
	expect(requests.filter((request) => request.method === "POST")).toHaveLength(
		1,
	);
});

const SPRINT_FIELD = "customfield_10020";

interface FakeJiraSite {
	activeSprints?: Array<{ id: number; name: string; state: string }>;
	futureSprints?: Array<{ id: number; name: string; state: string }>;
	sprints?: Record<string, { id: number; name: string; state: string }>;
	users?: Record<string, string>;
}

function placementSite(site: FakeJiraSite = {}) {
	let createdBody: { fields: Record<string, unknown> } | undefined;
	const sprintById = (id: number) =>
		[
			...(site.activeSprints ?? []),
			...(site.futureSprints ?? []),
			...Object.values(site.sprints ?? {}),
		].find((sprint) => sprint.id === id);
	const recorded = recordingDeps((request) => {
		const parsed = new URL(request.url);
		const path = parsed.pathname;
		if (request.method === "GET" && path === "/rest/api/3/search/jql") {
			if (!createdBody) return loadFixture("search-empty.json");
			return { issues: [createdIssue()], isLast: true };
		}
		if (request.method === "GET" && path === "/rest/api/3/project/DELIV") {
			return loadFixture("project.json");
		}
		if (request.method === "GET" && path === "/rest/api/3/myself") {
			return { accountId: "acc-ada", displayName: "Ada Lovelace" };
		}
		if (request.method === "GET" && path === "/rest/api/3/user") {
			const accountId = parsed.searchParams.get("accountId") ?? "";
			const name = site.users?.[accountId];
			if (!name) throw new Error("Jira answered 404");
			return { accountId, displayName: name };
		}
		if (request.method === "GET" && path === "/rest/api/3/field") {
			return [
				{ id: "summary", schema: { type: "string", system: "summary" } },
				{
					id: SPRINT_FIELD,
					name: "Sprint",
					schema: {
						type: "array",
						custom: "com.pyxis.greenhopper.jira:gh-sprint",
					},
				},
			];
		}
		if (request.method === "GET" && path === "/rest/agile/1.0/board/7/sprint") {
			const state = parsed.searchParams.get("state");
			return {
				isLast: true,
				values:
					state === "active"
						? (site.activeSprints ?? [])
						: (site.futureSprints ?? []),
			};
		}
		const sprintPath = path.match(/^\/rest\/agile\/1\.0\/sprint\/(\d+)$/);
		if (request.method === "GET" && sprintPath) {
			const sprint = site.sprints?.[sprintPath[1] ?? ""];
			if (!sprint) throw new Error("Jira answered 404");
			return sprint;
		}
		if (request.method === "POST" && path === "/rest/api/3/issue") {
			createdBody = request.body as { fields: Record<string, unknown> };
			return loadFixture("create-issue.json");
		}
		if (request.method === "PUT" && path.includes("/properties/")) {
			return null;
		}
		if (request.method === "GET" && path === "/rest/api/3/issue/DELIV-3") {
			return createdIssue();
		}
		throw new Error(`unexpected ${request.method} ${restPath(request.url)}`);
	});
	function createdIssue() {
		const issue = clone(loadFixture("issue-created.json")) as {
			fields: Record<string, unknown>;
		};
		issue.fields.issuelinks = [];
		const fields = createdBody?.fields ?? {};
		const assignee = fields.assignee as { accountId: string } | undefined;
		if (assignee) {
			issue.fields.assignee = {
				accountId: assignee.accountId,
				displayName:
					assignee.accountId === "acc-ada"
						? "Ada Lovelace"
						: site.users?.[assignee.accountId],
			};
		}
		const sprintId = fields[SPRINT_FIELD] as number | undefined;
		if (sprintId !== undefined) {
			issue.fields[SPRINT_FIELD] = [
				{ id: 30, name: "Sprint 11", state: "closed", boardId: 7 },
				{ ...sprintById(sprintId), boardId: 7 },
			];
		}
		const parent = fields.parent as { key: string } | undefined;
		if (parent) issue.fields.parent = { key: parent.key };
		return issue;
	}
	return {
		...recorded,
		createdFields: () => createdBody?.fields,
		posted: () =>
			recorded.requests.some(
				(request) =>
					request.method === "POST" &&
					new URL(request.url).pathname === "/rest/api/3/issue",
			),
		asked: (path: string) =>
			recorded.requests.some(
				(request) => new URL(request.url).pathname === path,
			),
	};
}

const PLACED_INPUT = {
	approved: true,
	auditId: "run-1:create",
	type: "story",
	title: "Create through the adapter",
	body: "Approved creation should stay idempotent.",
};

test("create assigns the item to the credentials' user by default and plans no sprint without a board", async () => {
	const site = placementSite();
	const item = WorkItem.parse(
		await runJiraTracker("create", envelope(PLACED_INPUT), site.deps),
	);
	expect(site.createdFields()).toMatchObject({
		assignee: { accountId: "acc-ada" },
	});
	expect(site.createdFields()).not.toHaveProperty(SPRINT_FIELD);
	expect(site.asked("/rest/api/3/field")).toBe(false);
	expect(item.assignee).toBe("Ada Lovelace");
	expect(item.sprint).toBeUndefined();
});

test("with a board, create plans the item into the board's one active sprint under its parent", async () => {
	const site = placementSite({
		activeSprints: [{ id: 37, name: "Sprint 12", state: "active" }],
	});
	const item = WorkItem.parse(
		await runJiraTracker(
			"create",
			envelope(
				{ ...PLACED_INPUT, parent: "DELIV-1" },
				{ settings: { project: PROJECT, board: "7" } },
			),
			site.deps,
		),
	);
	expect(site.createdFields()).toMatchObject({
		assignee: { accountId: "acc-ada" },
		[SPRINT_FIELD]: 37,
		parent: { key: "DELIV-1" },
	});
	expect(item).toMatchObject({
		assignee: "Ada Lovelace",
		sprint: "Sprint 12",
		parent: "DELIV-1",
	});
});

test("the assignee setting can leave the item unassigned or name one account", async () => {
	const unassigned = placementSite();
	const left = WorkItem.parse(
		await runJiraTracker(
			"create",
			envelope(PLACED_INPUT, {
				settings: { project: PROJECT, assignee: "none" },
			}),
			unassigned.deps,
		),
	);
	expect(unassigned.createdFields()).not.toHaveProperty("assignee");
	expect(unassigned.asked("/rest/api/3/myself")).toBe(false);
	expect(left.assignee).toBeUndefined();

	const named = placementSite({ users: { "acc-grace": "Grace Hopper" } });
	const assigned = WorkItem.parse(
		await runJiraTracker(
			"create",
			envelope(PLACED_INPUT, {
				settings: { project: PROJECT, assignee: "acc-grace" },
			}),
			named.deps,
		),
	);
	expect(named.createdFields()).toMatchObject({
		assignee: { accountId: "acc-grace" },
	});
	expect(assigned.assignee).toBe("Grace Hopper");
});

test("an unknown assignee or unusable sprint fails before anything is created", async () => {
	const cases: Array<{
		settings: Record<string, string>;
		site?: FakeJiraSite;
		error: RegExp;
	}> = [
		{ settings: { assignee: "acc-nobody" }, error: /Jira answered 404/ },
		{ settings: { assignee: "Ada Lovelace" }, error: /account id/ },
		{ settings: { board: "7" }, error: /board 7 has no active sprint/ },
		{
			settings: { board: "7" },
			site: {
				activeSprints: [
					{ id: 37, name: "Team A 12", state: "active" },
					{ id: 38, name: "Team B 12", state: "active" },
				],
			},
			error: /more than one active sprint: Team A 12 \(37\), Team B 12 \(38\)/,
		},
		{ settings: { board: "7", sprint: "next" }, error: /no future sprint/ },
		{ settings: { sprint: "active" }, error: /needs the board setting/ },
		{
			settings: { sprint: "30" },
			site: {
				sprints: { "30": { id: 30, name: "Sprint 11", state: "closed" } },
			},
			error: /sprint 30 is not open/,
		},
		{ settings: { sprint: "soon" }, error: /active, next, none/ },
	];
	for (const entry of cases) {
		const site = placementSite(entry.site);
		await expect(
			runJiraTracker(
				"create",
				envelope(PLACED_INPUT, {
					settings: { project: PROJECT, ...entry.settings },
				}),
				site.deps,
			),
		).rejects.toThrow(entry.error);
		expect(site.posted()).toBe(false);
	}
	const badParent = placementSite();
	await expect(
		runJiraTracker(
			"create",
			envelope({ ...PLACED_INPUT, parent: "epic one" }),
			badParent.deps,
		),
	).rejects.toThrow(/issue key/);
	expect(badParent.requests).toHaveLength(0);
});

test("the sprint setting can pick the board's next sprint or one sprint id", async () => {
	const next = placementSite({
		futureSprints: [
			{ id: 38, name: "Sprint 13", state: "future" },
			{ id: 39, name: "Sprint 14", state: "future" },
		],
	});
	const planned = WorkItem.parse(
		await runJiraTracker(
			"create",
			envelope(PLACED_INPUT, {
				settings: { project: PROJECT, board: "7", sprint: "next" },
			}),
			next.deps,
		),
	);
	expect(next.createdFields()).toMatchObject({ [SPRINT_FIELD]: 38 });
	expect(planned.sprint).toBe("Sprint 13");

	const chosen = placementSite({
		sprints: { "41": { id: 41, name: "Hardening", state: "future" } },
	});
	const pinned = WorkItem.parse(
		await runJiraTracker(
			"create",
			envelope(PLACED_INPUT, {
				settings: { project: PROJECT, sprint: "41" },
			}),
			chosen.deps,
		),
	);
	expect(chosen.createdFields()).toMatchObject({ [SPRINT_FIELD]: 41 });
	expect(pinned.sprint).toBe("Hardening");
});

test("a replayed create returns the item without re-placing it, and refuses another parent", async () => {
	const site = placementSite({
		activeSprints: [{ id: 37, name: "Sprint 12", state: "active" }],
	});
	const settings = { settings: { project: PROJECT, board: "7" } };
	const input = { ...PLACED_INPUT, parent: "DELIV-1" };
	await runJiraTracker("create", envelope(input, settings), site.deps);
	const before = site.requests.length;
	const replayed = WorkItem.parse(
		await runJiraTracker("create", envelope(input, settings), site.deps),
	);
	expect(replayed.ref).toBe("DELIV-3");
	const replayPaths = site.requests
		.slice(before)
		.map((request) => `${request.method} ${new URL(request.url).pathname}`);
	expect(replayPaths.some((path) => !path.startsWith("GET"))).toBe(false);
	expect(
		replayPaths.some(
			(path) =>
				path.includes("/myself") ||
				path.includes("/agile/") ||
				path.endsWith("/field"),
		),
	).toBe(false);
	await expect(
		runJiraTracker(
			"create",
			envelope({ ...input, parent: "DELIV-2" }, settings),
			site.deps,
		),
	).rejects.toThrow(/different work-item content/);
	expect(
		WorkItem.parse(
			await runJiraTracker(
				"create",
				envelope(PLACED_INPUT, settings),
				site.deps,
			),
		).ref,
	).toBe("DELIV-3");
});

test("read reports the assignee and parent Jira returns", async () => {
	const issue = clone(loadFixture("issue-deliv-1.json")) as {
		key: string;
		fields: Record<string, unknown>;
	};
	issue.fields.assignee = { accountId: "acc-ada", displayName: "Ada Lovelace" };
	issue.fields.parent = { key: "DELIV-40" };
	const { deps } = recordingDeps(() => issue);
	expect(
		WorkItem.parse(
			await runJiraTracker("read", envelope({ ref: issue.key }), deps),
		),
	).toMatchObject({ assignee: "Ada Lovelace", parent: "DELIV-40" });
});
