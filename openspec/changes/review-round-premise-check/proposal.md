## Why

Merge requests delivered with these skills often reach 20 to 40 commits. On
the dark-factory project, MDF-3573 took 38 commits across five review rounds.
Each round found another way of writing a call that the same pattern-matching
approach missed, and only round 5 replaced the approach. The holdout premise
checkpoint covers fix loops before the merge request exists, but nothing
compared one review round with the next, and single-step review rounds were
not counted at all.

Each round also cost three or four commits: a test-only commit, a fix commit,
a separate spec update, and often a formatting commit added after lint failed.

## What Changes

- The comment assessor labels every bug with the design assumption it breaks
  (`assumption`, a short kebab-case label), reusing an earlier round's label
  for the same idea. `verdicts.ts` requires the label on a bug and refuses it
  on any other classification.
- New `factory/scripts/review-rounds.ts` records each address-comments round
  in `.review/<changeName>/review-rounds.json`.
  - `record` exits 0 when no label repeats an earlier round, 3 when one does,
    and 1 when a label repeats after its premise check was recorded.
  - `premise` records the premise check's outcome for a repeated label.
  - Recording the same head again replaces that round.
- On exit 3, address-comments states the premise and runs one discriminating
  observation before any fix, then either replaces the approach (code and spec
  together) or stops with a decision brief. On exit 1 it stops.
- Commits: each actioned comment is one fix commit, after a test-only commit
  for a bug. The formatter runs before every commit in execute and
  address-comments, and spec updates go in the fix commit. A lint failure
  that is only formatting amends the unpushed commit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: rounds are recorded and a repeated assumption needs a
  premise check; formatting and spec edits go in the fix commit.

## Impact

- New `factory/scripts/review-rounds.ts` and its test; `factory/scripts/verdicts.ts`
- `factory/agents/comment-assessor.md`, `skills/address-comments/SKILL.md`,
  `skills/execute/SKILL.md`, `skills/delivery/workflows/auto.md`, `docs/reference.md`
