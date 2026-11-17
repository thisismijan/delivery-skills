## Why

What the feasibility analyst learned about the code a change touches, its entry
points, callers, and tests, was thrown away after the verdict. The test writer
and the implementer then rediscovered the same things for medium and high
complexity work, where that reading is most expensive.

## What Changes

- For medium or high complexity, the feasibility verdict carries an optional
  `comprehension` memo: entry points, callers, existing tests, and open
  questions, each claim naming a repository file.
- A new `comprehension-memo.ts write` saves it as `comprehension.md` in the change
  folder, keeping only claims whose file exists in the repository. Low
  complexity, a verdict with no memo, or a memo with no valid claim writes
  nothing.
- `/draft` runs it after recording the change metadata, so the memo is committed
  with the change. `/execute` passes it to the test-writer and implementer
  packets with `--context`.
- The review packet leaves the memo out of the spec sections, so the holdout
  reviewer never sees it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: execute workers start from feasibility's memo for
  medium and high complexity work.

## Impact

- New `factory/scripts/comprehension-memo.ts`; `factory/scripts/verdicts.ts`,
  `factory/scripts/review-packet.ts`
- `factory/agents/feasibility-analyst.md`, `skills/draft/SKILL.md`,
  `skills/execute/SKILL.md`, `docs/reference.md`
