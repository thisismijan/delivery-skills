# Cursor adapter

Cursor loads personal skills from `~/.cursor/skills/<name>/SKILL.md`. Cloud
Agents also read `/cursor/stores/user/skills`.

From the clone:

```bash
bash adapters/cursor/install.sh
# cloud agent VM:
bash adapters/cursor/install-store.sh
# equivalent compatibility routes:
bash adapters/compat.sh --cursor
bash adapters/compat.sh --store
```

The wrappers install the generic pack, this adapter, and GitLab as a default
provider. Extra arguments are forwarded to `install.sh`:

```bash
bash adapters/cursor/install.sh --provider github
bash adapters/cursor/install.sh --provider github --provider jira
```

Reload Cursor so it loads both the installed skills and `hooks.json`. Enter
the target repository, and run:

```bash
export FACTORY_ROOT="${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}/_factory"
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items local-files
```

That is a managed copy of `skills/*` plus `_factory/`. Do not edit files under
the destination; edit the clone and reinstall. Store installs place the portable
runtime at `skills/_factory/` so it is synced with the skills. Live run state is
worktree-local under the target repository's `.delivery/` directory.

To install the pack as a local Cursor plugin instead, which keeps everything
above and adds the agents with the judging ones declared read-only:

```bash
bash adapters/cursor/install-plugin.sh
```

It runs the same install into `${CURSOR_PLUGIN_DIR:-$HOME/.cursor/plugins/local/delivery}/skills`,
then writes `agents/` and `.cursor-plugin/plugin.json` beside it. An agent
whose declared tools cannot write files or run commands is marked
`readonly: true`. Cursor's subagent documentation says a read-only subagent
makes no file edits and runs no state-changing shell commands; its plugin
reference does not yet document the field for plugin agents, and neither page
covers MCP tools. Until a live session confirms it, treat the flag as declared,
not proven. The mutation guard blocks merge, close, force-push, and tracker
writes for every agent either way. The stage skills `/groom`, `/draft`, `/execute`,
`/address-comments`, `/mr-review`, and `/openspec-archive` are marked so the
model cannot start them on its own; type them, or let `/delivery` start them.
`/delivery` and `/code-review-max` stay model-invocable. `/delivery doctor` reports a setup item
when the plugin no longer matches the installed factory, naming each agent or
skill that drifted. Set `FACTORY_ROOT` to
`<plugin>/skills/_factory`. The plain install keeps working.

Cursor-only behaviour:

- Correctness pass is `/code-review-max`.
- Native Cursor `/code-review` is rejected by `/mr-review`.
- Parallel work uses Cursor subagents, not Claude dynamic workflows.
- Selected provider tools land in `~/.local/bin`. Put that directory on
  `PATH`. Doctor probes the **selected** provider, not GitLab by default, and
  never prints secret values.
- Cursor is declared **enforced only after setup verifies** user-level
  `${CURSOR_HOOKS_FILE:-$HOME/.cursor/hooks.json}`. The hook is the real
  enforcement: `beforeShellExecution`, `beforeMCPExecution`, and `preToolUse`
  run `commit-guard.ts --protocol cursor` with `failClosed: true`, so a crash
  or empty response denies the action. It blocks merge/close, force-push, hard
  reset, tracker mutation, and equivalent API calls. Reload Cursor after
  install. Until doctor shows Mutation guard as ready, mutating stages stay
  blocked. Do not merge, close, force-push, hard-reset, or mutate GitHub,
  GitLab, or Jira state as a workaround.
