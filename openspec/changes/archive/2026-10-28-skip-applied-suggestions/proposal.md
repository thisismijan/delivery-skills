## Why

A review comment that is only a suggestion already present in the file
still started the comment-assessor. That work is done.

## What Changes

- Scope records a suggestion-only comment as outdated when the suggested
  text is already in the anchored file.
- Extra prose beside a suggestion still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: applied suggestions skip the classifier.
- `cost-efficient-routing`: those comments do not start the assessor.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
