## Why

`/execute` still starts a test-writer and an implementer after
`apply-mechanical-edit.ts` has already rewritten the files. A scripted
rename, import-only, or format-only unit has no new behaviour to prove
red. The existing suite plus green, lint, and typecheck is the proof.
Holdout still runs.

## What Changes

- Classify and apply a mechanical-edit unit before the test-writer.
- When `apply` is `script`, skip the test-writer, the red gate, and the
  implementer. Run green, lint, and typecheck, then holdout.
- When the unit is not scripted, keep tests-first and the implementer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip execute workers on a scripted unit.

## Impact

- `skills/execute/SKILL.md`
- `skills/delivery/workflows/ticket-to-mr.md`
