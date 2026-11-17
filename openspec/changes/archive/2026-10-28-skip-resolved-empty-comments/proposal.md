## Why

Address-comments still sent resolved threads and empty notes to the
comment-assessor. A resolved discussion is already finished. An empty
body has nothing to classify. The flatten and scope scripts can drop
those without a model.

## What Changes

- Flattening drops resolved discussions and resolved notes.
- Scoping records an empty or whitespace-only body as outdated.
- Remaining comments still go to one assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the assessor for resolved and empty
  comments.
- Address-comments: extend gather-and-scope.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
