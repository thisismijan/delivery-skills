## Why

A review comment that is only done, ditto, or see above still started
the comment-assessor. Those notes are acknowledgements, not findings.

## What Changes

- Treat done, fixed, addressed, ditto, see above, same, agreed, and
  sgtm as acknowledgement-only bodies.
- Extra prose beside those words still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: those bodies skip the classifier.
- `cost-efficient-routing`: those comments do not start the assessor.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
