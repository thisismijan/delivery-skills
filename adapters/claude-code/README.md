# Claude Code adapter

Claude Code loads personal skills from `~/.claude/skills/<name>/SKILL.md`.

From the clone:

```bash
./install.sh --claude
```

This pack replaces the ig-spec Claude plugin. Do not also
`/plugin install ig-spec` in the same session.

Claude-only behaviour:

- Correctness pass may be native `/code-review max` when it exists.
- Otherwise use `/code-review-max` from this pack.
- Dynamic workflows may replace a large read-only fan-out. They must not wrap
  both sides of a human approval gate.
- Factory scripts still honour `CLAUDE_PLUGIN_ROOT` after `RUNTIME.md` sets it
  to this clone's `factory/` directory.
- To enforce human-owned mutation boundaries, merge
  `adapters/claude-code/settings.json` into your Claude Code settings and set
  `DELIVERY_FACTORY_ROOT` to this clone's `factory/` directory. The hook blocks
  merge/close, force-push, hard reset, and Jira mutation commands.
