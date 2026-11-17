## Why

Every subagent output failed closed the moment it did not parse, so a review
lens that did its work but broke its report format stopped the review and came
to the operator. That is right for a verdict that decides a stage, but costly
for output that decides nothing on its own. The operator chose to keep gates
strict and allow one repair for advisory output.

## What Changes

- A new `subagent-outputs.ts` lists every subagent output as gating or advisory.
  Gating is anything that routes a stage: assessment, feasibility, approach
  challenge, explain-back, readiness, holdout, comment classification, and
  adjudication. Advisory is review lens and focused-pass reports, the explorer
  report, profiling output, and worker handoffs. A name not on the list is
  treated as gating. `policy <subagent>` prints the rule.
- The conventions' validation rule says a malformed gating output fails closed
  at once with no repair, and a malformed advisory output gets one repair turn
  from the same subagent, doing no new work, before it fails closed.
- `/code-review-max` gives a lens whose report or candidates cannot be read one
  repair turn before the review stops. Adjudication output is never repaired.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-gating`: advisory output gets one repair turn; gating output still
  fails closed at once.

## Impact

- New `factory/scripts/subagent-outputs.ts`
- `factory/CONVENTIONS.md`, `skills/code-review-max/SKILL.md`
