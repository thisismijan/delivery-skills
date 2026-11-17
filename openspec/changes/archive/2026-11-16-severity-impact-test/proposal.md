## Why

In `/code-review-max`, Medium blocks readiness and Low does not, so that line
decides whether a change gets another fix round. The severity section described
each level but gave no test for where a finding falls when its harm is
uncertain, so a finding could be rated by how bad the area could be rather than
by what the evidence shows. Inflated blockers cost fix rounds under the review
round cap.

## What Changes

- The code review's severity section gains an impact test: severity never
  exceeds demonstrated impact; a finding whose concrete damage cannot be stated
  is Low at most, or dropped under adjudication step 7; Medium or above needs a
  named trigger and a stated consequence; and weakening a control rates lower
  than defeating it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-3-readiness`: blocking severity is capped by the impact a finding shows.

## Impact

- `skills/code-review-max/SKILL.md`
- `factory/scripts/workflow-contracts.test.ts`
