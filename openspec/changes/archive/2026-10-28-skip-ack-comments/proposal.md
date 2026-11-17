## Why

A review comment that is only an acknowledgement still started the
comment-assessor. There is nothing to action.

## What Changes

- Scope records LGTM, thanks, approved, and the same short acknowledgements as outdated.
- Extra prose beside an acknowledgement still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: acknowledgement-only comments skip the classifier.
- `cost-efficient-routing`: those comments do not start the assessor.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
