import { expect, test } from "bun:test";
import { parseForgeOperationResult } from "./forge-provider";
import { mapMcpForgeResult, mapMcpWorkItemResult } from "./mcp-normalize";
import { WorkItem } from "./work-item-provider";

test("maps a GitLab merge request payload onto a portable change", () => {
	const mapped = mapMcpForgeResult({
		provider: "gitlab",
		operation: "read",
		raw: {
			iid: 47,
			state: "opened",
			draft: true,
			source_branch: "cursor/mcp-provider-transport-327b",
			target_branch: "main",
			title: "Draft: Use session tools",
			description: "prefer host tools",
			author: { name: "operator" },
			web_url: "https://gitlab.example/group/project/-/merge_requests/47",
			sha: "abc123def",
			diff_refs: { head_sha: "abc123def" },
		},
		input: { ref: "47" },
	});
	const change = parseForgeOperationResult("read", mapped);
	expect(change).toMatchObject({
		provider: "gitlab",
		ref: "47",
		state: "open",
		draft: true,
		branches: {
			source: "cursor/mcp-provider-transport-327b",
			target: "main",
		},
	});
});

test("maps a Jira issue payload onto a portable work item", () => {
	const item = WorkItem.parse(
		mapMcpWorkItemResult({
			provider: "jira",
			operation: "read",
			raw: {
				key: "DEL-9",
				fields: {
					summary: "Record session tools",
					description: "Use Atlassian tools when present",
					issuetype: { name: "Story" },
					issuelinks: [],
				},
			},
		}),
	);
	expect(item).toMatchObject({
		provider: "jira",
		ref: "DEL-9",
		type: "story",
		title: "Record session tools",
	});
});

test("review evidence is bound to the preceding change head", () => {
	const raw = [
		{
			filename: "src/cart.ts",
			status: "modified",
			additions: 4,
			deletions: 1,
		},
	];
	expect(() =>
		mapMcpForgeResult({
			provider: "github",
			operation: "files",
			raw,
			input: { ref: "12" },
		}),
	).toThrow(/headRevision/);
	expect(
		parseForgeOperationResult(
			"files",
			mapMcpForgeResult({
				provider: "github",
				operation: "files",
				raw,
				input: { ref: "12", headRevision: "abc123" },
			}),
		),
	).toMatchObject({
		ref: "12",
		headRevision: "abc123",
	});
});
