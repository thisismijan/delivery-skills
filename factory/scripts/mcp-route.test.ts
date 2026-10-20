import { expect, test } from "bun:test";
import {
	interpolateArguments,
	planMcpOperation,
	routeMcpInventory,
	toolKeys,
	trackerProvidersFromMcp,
} from "./mcp-route";

const recordedAt = "2026-10-20T09:00:00.000Z";

test("tool keys ignore host prefixes and punctuation", () => {
	expect(toolKeys("mcp__Atlassian__getJiraIssue")).toContain("getjiraissue");
	expect(toolKeys("gitlab_get_merge_request")).toContain("getmergerequest");
});

test("Atlassian session tools cover the Jira tracker without CLI adapters", () => {
	const route = routeMcpInventory({
		version: 1,
		recordedAt,
		tools: [
			{ server: "Atlassian", name: "getJiraIssue", status: "ready" },
			{
				server: "Atlassian",
				name: "searchJiraIssuesUsingJql",
				status: "ready",
			},
			{ server: "Atlassian", name: "createJiraIssue", status: "ready" },
			{ server: "Atlassian", name: "addGraphContext", status: "ready" },
			{
				server: "Atlassian",
				name: "addOrEditJiraIssueComment",
				status: "ready",
			},
			{ server: "Atlassian", name: "transitionJiraIssue", status: "ready" },
		],
	});
	expect(trackerProvidersFromMcp(route)).toEqual(["jira"]);
	const read = planMcpOperation({
		route,
		kind: "tracker",
		operation: "read",
		provider: "jira",
		input: { ref: "DEL-12", settings: { project: "DEL" } },
	});
	expect(read?.tool.name).toBe("getJiraIssue");
	expect(read?.arguments).toMatchObject({ issueIdOrKey: "DEL-12" });
	expect(
		planMcpOperation({
			route,
			kind: "tracker",
			operation: "note",
			provider: "jira",
		})?.tool.name,
	).toBe("addOrEditJiraIssueComment");
	expect(
		JSON.stringify(
			planMcpOperation({
				route,
				kind: "tracker",
				operation: "read",
				provider: "jira",
			}),
		),
	).not.toMatch(/transition/i);
});

test("GitLab session tools plan merge-request reads and refuse merge tools", () => {
	const route = routeMcpInventory({
		version: 1,
		recordedAt,
		tools: [
			{ server: "GitLab", name: "get_merge_request", status: "ready" },
			{ server: "GitLab", name: "create_merge_request", status: "ready" },
			{ server: "GitLab", name: "merge_merge_request", status: "ready" },
		],
	});
	const family = route.families.find(
		(entry) => entry.provider === "gitlab" && entry.kind === "forge",
	);
	expect(family?.operations.read?.tool.name).toBe("get_merge_request");
	expect(family?.operations.create?.tool.name).toBe("create_merge_request");
	expect(JSON.stringify(family?.operations)).not.toMatch(/merge_merge_request/);
});

test("unauthenticated servers stay unavailable", () => {
	const route = routeMcpInventory({
		version: 1,
		recordedAt,
		tools: [{ server: "GitLab", name: "mcp_auth", status: "needs-auth" }],
	});
	const family = route.families.find((entry) => entry.provider === "gitlab");
	expect(family?.authenticated).toBe(false);
	expect(trackerProvidersFromMcp(route)).toEqual([]);
});

test("argument templates copy portable fields", () => {
	expect(
		interpolateArguments(
			{
				issueIdOrKey: "{{ref}}",
				jql: "project = {{settings.project}} ORDER BY created DESC",
			},
			{ ref: "DEL-1", settings: { project: "DEL" } },
		),
	).toEqual({
		issueIdOrKey: "DEL-1",
		jql: "project = DEL ORDER BY created DESC",
	});
});
