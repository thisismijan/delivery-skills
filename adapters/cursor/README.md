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
under `~/.cursor/skills`; edit the clone.

Cursor-only behaviour:

- Correctness pass is `/code-review-max`.
- Native Cursor `/code-review` is rejected by `/mr-review`.
- Parallel work uses Cursor subagents, not Claude dynamic workflows.
- `gl-mr` / `gl-note`: on a cloud VM run
  `bash skills/mr-review/cloud-setup.sh` once.
