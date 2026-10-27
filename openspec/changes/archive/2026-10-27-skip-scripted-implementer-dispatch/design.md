## Context

Step 3b already continues at the green gates for a scripted unit. Step 7
is reached when 3b did not apply, then a later unit is classified as
scripted. The skip sentence was followed by an unconditional dispatch.

## Goals / Non-Goals

**Goals:**

- No implementer after `apply` is `script` at step 7.
- Keep the implementer for `not-mechanical` and `select-model`.

**Non-Goals:**

- Skipping holdout, green, lint, or typecheck.

## Decisions

- **Continue at step 8.** Write empty implementer handoff `none` so later
  steps that read the file do not stall.

## Risks / Trade-offs

- [A unit is misclassified as script] → green, lint, typecheck, and
  holdout still have to pass; a wrong apply fails those gates.
