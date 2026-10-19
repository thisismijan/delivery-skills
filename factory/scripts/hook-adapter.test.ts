import { expect, setDefaultTimeout, test } from "bun:test";
import { join } from "node:path";

setDefaultTimeout(20_000);

const hook = join(import.meta.dir, "commit-guard.ts");

async function runHook(stdin: string): Promise<Record<string, unknown>> {
	const proc = Bun.spawn(["bun", hook], {
		stdin: new Blob([stdin]).stream(),
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	await proc.exited;
	return JSON.parse(stdout) as Record<string, unknown>;
}

function denyReason(payload: Record<string, unknown>): string {
	const output = payload.hookSpecificOutput as Record<string, unknown>;
	expect(output.hookEventName).toBe("PreToolUse");
	expect(output.permissionDecision).toBe("deny");
	expect(typeof output.permissionDecisionReason).toBe("string");
	return String(output.permissionDecisionReason);
}

test("forbidden command payload denies with the human-owned reason", async () => {
	const payload = await runHook(
		JSON.stringify({ tool_input: { command: "gh pr merge 12" } }),
	);
	expect(denyReason(payload)).toMatch(/merge/i);
});

test("malformed payload denies", async () => {
	const payload = await runHook("not-json");
	expect(denyReason(payload)).toMatch(/malformed/i);
});

test("command-less payload denies", async () => {
	const payload = await runHook(JSON.stringify({ tool_input: {} }));
	expect(denyReason(payload)).toMatch(/command/i);
});

async function runCursorHook(stdin: string): Promise<Record<string, unknown>> {
	const proc = Bun.spawn(["bun", hook, "--protocol", "cursor"], {
		stdin: new Blob([stdin]).stream(),
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	await proc.exited;
	return JSON.parse(stdout) as Record<string, unknown>;
}

test("Cursor shell payload denies a human-owned merge", async () => {
	const payload = await runCursorHook(
		JSON.stringify({ command: "gh pr merge 12", cwd: "/repo", sandbox: false }),
	);
	expect(payload).toMatchObject({
		permission: "deny",
	});
	expect(String(payload.agent_message)).toMatch(/merge/i);
});

test("Cursor MCP payload denies a Jira status transition", async () => {
	const payload = await runCursorHook(
		JSON.stringify({
			tool_name: "transitionJiraIssue",
			tool_input: { issueId: "DEL-1" },
			mcp_server_name: "atlassian",
		}),
	);
	expect(payload.permission).toBe("deny");
});

test("Cursor allow responses are valid permission JSON", async () => {
	const payload = await runCursorHook(
		JSON.stringify({ command: "git status", cwd: "/repo" }),
	);
	expect(payload).toEqual({ permission: "allow" });
});
