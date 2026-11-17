## 1. Watch

- [x] 1.1 Read the worker's status from its own journal row
- [x] 1.2 Report a terminal status as finished, with exit 4 when none is idle

## 2. Coordinator

- [x] 2.1 Auto reconciles, then ends, a finished worker and never redoes it
- [x] 2.2 Ledger and reference describe the finished state

## 3. Verify

- [x] 3.1 Tests for terminal and non-terminal statuses, another key's row, and the auto contract
- [x] 3.2 `bun run check` and `bun run test` pass
