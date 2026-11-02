## Why

A review comment that asks for a test of behaviour that is already correct
cannot go red, so the red gate stopped the change request for an operator
decision each time. It happened on !981, !982, and !986 in run MDF-3212,
before a run-wide approval, and earlier on !894, !899, and !903. The comments
read like "nothing tests that…; if this condition is deleted, every test
still passes", about code that was right.

## What Changes

- A `test-gap` classification in the verdict schema, the action routing, and
  the comment assessor. It applies only when the assessor confirmed in the
  code that the behaviour is correct; otherwise the comment is a `bug`.
- In address-comments, a `test-gap` adds the test, runs the green gate, and
  proves the test bites, with no red gate and no operator stop.
- New `factory/scripts/mutation-proof.ts`:
  - applies a minimal patch that breaks the behaviour, never a test, to the
    clean worktree;
  - requires the new test to fail the way a red gate does;
  - restores the source byte for byte;
  - refuses a dirty worktree, an empty patch, or a patch that touches a test.
- A test that does not catch the break is strengthened within the fix budget
  or escalated. A real defect keeps the red gate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: the `test-gap` class and its mutation proof.

## Impact

- New `mutation-proof.ts` and test; `verdicts.ts`, `classify-route.ts`,
  `diff-scan.ts` (exports its test-path rule)
- `factory/agents/comment-assessor.md`, `skills/address-comments/SKILL.md`,
  `docs/reference.md`
