## Why

When the forge reported a change as conflicted, land and readiness stopped
with "The change has conflicts." and `/delivery auto` waited. No step brought
the branch up to date, so in a parallel wave one conflicted change stalled
until the operator rebased it by hand.

## What Changes

- `branch-update.ts update <worktree> <branch> <target> <expected-head>` checks
  that the remote branch is still at the head auto read. It squashes the
  change's commits into one, keeping the oldest commit's message, rebases that
  onto the target, and force-pushes with the expected head as the lease.
  - Exit 0 means the branch was updated with no agent.
  - Exit 3 leaves the rebase stopped on real conflicts and lists the files.
  - Exit 4 means the remote branch moved, so nothing was pushed.
  - It refuses a dirty worktree or a local head other than the expected one.
- `branch-update.ts push <worktree> <branch> <expected-head>` finishes after
  one agent resolves the conflicts, with the same lease.
- Auto runs this when conflicts are the only stop reason. It stops on exit 4.
  After a push it sets the key to `[addressed !N]` and reruns the green gate
  and a delta review on the new head. The old GO never carries over.
- The land gate's conflict reason is exported so auto's wording is tested
  against it.

Out of scope: updating the target branch; merging, closing or marking a change
ready; and branch updates outside `/delivery auto`.

## Capabilities

### New Capabilities

- `conflicted-change-update`: auto brings a conflicted change up to date by
  script and stops when the branch moved under it.

### Modified Capabilities

None.

## Impact

`factory/scripts/branch-update.ts` and its tests, `factory/scripts/land-gate.ts`,
and the Land section of `skills/delivery/workflows/auto.md`.
