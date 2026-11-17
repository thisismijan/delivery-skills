## Why

`/address-comments` still starts a comment-assessor when the in-scope
list is empty, and it asks the model to notice comments whose anchor
lines are already gone. An empty list is `[]`. A missing file or a
new-side line past the end of the file at the pinned head is outdated
without a classifier.

## What Changes

- After scoping, if no comments remain, write an empty classification
  and do not dispatch the assessor.
- Carry optional anchors on flattened comments. A new-side anchor whose
  path is missing at the pinned head, or whose line is past the end of
  that file, is outdated. Unanchored comments stay in scope.
- The assessor still classifies every remaining in-scope comment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- Address-comments: skip the assessor on an empty in-scope list, and
  mark proven-gone anchors outdated before classification.

## Impact

- `factory/scripts/forge-comments.ts`
- `skills/address-comments/SKILL.md`
- `factory/specs/address-comments/spec.md`
