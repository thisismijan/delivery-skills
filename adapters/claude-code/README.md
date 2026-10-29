# Claude Code adapter

Claude Code loads personal skills from `~/.claude/skills/<name>/SKILL.md`.

From the clone:

```bash
bash adapters/claude-code/install.sh
# equivalent compatibility route:
bash adapters/compat.sh --claude
```

The wrapper installs the generic pack, this adapter, and GitLab as a default
provider. Extra arguments are forwarded, so `--provider github` or
`--provider github --provider jira` replace or compose that default. It
additively installs and verifies the Bash `PreToolUse` mutation hook in
`${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}`, preserving unrelated
settings and writing a `.delivery-backup` before replacement. It also copies
the agent-summary preload into the installed factory and adds `--preload` to
`BUN_OPTIONS` in those settings, so background workers skip the status-line
summary query. Other `BUN_OPTIONS` flags stay. Restart the Claude daemon
after install (`claude daemon stop --any`) so already-running sessions pick
this up. Reload Claude Code, enter the target repository, and run:

```bash
export FACTORY_ROOT="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/_factory"
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items gitlab
```

This pack replaces the ig-spec Claude plugin. Do not also
`/plugin install ig-spec` in the same session.

Claude-only behaviour:

- Correctness pass may be native `/code-review max` when it exists.
- Otherwise use `/code-review-max` from this pack.
- Dynamic workflows may replace a large read-only fan-out. They must not wrap
  both sides of a human approval gate.
- Claude Code is declared **enforced only after setup verifies the persisted
  hook**. The hook is the real enforcement: it blocks merge/close, force-push,
  hard reset, tracker mutation, and equivalent API calls, and it denies a
  payload with no command. A failed hook setup restores the prior skill install
  and leaves mutating stages blocked.
- The status-line summary preload is MIT-licensed from Flamerix AI. It wraps
  only Claude Code's compiled Bun image. Doctor reports it as setup until the
  live settings carry the preload; missing it does not block a stage.
