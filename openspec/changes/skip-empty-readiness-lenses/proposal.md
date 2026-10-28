## Why

Release readiness still started lens subagents, or ran the rollback lens
in the main conversation, when the measured diff had no reviewable code.
The small-change skip was counted by hand, so a spec-only change could
look large.

## What Changes

- `review-fanout.ts readiness` returns `empty`, `small`, or `full` from
  the same measured counts max review uses.
- `empty` and `small` dispatch no lens subagents. `empty` also skips the
  rollback lens in the main conversation. `full` keeps the classified
  lenses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: readiness lens fan-out follows demonstrated
  risk.
- `release-readiness`: empty and small diffs skip lens subagents.

## Impact

- `factory/scripts/review-fanout.ts`
- `skills/delivery/workflows/release-readiness.md`
