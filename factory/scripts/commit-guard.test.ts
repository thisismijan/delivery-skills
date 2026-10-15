import { describe, expect, test } from "bun:test";
import { isAttributionViolation } from "./commit-guard";

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
