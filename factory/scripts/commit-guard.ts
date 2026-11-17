// The host runs this before every shell or tool call (a PreToolUse hook for
// Claude Code, a hooks.json entry for Cursor) in any repository that installs
// the pack. Instructions in prose can be ignored; this check cannot, so the
// attribution rule and the human-owned actions are enforced here.

export interface GuardResult {
	blocked: boolean;
	reason?: string;
}

const HUMAN_OWNED_MERGE =
	"Only a human may merge, close, approve, or resolve threads: these are human-owned actions.";
const HUMAN_OWNED_TICKET =
	"Only a human may close or delete a work item (a human-owned action), and a ticket changes column only through board-status.ts sync.";
const NO_FORCE_PUSH = "A force push is refused.";
const NO_HARD_RESET = "A hard reset can throw work away, so it is refused.";
const UNREADABLE_MESSAGE =
	"The guard cannot inspect text this commit or merge request command reads from a file. Give the message or description inline instead.";

// Commands that publish a commit message or a merge request description.
const PUBLISHES_TEXT = /\b(?:git\s+(?:commit|merge)|glab\s+mr|gh\s+pr)\b/i;
const TEXT_FROM_FILE =
	/\bgit\s+(?:commit|merge)\b[^\n]*(?:\s-F(?:\s|=)|\s--file(?:\s|=))|\bgh\s+pr\b[^\n]*\s--body-file(?:\s|=)|\bglab\s+mr\b[^\n]*\s--description-file(?:\s|=)/i;

const CREDIT_LINES: ReadonlyArray<readonly [RegExp, string]> = [
	[/co-authored-by:/i, "a Co-Authored-By trailer"],
	[/generated with \[?claude/i, 'a "Generated with Claude" line'],
	[/🤖\s*generated with/i, 'a "Generated with" attribution line'],
];

export function isAttributionViolation(line: string): GuardResult {
	if (line === "" || !PUBLISHES_TEXT.test(line)) {
		return { blocked: false };
	}
	if (TEXT_FROM_FILE.test(line)) {
		return { blocked: true, reason: UNREADABLE_MESSAGE };
	}
	const credit = CREDIT_LINES.find(([pattern]) => pattern.test(line));
	if (credit === undefined) return { blocked: false };
	return {
		blocked: true,
		reason: `The text of this commit or merge request command contains ${credit[1]}. CLAUDE.md does not allow a commit or merge request description to credit Claude, any AI, or any tool. Delete that line and run the command again.`,
	};
}

const CLI_MERGE_OR_CLOSE_MR = /\bglab\s+mr\s+(?:merge|close)\b/i;
const CLI_MERGE_OR_CLOSE_PR = /\bgh\s+pr\s+(?:merge|close)\b/i;
const PUSH_FORCE_FLAG =
	/\bgit\s+push\b[^\n]*(?:--force(?:-with-lease|-if-includes)?|-f)\b/i;
const PUSH_FORCE_REFSPEC = /\bgit\s+push\b[^\n]*\s\+[^\s]/;
const HARD_RESET = /\bgit\s+reset\s+--hard\b/i;
const TRACKER_WRITE_TOOL =
	/\b(?:transitionJiraIssue|editJiraIssue|executeWrite|executeDestructive)\b/i;
const MR_ACCEPT_OR_REVIEW_TOOL =
	/\b(?:accept_merge_request|save_merge_request_review)\b/i;
const MR_CLOSE_TOOL =
	/\bsave_merge_request\b[^\n]*(?:"state_event"\s*:\s*"close"|state_event[=:]\s*close)/i;
const WORK_ITEM_STATE_TOOL =
	/\bsave_work_item\b[^\n]*(?:"(?:state|status)"\s*:|(?:state|status)[=:])/i;

// Checked in this order; the first match supplies the reason.
const REFUSALS: ReadonlyArray<readonly [RegExp, string]> = [
	[CLI_MERGE_OR_CLOSE_MR, HUMAN_OWNED_MERGE],
	[CLI_MERGE_OR_CLOSE_PR, HUMAN_OWNED_MERGE],
	[PUSH_FORCE_FLAG, NO_FORCE_PUSH],
	[PUSH_FORCE_REFSPEC, NO_FORCE_PUSH],
	[HARD_RESET, NO_HARD_RESET],
	[TRACKER_WRITE_TOOL, HUMAN_OWNED_TICKET],
	[MR_ACCEPT_OR_REVIEW_TOOL, HUMAN_OWNED_MERGE],
	[MR_CLOSE_TOOL, HUMAN_OWNED_MERGE],
	[WORK_ITEM_STATE_TOOL, HUMAN_OWNED_TICKET],
];

const WRITE_METHOD = /(?:--method|-X|--request)\s*(POST|PUT|PATCH|DELETE)\b/i;
const FORGE_API_CALL = /\b(?:glab|gh)\s+api\b/i;
const MR_MERGE_ENDPOINT = /merge_requests\/[^\s/?]+\/merge(?:\b|\/|\?|"|$)/i;
const PR_MERGE_ENDPOINT = /pulls\/[^\s/?]+\/merge(?:\b|\/|\?|"|$)/i;
const MR_ENDPOINT = /merge_requests\//i;
const MR_CLOSE_FIELD = /(?:state_event=close|\bclose\b)/i;
const PR_ENDPOINT = /pulls\//i;
const PR_CLOSE_FIELD = /(?:state=closed|\bclose\b)/i;
const JIRA_ISSUE_ENDPOINT = /\/rest\/api\/\d+\/issues?(?:\/|\?|$)/i;

function mergesOrClosesThroughApi(command: string): boolean {
	if (!FORGE_API_CALL.test(command) || !WRITE_METHOD.test(command)) {
		return false;
	}
	return (
		MR_MERGE_ENDPOINT.test(command) ||
		PR_MERGE_ENDPOINT.test(command) ||
		(MR_ENDPOINT.test(command) && MR_CLOSE_FIELD.test(command)) ||
		(PR_ENDPOINT.test(command) && PR_CLOSE_FIELD.test(command))
	);
}

function writesJiraIssue(command: string): boolean {
	return WRITE_METHOD.test(command) && JIRA_ISSUE_ENDPOINT.test(command);
}

export function decideCommand(command: string): GuardResult {
	const refusal = REFUSALS.find(([pattern]) => pattern.test(command));
	if (refusal) return { blocked: true, reason: refusal[1] };
	if (mergesOrClosesThroughApi(command)) {
		return { blocked: true, reason: HUMAN_OWNED_MERGE };
	}
	if (writesJiraIssue(command)) {
		return { blocked: true, reason: HUMAN_OWNED_TICKET };
	}
	return { blocked: false };
}

export function isForbiddenMutation(command: string): GuardResult {
	return decideCommand(command);
}

export function evaluateCommand(command: string): GuardResult {
	const mutation = decideCommand(command);
	if (mutation.blocked) return mutation;
	return isAttributionViolation(command);
}

export type GuardProtocol = "claude" | "cursor";

export function parseGuardProtocol(argv: string[]): GuardProtocol {
	const at = argv.indexOf("--protocol");
	return at >= 0 && argv[at + 1] === "cursor" ? "cursor" : "claude";
}

function shellCommandIn(toolInput: unknown): string | undefined {
	if (typeof toolInput === "string") {
		let decoded: unknown;
		try {
			decoded = JSON.parse(toolInput);
		} catch {
			return undefined;
		}
		return shellCommandIn(decoded);
	}
	const isRecord =
		typeof toolInput === "object" &&
		toolInput !== null &&
		!Array.isArray(toolInput);
	if (!isRecord) return undefined;
	const { command } = toolInput as { command?: unknown };
	if (typeof command !== "string" || command === "") return undefined;
	return command;
}

type Payload = { ok: true; command: string } | { ok: false; reason: string };

const MALFORMED_PAYLOAD =
	"The guard payload is malformed, so the guard refuses instead of allowing the call.";
const PAYLOAD_WITHOUT_COMMAND =
	"The guard payload carries no command, so the guard refuses instead of allowing the call.";

export function commandFromPayload(raw: string): Payload {
	let payload: { command?: unknown; tool_name?: unknown; tool_input?: unknown };
	let toolName: string;
	try {
		payload = JSON.parse(raw);
		toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
	} catch {
		return { ok: false, reason: MALFORMED_PAYLOAD };
	}
	// Every tool other than the shell is judged on its name plus its encoded
	// input, so MCP writes meet the same refusals as CLI commands.
	if (toolName !== "" && toolName !== "Shell" && toolName !== "Bash") {
		const input = payload.tool_input;
		const encoded =
			typeof input === "string" ? input : JSON.stringify(input ?? {});
		return { ok: true, command: `${toolName} ${encoded}` };
	}
	const command =
		shellCommandIn(payload.tool_input) ??
		(typeof payload.command === "string" && payload.command !== ""
			? payload.command
			: undefined);
	if (command === undefined) {
		return { ok: false, reason: PAYLOAD_WITHOUT_COMMAND };
	}
	return { ok: true, command };
}

export function formatGuardStdout(
	protocol: GuardProtocol,
	result: GuardResult,
): string {
	const reason = result.reason ?? "Command refused.";
	if (protocol === "cursor") {
		if (!result.blocked) return JSON.stringify({ permission: "allow" });
		return JSON.stringify({
			permission: "deny",
			user_message: reason,
			agent_message: reason,
		});
	}
	if (!result.blocked) return "";
	const hookSpecificOutput = {
		hookEventName: "PreToolUse",
		permissionDecision: "deny",
		permissionDecisionReason: reason,
	};
	return JSON.stringify({ hookSpecificOutput });
}

if (import.meta.main) {
	const protocol = parseGuardProtocol(process.argv.slice(2));
	const payload = commandFromPayload(await Bun.stdin.text());
	const verdict: GuardResult = payload.ok
		? evaluateCommand(payload.command)
		: { blocked: true, reason: payload.reason };
	const stdout = formatGuardStdout(protocol, verdict);
	if (stdout !== "") console.log(stdout);
	process.exit(0);
}
