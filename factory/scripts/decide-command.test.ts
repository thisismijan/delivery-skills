import { describe, expect, test } from "bun:test";
import { decideCommand } from "./commit-guard";

describe("decideCommand", () => {
	test.each([
		["glab mr merge 12", /merge/i],
		["glab mr close 12", /close/i],
		["gh pr merge 12", /merge/i],
		["gh pr close 12", /close/i],
		[
			"glab api --method POST projects/acme/demo/merge_requests/12/merge",
			/merge/i,
		],
		[
			"glab api -X PUT projects/acme/demo/merge_requests/12?state_event=close",
			/close/i,
		],
		["gh api -X PUT repos/acme/demo/pulls/12/merge", /merge/i],
		[
			"gh api --method PATCH repos/acme/demo/pulls/12 --raw-field state=closed",
			/close/i,
		],
	])("blocks merge or close via %s", (command, reason) => {
		const result = decideCommand(command);
		expect(result.blocked).toBe(true);
		expect(result.reason).toMatch(reason);
		expect(result.reason).toMatch(/human-owned/i);
	});

	test.each([
		"transitionJiraIssue KEY-1",
		"editJiraIssue KEY-1",
		"curl -X POST https://acme.atlassian.net/rest/api/3/issue",
		"curl --request PUT https://jira.example/rest/api/2/issue/KEY-1",
		"curl -XPOST https://acme.atlassian.net/rest/api/3/issue/KEY-1/transitions",
	])("blocks Jira mutation %s", (command) => {
		expect(decideCommand(command).blocked).toBe(true);
	});

	test.each([
		"git push --force origin main",
		"git push -f origin topic",
		"git push --force-with-lease origin topic",
		"git push --force-if-includes origin topic",
		"git push origin +main",
		"git push origin +refs/heads/topic:refs/heads/topic",
		"git reset --hard HEAD~1",
	])("blocks force-push or hard reset %s", (command) => {
		expect(decideCommand(command).blocked).toBe(true);
	});

	test.each([
		"glab mr view 12",
		"glab api projects/acme/demo/merge_requests/12",
		"glab api --method GET projects/acme/demo/merge_requests/12",
		"gh pr view 12",
		"gh api repos/acme/demo/pulls/12",
		"curl https://acme.atlassian.net/rest/api/3/issue/KEY-1",
		"curl -X GET https://jira.example/rest/api/3/issue/KEY-1/transitions",
		"git push -u origin topic",
		"glab mr create --draft",
	])("allows read-only %s", (command) => {
		expect(decideCommand(command).blocked).toBe(false);
	});

	test("allows planned Jira creation while keeping status changes human-owned", () => {
		expect(decideCommand('createJiraIssue {"projectKey":"DEL"}').blocked).toBe(
			false,
		);
	});
});
