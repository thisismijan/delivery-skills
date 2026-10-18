# Claude Code adapter

Claude Code loads personal skills from `~/.claude/skills/<name>/SKILL.md`.

From the clone:

```bash
./install.sh --skills-dir "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}" --adapter claude-code
# compatibility wrapper:
bash adapters/claude-code/install.sh
# or the named-host wrapper:
bash adapters/compat.sh --claude
```

This pack replaces the ig-spec Claude plugin. Do not also
`/plugin install ig-spec` in the same session.

Claude-only behaviour:

- Correctness pass may be native `/code-review max` when it exists.
- Otherwise use `/code-review-max` from this pack.
- Dynamic workflows may replace a large read-only fan-out. They must not wrap
  both sides of a human approval gate.
- Claude Code is declared **enforced**. Merge
  `adapters/claude-code/settings.json` into your Claude Code settings and set
  `DELIVERY_FACTORY_ROOT` to `<skills-dir>/_factory`. The hook is the real
  enforcement: it blocks merge/close, force-push, hard reset, tracker
  mutation, and equivalent API calls, and it denies a payload with no command.
