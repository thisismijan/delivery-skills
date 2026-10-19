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
