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

The wrappers install the generic pack, this adapter, and the GitLab review
provider. Reload Cursor, enter the target repository, and run:

```bash
bun "${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}/_factory/scripts/doctor.ts"
bun "${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}/_factory/scripts/delivery-init.ts"
```

That is a managed copy of `skills/*` plus `_factory/`. Do not edit files under
the destination; edit the clone and reinstall. Store installs place the portable
runtime at `skills/_factory/` so it is synced with the skills. Live run state is
worktree-local under the target repository's `.delivery/` directory.

Cursor-only behaviour:

- Correctness pass is `/code-review-max`.
- Native Cursor `/code-review` is rejected by `/mr-review`.
- Parallel work uses Cursor subagents, not Claude dynamic workflows.
- `gl-mr` / `gl-note` are installed into `~/.local/bin` by the selected GitLab
  provider. Ensure that directory is on `PATH`; doctor reports missing tools or
  credentials without printing secret values.
- Cursor is declared **unenforced**. It has no executable hook that can deny a
  tool call, so mutating stages stay blocked until a real enforcement hook
  exists and this declaration is changed with a test. Read-only stages still
  run. Do not merge, close, force-push, hard-reset, or mutate Jira.
