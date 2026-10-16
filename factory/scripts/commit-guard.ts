// Deterministic guard: blocks any git commit / MR / PR command whose message or
// description carries an AI/tool attribution trailer. Runs as a PreToolUse(Bash)
// hook shipped with the plugin, so it fires in every target repo that enables it.
// Enforces the "Never add Co-Authored-By / Generated with" rule in CLAUDE.md at the
// tool boundary, where prose instructions cannot be trusted to hold.

export interface GuardResult {
	blocked: boolean;
	reason?: string;
}

const WRITE_COMMAND =
	/\bgit\s+commit\b|\bgit\s+merge\b|\b(?:glab\s+mr|gh\s+pr)\b/i;

const ATTRIBUTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	{ pattern: /co-authored-by:/i, label: "a Co-Authored-By trailer" },
	{
		pattern: /generated with \[?claude/i,
		label: 'a "Generated with Claude" line',
	},
	{
		pattern: /🤖\s*generated with/i,
		label: 'a "Generated with" attribution line',
	},
];

export function isAttributionViolation(command: string): GuardResult {
	if (!command || !WRITE_COMMAND.test(command)) return { blocked: false };
	for (const { pattern, label } of ATTRIBUTION_PATTERNS) {
		if (pattern.test(command)) {
			return {
				blocked: true,
				reason: `This commit/MR command includes ${label}. CLAUDE.md forbids attributing commits or MR descriptions to Claude, any AI, or any tool. Remove the attribution line and run the command again.`,
			};
		}
	}
	return { blocked: false };
}

const MERGE_CLOSE_REASON = "Merge and close are human-owned actions.";
const JIRA_REASON = "Jira status and destructive changes are human-owned actions.";
const FORCE_REASON = "Force-pushing is not permitted.";
const RESET_REASON = "Destructive hard resets are not permitted.";

const MUTATING_METHOD =
	/(?:--method|-X|--request)\s*(POST|PUT|PATCH|DELETE)\b/i;

function hasMutatingMethod(command: string): boolean {
	return MUTATING_METHOD.test(command);
}

function isMergeCloseApi(command: string): boolean {
	if (!/\b(?:glab|gh)\s+api\b/i.test(command)) return false;
	if (!hasMutatingMethod(command)) return false;
	if (/merge_requests\/[^\s/?]+\/merge(?:\b|\/|\?|"|$)/i.test(command)) {
		return true;
	}
	if (/pulls\/[^\s/?]+\/merge(?:\b|\/|\?|"|$)/i.test(command)) return true;
	if (
		/merge_requests\//i.test(command) &&
		/(?:state_event=close|\bclose\b)/i.test(command)
	) {
		return true;
	}
	if (/pulls\//i.test(command) && /(?:state=closed|\bclose\b)/i.test(command)) {
		return true;
	}
	return false;
}

function isJiraMutationApi(command: string): boolean {
	if (!hasMutatingMethod(command)) return false;
	return /\/rest\/api\/\d+\/issues?(?:\/|\?|$)/i.test(command);
}

const COMMAND_DENY_LIST: Array<{ pattern: RegExp; reason: string }> = [
	{
		pattern: /\bglab\s+mr\s+(?:merge|close)\b/i,
		reason: MERGE_CLOSE_REASON,
	},
	{
		pattern: /\bgh\s+pr\s+(?:merge|close)\b/i,
		reason: MERGE_CLOSE_REASON,
	},
	{
		pattern:
			/\bgit\s+push\b[^\n]*(?:--force(?:-with-lease|-if-includes)?|-f)\b/i,
		reason: FORCE_REASON,
	},
	{
		pattern: /\bgit\s+push\b[^\n]*\s\+[^\s]/,
		reason: FORCE_REASON,
	},
	{
		pattern: /\bgit\s+reset\s+--hard\b/i,
		reason: RESET_REASON,
	},
	{
		pattern:
			/\b(?:transitionJiraIssue|createJiraIssue|editJiraIssue|executeDestructive)\b/i,
		reason: JIRA_REASON,
	},
];

export function decideCommand(command: string): GuardResult {
	for (const rule of COMMAND_DENY_LIST) {
		if (rule.pattern.test(command)) {
			return { blocked: true, reason: rule.reason };
		}
	}
	if (isMergeCloseApi(command)) {
		return { blocked: true, reason: MERGE_CLOSE_REASON };
	}
	if (isJiraMutationApi(command)) {
		return { blocked: true, reason: JIRA_REASON };
	}
	return { blocked: false };
}

export function isForbiddenMutation(command: string): GuardResult {
	return decideCommand(command);
}

function denyOutput(reason: string): string {
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: reason,
		},
	});
}

function commandFromPayload(
	raw: string,
): { ok: true; command: string } | { ok: false; reason: string } {
	try {
		const parsed = JSON.parse(raw) as {
			tool_input?: { command?: unknown };
		};
		const command = parsed?.tool_input?.command;
		if (typeof command !== "string" || command.length === 0) {
			return {
				ok: false,
				reason: "Guard payload has no command; refusing to fail open.",
			};
		}
		return { ok: true, command };
	} catch {
		return {
			ok: false,
			reason: "Malformed guard payload; refusing to fail open.",
		};
	}
}

if (import.meta.main) {
	const raw = await new Response(Bun.stdin.stream()).text();
	const parsed = commandFromPayload(raw);
	if (!parsed.ok) {
		console.log(denyOutput(parsed.reason));
		process.exit(0);
	}
	const result = decideCommand(parsed.command).blocked
		? decideCommand(parsed.command)
		: isAttributionViolation(parsed.command);
	if (result.blocked) {
		console.log(denyOutput(result.reason ?? "Command refused."));
	}
	process.exit(0);
}
