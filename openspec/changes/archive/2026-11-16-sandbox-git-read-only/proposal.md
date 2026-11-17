## Why

The worker sandbox mounted the repository's shared git directory read-write.
That directory holds `config` and `hooks`, so a sandboxed worker could set
`core.fsmonitor` or install a hook. The coordinator then runs plain `git` on the
host, for example `git status` in `worktree-close.ts`, and git would run what
the worker planted, outside the sandbox. Both were confirmed on git 2.43: a
planted fsmonitor program and a `post-index-change` hook each ran on a plain
`git status` in a worker worktree. A worker could also redirect its worktree
through the `.git` pointer file or its `commondir` link, or add a
`config.worktree` that names filter programs.

## What Changes

- Worker containers see the shared `config`, `hooks`, and `info`, the
  worktree's `.git` pointer file, and its own `commondir`, `gitdir`, and
  `config.worktree` read-only, mounted over the writable git directory, so the
  worker can still commit.
- A new `safe-git.ts` runs every coordinator git command on a worker's
  repository or worktree with `-c core.fsmonitor=false -c
  core.hooksPath=/dev/null`. `worktree-close.ts`, `sandbox-run.ts`, and
  `worktree-files.ts` use it.
- `worktree-close.ts` keeps a worktree with its own non-empty
  `config.worktree`, and refuses one whose git directory is outside the
  repository's `worktrees` folder. `sandbox-run.ts` refuses to plan a container
  for such a worktree.
- `auto.md` and the reference say git on a worker's worktree runs only through
  the pack's scripts or with those two settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: the sandbox and the coordinator's git calls give a worker
  no way to make the host run code through git.

## Impact

- New `factory/scripts/safe-git.ts`; `sandbox-run.ts`, `worktree-close.ts`,
  `worktree-files.ts`
- `skills/delivery/workflows/auto.md`, `docs/reference.md`
