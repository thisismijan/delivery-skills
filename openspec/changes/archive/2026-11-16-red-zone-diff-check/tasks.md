## 1. Diff check

- [x] 1.1 Apply the red-zone rule to the build's diff with the same approval line
- [x] 1.2 Stop `/execute` before the holdout review on exit 3

## 2. Doctor

- [x] 2.1 Report zone counts, or the unreadable line, only when a map exists

## 3. Verify

- [x] 3.1 Tests for an unplanned red path, approval, no map, the doctor states, and the wording
- [x] 3.2 `bun run check` and `bun run test` pass
