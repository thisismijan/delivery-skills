## Why

When `/code-review-max` confirmed a finding, nothing looked for the same root
cause elsewhere in the change. A sibling copy of the bug surfaced only in a
later review round, or not at all, and each round costs a full review under the
round cap.

## What Changes

- After adjudication, each finding confirmed at Medium or higher is searched for
  variants: the same call, missing guard, or unchecked input in the changed files
  and their sibling paths, never beyond the change's affected areas. Each
  further instance is verified like the finding and listed under it as **Also
  at:**, not raised separately. Low findings get no variant search.
- `/address-comments` fixes every listed instance in the same commit and round,
  names each location in the reply, and names any listed instance that turned
  out not to be the same defect.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-3-readiness`: a confirmed finding carries its sibling instances so they
  are fixed in one round.

## Impact

- `skills/code-review-max/SKILL.md`, `skills/address-comments/SKILL.md`
- New `factory/scripts/variant-search.test.ts`
