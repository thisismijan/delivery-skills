## Context

Step 7 already skips the implementer when `apply` is `script`, but that
is after the test-writer and red gate. Format-only and import-only units
do not add tests. A rename script rewrites identifiers, including tests,
so a red gate on new tests is the wrong shape.

## Goals / Non-Goals

**Goals:**

- No test-writer, red gate, or implementer when the helper already wrote
  the files.
- Keep holdout and the green/lint/typecheck triple.

**Non-Goals:**

- Skipping holdout.
- Treating `select-model` mechanical units as scripted.
- Inventing a unit from free-text. Incomplete findings stay
  not-mechanical.

## Decisions

- **Classify before tests.** The same `apply-mechanical-edit.ts` helper
  is the gate. A payload flag is still not proof.
- **Scripted units use the existing suite.** There is no red gate because
  there are no new tests. Green must still pass.
- **Write explicit none handoffs** so later summary steps do not invent
  worker output.

## Risks / Trade-offs

- [The command mis-classifies a behavioural change as format-only] →
  the helper already refuses incomplete units; holdout still sees the
  diff.
