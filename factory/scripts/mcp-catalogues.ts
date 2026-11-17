export type McpCapabilityId =
	| "forge.change"
	| "review.publish"
	| "tracker.item";

export interface McpOperationBinding {
	tools: readonly string[];
	arguments?: Record<string, unknown>;
}

export interface McpFamilyCatalogue {
	provider: string;
	kind: "forge" | "tracker";
	capabilities: readonly McpCapabilityId[];
	servers: readonly string[];
	forbidden: readonly string[];
	operations: Record<string, McpOperationBinding>;
}

const GITLAB_FORGE_OPERATIONS: Record<string, McpOperationBinding> = {
	find: {
		tools: ["gitlab_list_merge_requests", "list_mrs", "search_merge_requests"],
		arguments: { source_branch: "{{sourceBranch}}", state: "opened" },
	},
	read: {
		tools: [
			"get_merge_request",
			"gitlab_get_merge_request",
			"get_mr",
			"getMergeRequest",
		],
		arguments: { merge_request_iid: "{{ref}}", iid: "{{ref}}" },
	},
	pipeline: {
		tools: [
			"list_pipelines",
			"get_pipeline_jobs",
			"get_commit_statuses",
			"gitlab_list_pipelines",
		],
		arguments: { sha: "{{revision}}", ref: "{{revision}}" },
	},
	files: {
		tools: [
			"get_merge_request_diffs",
			"list_merge_request_diffs",
			"gitlab_get_merge_request_diffs",
			"list_mr_files",
		],
		arguments: { merge_request_iid: "{{ref}}", iid: "{{ref}}" },
	},
	diff: {
		tools: [
			"get_merge_request_diffs",
			"get_merge_request_diff",
			"gitlab_get_merge_request_diffs",
		],
		arguments: { merge_request_iid: "{{ref}}", iid: "{{ref}}" },
	},
	commits: {
		tools: [
			"get_merge_request_commits",
			"list_merge_request_commits",
			"gitlab_get_merge_request_commits",
		],
		arguments: { merge_request_iid: "{{ref}}", iid: "{{ref}}" },
	},
	discussions: {
		tools: [
			"list_merge_request_notes",
			"get_merge_request_notes",
			"list_merge_request_discussions",
			"gitlab_list_merge_request_notes",
		],
		arguments: { merge_request_iid: "{{ref}}", iid: "{{ref}}" },
	},
	anchors: {
		tools: [
			"get_merge_request_diffs",
			"list_merge_request_diffs",
			"gitlab_get_merge_request_diffs",
		],
		arguments: { merge_request_iid: "{{ref}}", iid: "{{ref}}" },
	},
	create: {
		tools: [
			"create_merge_request",
			"gitlab_create_merge_request",
			"createMergeRequest",
		],
		arguments: {
			title: "{{title}}",
			source_branch: "{{sourceBranch}}",
			target_branch: "{{targetBranch}}",
			description: "{{description}}",
			draft: true,
			squash: true,
		},
	},
	"set-draft": {
		tools: [
			"update_merge_request",
			"gitlab_update_merge_request",
			"updateMergeRequest",
		],
		arguments: {
			merge_request_iid: "{{ref}}",
			iid: "{{ref}}",
			draft: "{{draft}}",
		},
	},
	note: {
		tools: [
			"create_merge_request_note",
			"create_note",
			"gitlab_create_merge_request_note",
			"add_merge_request_note",
		],
		arguments: {
			merge_request_iid: "{{ref}}",
			iid: "{{ref}}",
			body: "{{body}}",
		},
	},
	reply: {
		tools: [
			"create_merge_request_note",
			"reply_to_discussion",
			"create_merge_request_thread_note",
			"gitlab_create_merge_request_note",
		],
		arguments: {
			merge_request_iid: "{{ref}}",
			iid: "{{ref}}",
			discussion_id: "{{discussionId}}",
			body: "{{body}}",
		},
	},
};

const GITHUB_FORGE_OPERATIONS: Record<string, McpOperationBinding> = {
	find: {
		tools: ["list_pull_requests", "list_prs", "search_pull_requests"],
		arguments: { head: "{{sourceBranch}}", state: "open" },
	},
	read: {
		tools: ["get_pull_request", "get_pr", "getPullRequest"],
		arguments: { pull_number: "{{ref}}", pullNumber: "{{ref}}" },
	},
	pipeline: {
		tools: [
			"get_check_runs",
			"list_check_runs",
			"get_commit_status",
			"list_workflow_runs",
		],
		arguments: { ref: "{{revision}}", sha: "{{revision}}" },
	},
	files: {
		tools: ["get_pull_request_files", "list_pull_request_files"],
		arguments: { pull_number: "{{ref}}" },
	},
	diff: {
		tools: ["get_pull_request_diff", "get_pull_request_files"],
		arguments: { pull_number: "{{ref}}" },
	},
	commits: {
		tools: ["get_pull_request_commits", "list_pull_request_commits"],
		arguments: { pull_number: "{{ref}}" },
	},
	discussions: {
		tools: [
			"get_pull_request_comments",
			"list_pull_request_comments",
			"get_review_comments",
		],
		arguments: { pull_number: "{{ref}}" },
	},
	anchors: {
		tools: ["get_pull_request_files", "get_pull_request_diff"],
		arguments: { pull_number: "{{ref}}" },
	},
	create: {
		tools: ["create_pull_request", "createPullRequest"],
		arguments: {
			title: "{{title}}",
			head: "{{sourceBranch}}",
			base: "{{targetBranch}}",
			body: "{{description}}",
			draft: true,
		},
	},
	"set-draft": {
		tools: [
			"update_pull_request",
			"mark_pull_request_ready",
			"convert_to_draft",
		],
		arguments: { pull_number: "{{ref}}", draft: "{{draft}}" },
	},
	note: {
		tools: [
			"add_issue_comment",
			"create_pull_request_review_comment",
			"add_comment_to_pending_review",
		],
		arguments: { pull_number: "{{ref}}", body: "{{body}}" },
	},
	reply: {
		tools: [
			"create_pull_request_review_comment",
			"reply_to_review_comment",
			"add_comment_to_pending_review",
		],
		arguments: {
			pull_number: "{{ref}}",
			in_reply_to: "{{discussionId}}",
			body: "{{body}}",
		},
	},
};

export const MCP_CATALOGUES: readonly McpFamilyCatalogue[] = [
	{
		provider: "gitlab",
		kind: "forge",
		capabilities: ["forge.change", "review.publish"],
		servers: ["gitlab", "mcp-gitlab"],
		forbidden: [
			"merge_merge_request",
			"accept_merge_request",
			"merge_mr",
			"close_merge_request",
			"approve_merge_request",
			"resolve_discussion",
			"delete_merge_request",
		],
		operations: GITLAB_FORGE_OPERATIONS,
	},
	{
		provider: "github",
		kind: "forge",
		capabilities: ["forge.change", "review.publish"],
		servers: ["github", "mcp-github"],
		forbidden: [
			"merge_pull_request",
			"merge_pr",
			"close_pull_request",
			"create_pull_request_review",
			"submit_pending_pull_request_review",
			"delete_pending_pull_request_review",
		],
		operations: GITHUB_FORGE_OPERATIONS,
	},
	{
		provider: "gitlab",
		kind: "tracker",
		capabilities: ["tracker.item"],
		servers: ["gitlab", "mcp-gitlab"],
		forbidden: ["close_issue", "delete_issue", "update_issue_state"],
		operations: {
			list: {
				tools: ["list_issues", "gitlab_list_issues"],
				arguments: { state: "opened" },
			},
			read: {
				tools: ["get_issue", "gitlab_get_issue", "getIssue"],
				arguments: { iid: "{{ref}}", issue_iid: "{{ref}}" },
			},
			create: {
				tools: ["create_issue", "gitlab_create_issue", "createIssue"],
				arguments: { title: "{{title}}", description: "{{body}}" },
			},
			link: {
				tools: ["create_issue_link", "link_issues", "gitlab_create_issue_link"],
				arguments: { issue_iid: "{{ref}}", target_issue_iid: "{{blockedBy}}" },
			},
			note: {
				tools: ["create_issue_note", "add_issue_comment", "gitlab_create_note"],
				arguments: { iid: "{{ref}}", issue_iid: "{{ref}}", body: "{{body}}" },
			},
		},
	},
	{
		provider: "github",
		kind: "tracker",
		capabilities: ["tracker.item"],
		servers: ["github", "mcp-github"],
		forbidden: ["close_issue", "delete_issue"],
		operations: {
			list: {
				tools: ["list_issues", "list_repository_issues"],
				arguments: { state: "open" },
			},
			read: {
				tools: ["get_issue", "get_repository_issue"],
				arguments: { issue_number: "{{ref}}" },
			},
			create: {
				tools: ["create_issue", "create_repository_issue"],
				arguments: { title: "{{title}}", body: "{{body}}" },
			},
			link: {
				tools: ["add_issue_comment"],
				arguments: {
					issue_number: "{{ref}}",
					body: "Blocked by {{blockedBy}}",
				},
			},
			note: {
				tools: ["add_issue_comment"],
				arguments: { issue_number: "{{ref}}", body: "{{body}}" },
			},
		},
	},
	{
		provider: "jira",
		kind: "tracker",
		capabilities: ["tracker.item"],
		servers: ["atlassian", "jira", "mcp-atlassian"],
		forbidden: [
			"transitionJiraIssue",
			"transition_jira_issue",
			"transition_issue",
			"executeDestructive",
			"delete_issue",
			"assign_issue",
		],
		operations: {
			list: {
				tools: [
					"searchJiraIssuesUsingJql",
					"search_jira_issues_using_jql",
					"jira_search",
				],
				arguments: {
					jql: "project = {{settings.project}} ORDER BY created DESC",
					maxResults: 50,
					view: "evidence",
				},
			},
			read: {
				tools: ["getJiraIssue", "get_jira_issue", "jira_get_issue"],
				arguments: { issueIdOrKey: "{{ref}}", view: "evidence" },
			},
			create: {
				tools: ["createJiraIssue", "create_jira_issue", "jira_create_issue"],
				arguments: {
					projectKey: "{{settings.project}}",
					summary: "{{title}}",
					description: "{{body}}",
					issueType: "Story",
				},
			},
			link: {
				tools: [
					"addGraphContext",
					"create_issue_link",
					"jira_create_issue_link",
				],
				arguments: {
					relationshipType: "jira-work-item-blocks-jira-work-item",
					objectIdentifier: "{{blockedBy}}",
					targetObjectIdentifier: "{{ref}}",
				},
			},
			note: {
				tools: [
					"addOrEditJiraIssueComment",
					"add_comment",
					"jira_add_comment",
					"create_jira_comment",
				],
				arguments: { issueIdOrKey: "{{ref}}", commentBody: "{{body}}" },
			},
		},
	},
];
