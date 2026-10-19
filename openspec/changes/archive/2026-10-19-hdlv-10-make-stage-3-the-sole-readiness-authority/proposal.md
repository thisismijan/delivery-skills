## Why

Ship trusts a conductor-written review row. Address-comments re-marks the merge request ready from its own holdout and can leave status `[reviewed-blocked]`. A new head can then skip the dual Stage 3 pass or re-enter comment fixing forever. Only validated max-pass and approach-pass artifacts should undraft the current head.

## What Changes

- Add a pure helper that decides `ready` versus `stay-draft` from matching max-pass and approach-pass artifacts, checking their markers against the current merge request and head.
- Address-comments on a new head after cumulative holdout approve leaves the merge request draft and sets status `[addressed !N]` until Stage 3 dual review passes.
- Malformed, stale, missing, or blocking review evidence keeps the merge request draft.
- Add `[addressed !N]` to the ledger vocabulary and the auto next-step table so resume sends that status to review, not address-comments again.
- Ship must not treat a conductor-written review row as enough to undraft or to proceed as if Stage 3 had passed.

Out of scope: changing review lenses or replacing the holdout reviewer.

## Capabilities

### New Capabilities

- `stage-3-readiness`: who may mark the current merge request head ready, and which dual-review artifacts that decision requires.

### Modified Capabilities

None.

## Impact

- `factory/scripts/stage3-readiness.ts` (new, pure) and its tests
- `factory/scripts/next-action.ts` and `factory/scripts/next-action.test.ts`
- `skills/address-comments/SKILL.md` and `factory/specs/address-comments/spec.md`
- `skills/delivery/SKILL.md`, `workflows/auto.md`, `workflows/delivery-ledger.md`, `workflows/release-readiness.md`, `workflows/mr-review-to-ready.md`
- `skills/delivery/checks/delivery-specs.test.ts`
