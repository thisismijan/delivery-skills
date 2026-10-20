import { describe, expect, test } from "bun:test";
import { isAttributionViolation, isForbiddenMutation } from "./commit-guard";

describe("commit-guard", () => {
	test("blocks git commit -m carrying a Co-Authored-By trailer", () => {
		const cmd =
			'git commit -m "feat: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>"';
		const r = isAttributionViolation(cmd);
		expect(r.blocked).toBe(true);
		expect(r.reason).toContain("Co-Authored-By");
	});

	test("blocks a heredoc commit with the Generated with Claude line", () => {
		const cmd =
			"git commit -F - <<EOF\nfix: bug\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\nEOF";
		expect(isAttributionViolation(cmd).blocked).toBe(true);
	});

	test("blocks an MR create whose description attributes to Claude", () => {
		const cmd =
			'glab mr create --title "x" --description "Body.\n\nCo-authored-by: Claude"';
		expect(isAttributionViolation(cmd).blocked).toBe(true);
	});

	test("blocks gh pr create with a Generated with line", () => {
		const cmd =
			'gh pr create --body "summary\n\n🤖 Generated with Claude Code"';
		expect(isAttributionViolation(cmd).blocked).toBe(true);
	});

	test("matching is case-insensitive", () => {
		const cmd = 'git commit -m "x\n\nCO-AUTHORED-BY: claude"';
		expect(isAttributionViolation(cmd).blocked).toBe(true);
	});

	test("allows a clean commit", () => {
		const cmd = 'git commit -m "feat: add the thing\n\nExplains why."';
		expect(isAttributionViolation(cmd).blocked).toBe(false);
	});

	test.each([
		"git commit -F message.txt",
		"git commit --file=message.txt",
		"git merge --file merge-message.txt topic",
		"gh pr create --body-file description.md",
		"glab mr create --description-file=description.md",
	])("fails closed when human-facing text is loaded from a file: %s", (cmd) => {
		const result = isAttributionViolation(cmd);
		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("cannot inspect");
	});

	test("does not block reads that merely mention the trailer", () => {
		// git log / grep are not write commands; never blocked even if the text appears.
		expect(
			isAttributionViolation('git log --grep "Co-Authored-By"').blocked,
		).toBe(false);
		expect(isAttributionViolation('grep -r "co-authored-by:" .').blocked).toBe(
			false,
		);
	});

	test("allows an unrelated command containing the words", () => {
		expect(
			isAttributionViolation('echo "co-authored-by: someone"').blocked,
		).toBe(false);
	});

	test("empty command is allowed", () => {
		expect(isAttributionViolation("").blocked).toBe(false);
	});
});

describe("mutation guard", () => {
	test.each([
		"glab mr merge 12",
		"glab mr close 12",
		"git push --force origin main",
		"git push --force-with-lease origin topic",
		"git reset --hard HEAD~1",
		"transitionJiraIssue",
		"accept_merge_request",
		'save_merge_request_review {"method":"approve"}',
		'save_merge_request_review {"method":"resolve_discussion"}',
		'save_merge_request {"state_event":"close"}',
		'save_work_item {"state":"closed"}',
		'executeWrite {"name":"editJiraIssue"}',
		'executeDestructive {"name":"deleteJiraIssue"}',
	])("blocks %s", (command) => {
		expect(isForbiddenMutation(command).blocked).toBe(true);
	});

	test.each([
		"glab mr create --draft",
		"glab mr update 12 --ready",
		"git push -u origin topic",
		'git commit -m "fix: safe"',
		'createJiraIssue {"projectKey":"DEL"}',
		'addOrEditJiraIssueComment {"issueIdOrKey":"DEL-1"}',
		'addGraphContext {"objectIdentifier":"DEL-1"}',
		'save_merge_request {"title":"Draft: safe change"}',
	])("allows %s", (command) => {
		expect(isForbiddenMutation(command).blocked).toBe(false);
	});
});
