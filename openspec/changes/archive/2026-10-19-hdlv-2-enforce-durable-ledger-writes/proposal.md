## Why

The delivery ledger promises compare-and-swap on `Generation`, and `factory/scripts/ledger-store.ts` already implements it. Live delivery still edits the markdown file directly, so two sessions can overwrite each other. The store's lock is a bare directory with no owner, so a crashed writer blocks a run for good. Ledgers that predate the `Generation` header cannot be used by the store at all.

## What Changes

- Make the durable writer the required path for every ledger mutation in the delivery workflows.
- Report a stale generation and a held lock as one distinct, typed concurrency conflict, with its own exit code on the command line.
- Record the lock owner (process id, host, timestamp) when a write takes the lock.
- Add an explicit `recoverLock` step that clears a lock only when its owner is provably gone, and says what it cleared. A write never clears a lock itself.
- Treat an existing ledger with no `Generation` header as generation 0 on first durable use, and stamp the header in that first write.
- Out of scope: choosing the next lifecycle action, marking merge requests ready, changing status-tag vocabulary.

## Capabilities

### New Capabilities
- `delivery-ledger-writes`: durable, compare-and-swap, recoverable writes to the delivery run ledger.

### Modified Capabilities

None.

## Impact

- `factory/scripts/ledger-store.ts` and `factory/scripts/ledger-store.test.ts`
- `skills/delivery/workflows/delivery-ledger.md` and `skills/delivery/SKILL.md`
- `skills/delivery/checks/delivery-specs.test.ts`
