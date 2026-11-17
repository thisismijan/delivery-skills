import { describe, expect, test } from "bun:test";
import {
	type GuardProtocol,
	commandFromPayload,
	evaluateCommand,
	formatGuardStdout,
	isAttributionViolation,
	isForbiddenMutation,
	parseGuardProtocol,
} from "./commit-guard";

const blocked = (command: string) => isAttributionViolation(command).blocked;

describe("attribution in commit and merge request text", () => {
	test("a Co-Authored-By trailer in git commit -m is refused and named", () => {
		const verdict = isAttributionViolation(
			'git commit -m "feat: thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>"',
		);
		expect(verdict.blocked).toBe(true);
		expect(verdict.reason).toContain("Co-Authored-By");
	});

	test.each([
		[
			"a heredoc commit with a Generated with Claude line",
			"git commit -F - <<EOF\nfix: bug\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\nEOF",
		],
		[
			"a merge request description crediting Claude",
			'glab mr create --title "x" --description "Body.\n\nCo-authored-by: Claude"',
		],
		[
			"a pull request body with a Generated with line",
			'gh pr create --body "summary\n\n🤖 Generated with Claude Code"',
		],
		["an upper-case trailer", 'git commit -m "x\n\nCO-AUTHORED-BY: claude"'],
	])("refuses %s", (_label, command) => {
		expect(blocked(command)).toBe(true);
	});

	test.each([
		"git commit -F message.txt",
		"git commit --file=message.txt",
		"git merge --file merge-message.txt topic",
		"gh pr create --body-file description.md",
		"glab mr create --description-file=description.md",
	])("refuses text it cannot read from a file: %s", (command) => {
		const verdict = isAttributionViolation(command);
		expect(verdict.blocked).toBe(true);
		expect(verdict.reason).toContain("cannot inspect");
	});

	test.each([
		["a clean commit", 'git commit -m "feat: add the thing\n\nExplains why."'],
		["a log search for the trailer", 'git log --grep "Co-Authored-By"'],
		["a grep for the trailer", 'grep -r "co-authored-by:" .'],
		["an echo of the words", 'echo "co-authored-by: someone"'],
		["an empty command", ""],
	])("allows %s", (_label, command) => {
		expect(blocked(command)).toBe(false);
	});
});

describe("human-owned and destructive mutations", () => {
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
	])("refuses %s", (command) => {
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

describe("evaluateCommand", () => {
	test("reports a forbidden mutation before any attribution problem", () => {
		const verdict = evaluateCommand(
			'glab mr merge 12 && git commit -m "x\n\nCo-Authored-By: Claude"',
		);
		expect(verdict.blocked).toBe(true);
		expect(verdict.reason).toMatch(/human-owned/);
	});

	test("falls through to the attribution check", () => {
		const verdict = evaluateCommand('git commit -m "x\n\nCo-Authored-By: Bot"');
		expect(verdict.reason).toContain("Co-Authored-By");
	});

	test("allows a harmless command", () => {
		expect(evaluateCommand("git status")).toEqual({ blocked: false });
	});
});

describe("hook payloads", () => {
	test.each([
		["a shell tool_input", { tool_input: { command: "ls" } }, "ls"],
		["a JSON-encoded tool_input", { tool_input: '{"command":"ls"}' }, "ls"],
		["a top-level command", { command: "ls", cwd: "/repo" }, "ls"],
		[
			"a Bash tool call",
			{ tool_name: "Bash", tool_input: { command: "ls" } },
			"ls",
		],
		[
			"an MCP call, judged by name and input",
			{ tool_name: "transitionJiraIssue", tool_input: { issueId: "DEL-1" } },
			'transitionJiraIssue {"issueId":"DEL-1"}',
		],
		[
			"an MCP call with no input",
			{ tool_name: "accept_merge_request" },
			"accept_merge_request {}",
		],
	])("reads %s", (_label, payload, command) => {
		expect(commandFromPayload(JSON.stringify(payload))).toEqual({
			ok: true,
			command,
		});
	});

	test.each(["not-json", "null", ""])(
		"refuses the malformed payload %p",
		(raw) => {
			const parsed = commandFromPayload(raw);
			expect(parsed.ok).toBe(false);
			if (!parsed.ok) expect(parsed.reason).toMatch(/malformed/i);
		},
	);

	test.each([{}, { tool_input: {} }, { command: "" }, { tool_input: "nope" }])(
		"refuses %j because it carries no command",
		(payload) => {
			const parsed = commandFromPayload(JSON.stringify(payload));
			expect(parsed.ok).toBe(false);
			if (!parsed.ok) expect(parsed.reason).toMatch(/command/i);
		},
	);
});

describe("hook protocols", () => {
	test.each<[string[], GuardProtocol]>([
		[[], "claude"],
		[["--protocol", "cursor"], "cursor"],
		[["--protocol", "other"], "claude"],
		[["--protocol"], "claude"],
	])("%j selects %s", (argv, protocol) => {
		expect(parseGuardProtocol(argv)).toBe(protocol);
	});

	const refusal = { blocked: true, reason: "no" };

	test("Claude Code gets a PreToolUse denial or nothing", () => {
		expect(JSON.parse(formatGuardStdout("claude", refusal))).toEqual({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: "no",
			},
		});
		expect(formatGuardStdout("claude", { blocked: false })).toBe("");
	});

	test("Cursor always gets a permission decision", () => {
		expect(JSON.parse(formatGuardStdout("cursor", refusal))).toEqual({
			permission: "deny",
			user_message: "no",
			agent_message: "no",
		});
		expect(JSON.parse(formatGuardStdout("cursor", { blocked: false }))).toEqual(
			{ permission: "allow" },
		);
	});

	test("a refusal without a reason still explains itself", () => {
		const stdout = formatGuardStdout("cursor", { blocked: true });
		expect(JSON.parse(stdout).agent_message).toBe("Command refused.");
	});
});
