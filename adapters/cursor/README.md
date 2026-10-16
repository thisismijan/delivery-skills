# Cursor adapter

Cursor loads personal skills from `~/.cursor/skills/<name>/SKILL.md`. Cloud
Agents also read `/cursor/stores/user/skills`.

From the clone:

```bash
./install.sh --cursor
# cloud agent VM:
./install.sh --store
```

That is a symlink (or a copy, for the store) of `skills/*`. Do not edit files
under `~/.cursor/skills`; edit the clone. Store installs place the portable
runtime at `skills/_factory/` so it is synced with the skills. Live run state is
worktree-local under the target repository's `.delivery/` directory.

Cursor-only behaviour:

- Correctness pass is `/code-review-max`.
- Native Cursor `/code-review` is rejected by `/mr-review`.
- Parallel work uses Cursor subagents, not Claude dynamic workflows.
- `gl-mr` / `gl-note` are installed into `~/.local/bin` by `install.sh`. Ensure
  that directory is on `PATH`.
- Cursor is declared **unenforced**. It has no executable hook that can deny a
  tool call, so mutating stages stay blocked until a real enforcement hook
  exists and this declaration is changed with a test. Read-only stages still
  run. Do not merge, close, force-push, hard-reset, or mutate Jira.
