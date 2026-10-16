## 1. Tests first: matching merge request

- [ ] 1.1 Write a failing test that `[executing]` with a matching open merge request records that iid and selects review as a single step
- [ ] 1.2 Write a failing test that a matching merge request still proceeds to review when the owner is gone, and that the ledger writer is not called during selection

## 2. Tests first: interrupted stop

- [ ] 2.1 Write a failing test that `[executing]` with no active owner and no merge request stops, records an interrupted reason, and offers `/delivery execute <KEY>`
- [ ] 2.2 Write a failing test that a bare key does not run execute for that interrupted state, and that an explicit execute at that state runs only execute

## 3. Tests first: unattributable evidence

- [ ] 3.1 Write failing tests that unattributable dirty-worktree, stale or conflicting branch, and stale or conflicting gate evidence each escalate and never discard or guess
- [ ] 3.2 Write a failing test that unattributable evidence escalates even when a matching open merge request exists

## 4. Tests first: live wait and failed stages

- [ ] 4.1 Write a failing test that `[executing]` with an active owner and no merge request waits, does not record an interrupted stop, and does not run execute
- [ ] 4.2 Write a failing test that a confirmed failed stop still never retries, and that an unknown owner with no merge request escalates rather than waiting or restarting
- [ ] 4.3 Write a failing contract test that auto and resume name recovery for `[executing]`, offer the execute-resume command after an interrupted stop, and still treat typing execute as the build approval

## 5. Implementation

- [ ] 5.1 Add `recoverExecuting` and extend `selectNextAction` so `[executing]` uses recovery evidence instead of guessing review or wait from the table, and confirm the helper tests pass
- [ ] 5.2 Update `auto.md`, `SKILL.md`, and `execute/SKILL.md` so resume records a matching MR and reviews, stops interrupted work with `/delivery execute <KEY>`, waits on a live owner, and escalates unattributable evidence, and confirm the contract tests pass
- [ ] 5.3 Run `bun test` in `factory/` and `bun run check` there, and the delivery-specs suite, and confirm they pass
