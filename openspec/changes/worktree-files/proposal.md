## Why

A worker's worktree is a fresh checkout, so it lacks every file git ignores:
`.env`, local config, credentials files for a local service. Tests that need
them fail in the worker and pass in the main checkout, which reads as a broken
change rather than a missing file. Copying them by hand is easy to forget and
easy to overdo.

## What Changes

- New `factory/scripts/worktree-files.ts` with three commands:
  - `propose` lists the files git ignores in the main checkout;
  - `confirm` saves the exact paths the operator names to
    `.delivery/worktree-files.json`, with their words;
  - `copy` places those files in a new worker worktree.
- Every path must be exact (no patterns), relative, inside the repository, a
  regular file, not a symbolic link, at most 1 MiB, ignored by git, and not
  tracked.
- `copy` checks every file before writing any. A missing source or an
  existing target stops that ticket without writing anything.
- `/delivery init` asks once which files to copy and never shows their
  contents. Auto runs `copy` right after creating each worktree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: confirmed local files are copied into worker worktrees.

## Impact

- New `factory/scripts/worktree-files.ts` and its test
- `skills/delivery/SKILL.md`, `skills/delivery/workflows/auto.md`,
  `docs/reference.md`
