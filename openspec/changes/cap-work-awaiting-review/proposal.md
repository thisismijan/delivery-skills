## Why

Auto capped how many workers run at once and how many review rounds a change
gets, but not how many finished changes wait for the operator. It kept
dispatching new work while open changes piled up, so the gap grew between what
the run produced and what a person could stand behind. Past that point a
reviewer is no longer reviewing, only approving.

## What Changes

- New `review-queue.ts` reads the ledger's Keys table and lists every key with
  a change that is not yet merged, stopped and waiting ones included. It fails
  closed on a ledger it cannot read.
- `config.ts ready-wave` takes the ledger as an optional third argument. Each
  live worker counts as one more open change. When the total reaches
  `maxAwaitingReview` (`MAX_AWAITING_REVIEW`, default 5), it dispatches no
  more work and reports `heldForReview`.
- `auto.md` passes the ledger, records a Decision naming the held keys,
  keeps working the open changes, and when only held keys remain, waits on a
  person. It never raises the limit itself.
- The ledger says how its MR column is written.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: the ready wave also respects the review queue.

## Impact

- New `factory/scripts/review-queue.ts`, `factory/scripts/config.ts`
- `skills/delivery/workflows/auto.md`, `delivery-ledger.md`
- `docs/reference.md`
