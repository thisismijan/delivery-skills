## Why

`worker-watch.ts` judged a worker only by time since its last journal write.
A worker that wrote its final status and then hung looked idle, so the
coordinator stopped it as stalled with the reason worker idle and ignored
everything it had written, throwing away finished work.

## What Changes

- `worker-watch.ts` reads the worker's own row in its journal. When the status
  is terminal for a worker (`[go !N]`, `[stopped: <reason>]`, or a status that
  only follows landing), the worker is reported as finished, whatever its idle
  time. It exits 4 when none is idle but one is finished; exit 3 for idle
  workers is unchanged and takes precedence.
- Auto reconciles a finished worker from its journal, git, and forge like any
  settled worker, then ends it (cancelling it, or stopping its sandbox
  container), sets `finishedAt`, and closes its worktree. It never treats a
  finished worker as idle or redoes its work.

Out of scope: changing the idle limit, reaping containers left by a dead
coordinator, and workers without a journal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: a worker that finished but did not exit is kept, not
  stopped as idle.

## Impact

`factory/scripts/worker-watch.ts` and its tests, `skills/delivery/workflows/auto.md`,
`skills/delivery/workflows/delivery-ledger.md`, and `docs/reference.md`.
