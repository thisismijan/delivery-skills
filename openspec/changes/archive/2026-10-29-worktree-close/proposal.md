## Why

Auto removes a worker's worktree "only after its branch and artifacts are
durably pushed and the worker has stopped", but nothing checks that. A
coordinator that judges it from prose can delete uncommitted work, or leave
clean folders behind until the disk fills.

## What Changes

- New `factory/scripts/worktree-close.ts <path>` decides from git alone:
  - it removes a linked worktree only when nothing is uncommitted or
    untracked and its last commit is on a remote branch;
  - otherwise it keeps the folder and says why in plain words.
- It refuses the primary checkout and anything that is not a git worktree.
- `--dry-run` reports the decision without removing anything.
- Auto's cleanup step calls it after each worker stops, records every kept
  worktree with its reason in the ledger, and status lists them.

## Capabilities

### New Capabilities

- `worker-worktrees`: how auto prepares, watches, and closes worker worktrees.

### Modified Capabilities

None.

## Impact

- New `factory/scripts/worktree-close.ts` and its test
- `skills/delivery/workflows/auto.md`, `skills/delivery/workflows/delivery-ledger.md`
