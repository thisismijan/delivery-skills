## Why

A reviewer suggestion with a `:-N+M` line range still started the
implementer. The fence already names the span and the replacement text.

## What Changes

- `forge-comments.ts apply-suggestion` replaces from N lines before the
  anchor through M lines after it.
- A range that leaves the file, extra prose, or a path outside the
  repository still reports `model` and writes nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: a suggestion fence does not start the
  comment implementer.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
