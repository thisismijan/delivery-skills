## Why

`/draft` asked for a rejected alternative only when complexity was high. For a
medium change, the options considered and turned down at the seam checkpoint,
by the approach challenger, or during grooming were never written into the
change, so the implementer could not see them and the holdout reviewer had
nothing to check against. An implementer could drift back to a design that had
already been rejected.

## What Changes

- `/draft` gives `design.md` a `## Rejected alternatives` section whenever
  complexity is medium or high, listing each material option not taken with the
  one-line reason it loses: unchosen seams, any approach-challenger alternative,
  and any option the grooming decisions log rejected for the ticket. Low
  complexity may leave it out.
- The holdout reviewer fails `codeMatchesSpec` for a diff that implements one of
  those options, unless the spec was changed to adopt it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `draft-approach-challenge`: rejected alternatives are recorded above low
  complexity and guarded at the holdout review.

## Impact

- `skills/draft/SKILL.md`, `factory/agents/holdout-reviewer.md`
- New `factory/scripts/rejected-alternatives.test.ts`
