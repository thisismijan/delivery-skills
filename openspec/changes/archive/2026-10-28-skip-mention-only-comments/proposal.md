## Why

A review comment that is only a mention still started the
comment-assessor. There is no finding in that body.

## What Changes

- Scope records a mention-only body as outdated.
- A mention plus other review text still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: mention-only comments skip the classifier.
- `cost-efficient-routing`: those comments do not start the assessor.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
