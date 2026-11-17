## Why

Claude Code enforces a subagent's `tools` list only when the agent is installed
as a native agent. The Claude Code adapter installed only skills, so a judge
such as the holdout reviewer ran as a generic subagent carrying its prompt. It
was read-only by convention, even though the runtime already dispatches a
host-provided subagent by name when one exists.

## What Changes

- The Claude Code adapter's setup runs
  `claude-agents.ts install <agents-dir> <factory-root>`, which installs every
  factory agent in `${CLAUDE_AGENTS_DIR:-$HOME/.claude/agents}`. Each agent
  keeps its declared tools, and its model becomes `inherit` because skills pass
  the resolved model.
- It records the agents it installed in `.delivery-agents.json`. A reinstall
  replaces only those, removes any the factory dropped, and refuses to replace
  an agent of the same name it did not install, writing nothing.

Out of scope: changing the agents' prompts, and other hosts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-skill-packaging`: on Claude Code the host enforces the judging
  agents' read-only tools.

## Impact

`factory/scripts/claude-agents.ts` and its tests,
`adapters/claude-code/setup.sh`, the host install test,
`adapters/claude-code/README.md`, `docs/reference.md`, and `docs/security.md`.
