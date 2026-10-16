## 1. Tests first

- [x] 1.1 Write the writer test: two writers on one generation, one succeeds, one gets the typed conflict, winner's content kept (seam 1)
- [x] 1.2 Write the writer test: a held lock gives a conflict and leaves the ledger unchanged (seam 1)
- [x] 1.3 Write the writer test: a ledger with no `Generation` header is accepted as generation 0 and stamped, and a current-format ledger needs no conversion (seam 1)
- [x] 1.4 Write the recovery test: dead owner cleared and reported, then a write succeeds; write alone refuses with a conflict that names recovery (seam 1)
- [x] 1.5 Write the recovery test: live owner, foreign host, and unreadable owner record are left in place with a reason (seam 1)
- [x] 1.6 Write the documentation contract test: workflows name the writer and recovery commands read from `ledger-store.ts`, and call a conflict a terminal stop (seam 2)

## 2. Implementation

- [x] 2.1 Implement the typed concurrency conflict and a distinct command-line exit code
- [x] 2.2 Implement the lock owner record (process id, host, timestamp)
- [x] 2.3 Implement `recoverLock` with an injectable liveness check
- [x] 2.4 Implement generation-0 handling for headerless ledgers
- [x] 2.5 Update `delivery-ledger.md` and `SKILL.md` to require the writer and recovery step

## 3. Verify

- [x] 3.1 Run the root test suite and confirm the new tests pass
