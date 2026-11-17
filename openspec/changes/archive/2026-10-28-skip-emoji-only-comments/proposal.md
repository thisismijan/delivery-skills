## Why

A review comment that is only emoji still started the
comment-assessor. There is no finding in that body.

## What Changes

- Scope records an emoji-only body, including a reaction shortcode, as
  outdated.
- Extra prose beside emoji still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: emoji-only comments skip the classifier.
- `cost-efficient-routing`: those comments do not start the assessor.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
