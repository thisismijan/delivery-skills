## Why

Auto and `next-action.ts` treat `[executing]` as wait while the build runs. There is no way to tell a live session from a crash before a merge request exists. Resume then waits forever, or a later execute may guess at dirty trees and stale gates. Interrupted work needs an explicit, attributable recovery.

## What Changes

- When resume sees `[executing]` with a matching open merge request, record that iid and proceed to review. Do not keep waiting for a build that already opened the MR.
- When resume sees `[executing]` with no active owner and no merge request, record an interrupted stop and offer the safe execute-resume command. Do not start execute from a bare key; typing execute remains the build approval.
- When branch, gate, or dirty-worktree evidence is stale or conflicting and cannot be attributed to this run, escalate. Never discard that evidence and never guess what to keep.
- A live owner with no merge request still waits. That is a running build, not a crash.

Out of scope: automatic retries after a confirmed failed stage, and changing the meaning of typing execute as the approval to build.

## Capabilities

### New Capabilities

- `interrupted-execution-recovery`: distinguish a live execute run from a crash, record a matching open merge request and continue to review, stop interrupted work with the safe execute-resume command, and escalate unattributable branch, gate, or dirty-tree evidence.

### Modified Capabilities

None.

## Impact

- `factory/scripts/next-action.ts` and a recovery helper it calls when the reconciled status is `[executing]`
- Factory tests for matching MR, interrupted stop, live wait, and unattributable escalation
- `skills/delivery/workflows/auto.md`, `skills/delivery/SKILL.md`, `skills/execute/SKILL.md`, and the wording contracts that pin them
- `skills/delivery/checks/delivery-specs.test.ts`
