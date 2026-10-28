## Why

A change whose measured diff has no reviewable code still started two
review-lens subagents. Those workers have no code to inspect.

## What Changes

- When the measured diff has zero reviewable files and lines, and the
  classification is complete, reversible, and not sensitive, dispatch
  no review-lens subagents.
- Any unproven or sensitive classification still uses the full review.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: empty measured diffs skip review lenses.

## Impact

- `factory/scripts/review-fanout.ts`
- `skills/code-review-max/SKILL.md`
