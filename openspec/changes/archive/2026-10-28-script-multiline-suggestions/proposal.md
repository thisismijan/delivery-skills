## Why

A reviewer suggestion that replaces one line with several still started
the implementer. The fence already contains the replacement text.

## What Changes

- `forge-comments.ts apply-suggestion` replaces the anchored line with
  every line in an un-ranged suggestion fence.
- A ranged fence still reports `model` and writes nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: an un-ranged suggestion does not start the
  comment implementer.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
