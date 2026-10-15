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
runtime at `skills/_factory/` so it is synced with the skills, while preserving
the delivery skill's `runs/`, `candidates/`, and `versions/` directories.

Cursor-only behaviour:

- Correctness pass is `/code-review-max`.
- Native Cursor `/code-review` is rejected by `/mr-review`.
- Parallel work uses Cursor subagents, not Claude dynamic workflows.
- `gl-mr` / `gl-note` are installed into `~/.local/bin` by `install.sh`. Ensure
  that directory is on `PATH`.
