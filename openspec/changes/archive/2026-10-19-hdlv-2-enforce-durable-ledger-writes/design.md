## Context

`ledger-store.ts` exports `ledgerGeneration`, `nextLedger`, and `writeLedger(root, id, expected, markdown)`, plus a command line. The lock is the directory `<id>.md.lock`, created with `mkdir`. Conflicts are plain `Error`s. Nothing in the delivery skill calls the store.

## Decisions

- **Typed conflict.** A `ConcurrencyConflict` error covers both a stale generation and a held lock. The command line exits with a distinct code for it.
- **Lock owner record.** On acquire, the writer stores process id, host name, and timestamp inside the lock directory.
- **Explicit recovery.** `recoverLock(root, id)` clears a lock only when the owner host equals this host and the process is not alive. A lock from another host, or an unreadable owner record, is left alone and reported. `writeLedger` never clears a lock. A write that meets a dead owner's lock fails with a conflict that names recovery.
- **Legacy ledgers.** A ledger with no `Generation` header counts as generation 0. The first write stamps the header and increments once. Content otherwise stays as written.
- **Required path.** `delivery-ledger.md` and the call sites in `SKILL.md` name the writer and recovery commands as the only mutation route. This is enforced by a documentation contract test, not by code.

## Approved test seams

1. **`writeLedger` and `recoverLock` called directly, on a real temporary directory.**
   - Catches: two writers racing on one generation (one success, one conflict, winner's content kept); stale generation; held lock; legacy and current-format first use; abandoned lock refused by write, cleared by recovery, then write succeeds; live owner and foreign host left in place; ids that escape the root.
   - Misses: real cross-process races; cross-host liveness; sessions that edit the file directly; a crash between the temporary write and the rename.
   - Controlled fakes: owner liveness through one injectable check, defaulting to the real one, faked only for the dead-owner case. The live-owner case uses the test's own process id. The clock is injected only if a timestamp comparison is needed. The filesystem is real, and `node:fs` is never mocked.
2. **The documentation contract in `delivery-specs.test.ts`.**
   - Catches: workflow text drifting from the writer, or no longer naming it as the required path.
   - Misses: whether a session follows the text.
   - Controlled fakes: none. Command names are read from `ledger-store.ts`, not copied.

A command-line smoke test is added only if the exit-code contract changes, and then as one test.

## Risks

- Liveness is checkable only on the same host, so recovery under a shared state volume stays conservative.
- Process id reuse can make a dead owner look alive. That fails safe, since the lock stays.
- The documentation route cannot stop a session that bypasses the writer.
