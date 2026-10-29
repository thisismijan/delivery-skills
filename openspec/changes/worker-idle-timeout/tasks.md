## 1. Tests

- [x] 1.1 Prove active, idle, no-journal, journal-older-than-dispatch, and malformed-input cases, and the configured default.
- [x] 1.2 Prove auto and the ledger name the watch command, the idle stop, and that later writes are ignored.

## 2. Implementation

- [x] 2.1 Add `worker-watch.ts` and `workerIdleMinutes` to config.
- [x] 2.2 Wire the heartbeat rule and idle handling into auto and the ledger.
