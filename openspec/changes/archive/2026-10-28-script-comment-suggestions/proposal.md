## Why

When a reviewer leaves a one-line suggestion and the assessor classifies it
as an action, `/address-comments` still started the implementer. The
suggested line is already the fix, so the model only copies it.

## What Changes

- `forge-comments.ts apply-suggestion` replaces the anchored line with a
  single-line suggestion and reports `script`, or writes nothing and reports
  `model`.
- When the helper reports `script`, the implementer is not dispatched for
  that fix. A bug still gets its red test, and the green gate, lint,
  typecheck, and holdout still run.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: a single-line suggestion does not start the
  comment implementer.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
