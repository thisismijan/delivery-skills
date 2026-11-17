## Why

Scripted skips already keep models from starting, but the run scorecard
only totals workers that ran. A skip therefore looks like unused
capacity instead of a counted saving. Operators cannot see how many
workers a run avoided.

## What Changes

- Each scripted skip records the avoided worker and a human reason.
- The run scorecard prints the avoided-worker count next to measured
  usage.
- Skip recording runs even when diagnostic profiling is off.
- The scorecard never estimates tokens, cost, or time saved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skipped workers are counted, not priced.

## Impact

- `factory/scripts/record-skip.ts`
- `factory/scripts/routing-scorecard.ts`
- draft, execute, address-comments, groom, code-review-max, and
  release-readiness skills
- operator docs that name the scorecard
