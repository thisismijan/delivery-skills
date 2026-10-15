// Deterministic guard: blocks any git commit / MR / PR command whose message or
// description carries an AI/tool attribution trailer. Runs as a PreToolUse(Bash)
// hook shipped with the plugin, so it fires in every target repo that enables it.
// Enforces the "Never add Co-Authored-By / Generated with" rule in CLAUDE.md at the
// tool boundary, where prose instructions cannot be trusted to hold.

export interface GuardResult {
	blocked: boolean;
	reason?: string;
}

// Commands that can persist an attribution trailer into history or a human-read
// description. We only inspect these so reads (git log, grep) are never blocked.
const WRITE_COMMAND =
	/\bgit\s+commit\b|\bgit\s+merge\b|\b(?:glab\s+mr|gh\s+pr)\b/i;

// The attribution we forbid. Case-insensitive; matches the trailer wherever it
// appears in the command string (inline -m, heredoc, --description, etc.).
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

if (import.meta.main) {
	const raw = await new Response(Bun.stdin.stream()).text();
	let command = "";
	try {
		command = JSON.parse(raw)?.tool_input?.command ?? "";
	} catch {
		// Unparseable hook payload: do not block (the harness owns malformed input).
		process.exit(0);
	}
	const result = isAttributionViolation(command);
	if (result.blocked) {
		console.log(
			JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: result.reason,
				},
			}),
		);
	}
	process.exit(0);
}
