## 1. Tests

- [x] 1.1 The queue counts open, stopped, and waiting changes, skips merged and later ones, and fails closed on an unreadable ledger.
- [x] 1.2 The ready wave holds new work at the limit, counts live workers against it, keeps the worker cap, and reads the ledger from the command line.
- [x] 1.3 Docs contract: auto passes the ledger and states the limit from the source default.

## 2. Implementation

- [x] 2.1 Add `review-queue.ts` and the `maxAwaitingReview` setting.
- [x] 2.2 Hold the ready wave at the limit.
- [x] 2.3 Update auto, the ledger format, and the reference.
