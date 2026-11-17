## 1. Reap

- [x] 1.1 Add `reapSandbox` and the `reap` command, removing only containers labelled with the run
- [x] 1.2 Add `leftoverContainers`, grouping labelled containers by run

## 2. Doctor and docs

- [x] 2.1 Report leftover containers by run in `/delivery doctor`
- [x] 2.2 Document `reap` in the worker sandbox reference

## 3. Verify

- [x] 3.1 Tests with a fake engine for removal, refusal, bad input, and the doctor report
- [x] 3.2 `bun run check` and `bun run test` pass
