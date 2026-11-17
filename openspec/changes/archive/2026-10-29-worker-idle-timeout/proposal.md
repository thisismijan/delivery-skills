## Why

A parallel worker that hangs (a stuck command, a wedged tool call, a lost
session) holds its key forever. Auto waits for the whole batch to settle, so
one silent worker stalls every key queued behind it, and nothing says which
one is stuck.

## What Changes

- Each worker writes its journal at every step boundary and around any
  command that may run for minutes, so the journal is its heartbeat.
- The coordinator writes `dispatch.json` with each key's dispatch time.
- New `factory/scripts/worker-watch.ts` reports each worker as active or idle
  from its journal's last write, or from its dispatch time when there is no
  journal yet. It exits 3 when any worker is idle.
- A worker silent for `workerIdleMinutes` (`WORKER_IDLE_MINUTES`, default 20)
  is idle. Auto then:
  - cancels it if the runtime can;
  - stops its key as `[stopped: worker idle]`;
  - closes its worktree, which keeps any unpushed work;
  - ignores anything that worker writes afterwards.
- Siblings keep running, and an idle worker is never restarted in the same
  turn.
- The default is 20 minutes rather than Sandcastle's 10 because the heartbeat
  is a journal write between steps, not every line of output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: idle workers are detected and stopped.

## Impact

- New `factory/scripts/worker-watch.ts` and its test; `factory/scripts/config.ts`
- `skills/delivery/workflows/auto.md`, `skills/delivery/workflows/delivery-ledger.md`,
  `factory/CONVENTIONS.md`, `docs/reference.md`
