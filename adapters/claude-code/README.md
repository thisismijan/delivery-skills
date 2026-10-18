# Claude Code adapter

Claude Code loads personal skills from `~/.claude/skills/<name>/SKILL.md`.

From the clone:

```bash
bash adapters/claude-code/install.sh
# equivalent compatibility route:
bash adapters/compat.sh --claude
```

The wrapper installs the generic pack, this adapter, and the GitLab review
provider. It additively installs and verifies the Bash `PreToolUse` mutation
hook in `${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}`, preserving
unrelated settings and writing a `.delivery-backup` before replacement. Reload
Claude Code, enter the target repository, and run:

```bash
bun "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/_factory/scripts/doctor.ts"
bun "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/_factory/scripts/delivery-init.ts"
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
