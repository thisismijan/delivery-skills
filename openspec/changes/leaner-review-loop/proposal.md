## Why

A ticket with two comment rounds was reviewed by one holdout before the
change request opened, then three full dual reviews and two more holdouts,
then release readiness. Every fix was reviewed twice: once by the
address-comments holdout and again by Stage 3, which is the only pass that
can mark the change ready anyway. Every Stage 3 round reread the whole change,
even when the round changed two functions. And the approach was first
challenged only once code existed, which is how MDF-3573's design flaw took
five review rounds to surface.

## What Changes

- `/address-comments` runs the cumulative tests, lint, and typecheck after a
  round that changed code, and no review of its own. Stage 3 checks the fixes.
- New `factory/scripts/review-scope.ts` decides whether a Stage 3 round reviews
  the whole change or only what changed since the last review. It reads the
  last reviewed commit from the pinned `max.md` artifacts. `delta` needs all of
  these:
  - an earlier review in this branch's history, with a verdict;
  - no merge commit since then;
  - no sensitive surface, dependency, one-way step, or weakened test in the
    change;
  - at most 6 files and fewer than 400 lines;
  - only files the earlier review covered;
  - a level other than `max`.
- In `delta`, `/code-review-max` lenses read `git diff <since> <head>`, confirm
  each earlier finding is fixed, and report unfixed ones again. `/mr-review`
  judges the approach of that change only. Release readiness still reads the
  whole change.
- `/draft` dispatches a read-only frontier `approach-challenger` after the spec
  is written, unless feasibility rated the change low complexity. Its verdict is
  `sound`, `gaps`, or `rethink`, routed by `draft-route.ts approach`:
  - gaps become scenarios or stated non-goals;
  - a first rethink revises the design and challenges once more;
  - a second rethink stops with exit 3.
- The constitution's address-comments stops replace `holdout-rejected` with
  `repeated-assumption`, and draft gains `unsettled-approach`. The constitution
  hash changes, so approved run contracts must be approved again.

## Capabilities

### New Capabilities

- `draft-approach-challenge`: the planned approach is challenged once before
  it is committed.

### Modified Capabilities

- `cost-efficient-routing`: no holdout after a comment round; later rounds can
  review only what changed.
- `stage-3-readiness`: a comment round leaves the change draft without a
  holdout.

## Impact

- New `factory/scripts/review-scope.ts`, `factory/agents/approach-challenger.md`,
  and tests; `factory/scripts/draft-route.ts`, `verdicts.ts`, `record-skip.ts`
- `skills/address-comments/SKILL.md`, `skills/code-review-max/SKILL.md`,
  `skills/mr-review/SKILL.md`, `skills/draft/SKILL.md`,
  `skills/delivery/sdlc-constitution.json`, workflow docs, README, reference
