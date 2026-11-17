## Why

A worker that hung after opening its change, but before writing a final
journal status, was stopped as idle. Its key became `[stopped: worker idle]`
and the next run started from that stop, though the change, its pushed commits,
and its gate evidence were real.

## What Changes

- `idle-reconcile.ts <KEY> <journal.md> <find-result.json> [green-gate.json...]`
  decides whether an idle worker's open change is its own. It exits 0 with the
  change's reference and head when there is exactly one open change for the
  key and its head appears in the journal or under a passing green gate. It
  exits 3 otherwise, naming why.
- Auto runs it after stopping an idle worker and before choosing the key's
  status. Exit 0 sets the key to `[executing]` with that change, so the next
  run resumes at review, and records the kept change in Decisions. Exit 3
  keeps `[stopped: worker idle]` as before.

Out of scope: changing the idle limit, and restarting the worker in the same
turn.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: an idle worker's proven change is kept for review rather
  than discarded.

## Impact

`factory/scripts/idle-reconcile.ts` and its tests,
`skills/delivery/workflows/auto.md`, `skills/delivery/workflows/delivery-ledger.md`,
and `docs/reference.md`.
