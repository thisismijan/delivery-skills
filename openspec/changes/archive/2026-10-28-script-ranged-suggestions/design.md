## Context

Forge suggestion fences may include `:-N+M`: N lines above the comment
and M lines below it, inclusive of the anchored line.

## Goals / Non-Goals

**Goals:**

- Apply a whole-body suggestion fence with an optional line range.

**Non-Goals:**

- Skipping the classifier, the red test, the gates, or holdout.

## Decisions

- **Inclusive span.** Start at `anchor.line - N`, end at
  `anchor.line + M`. Out of range fails closed to the implementer.
- **Already applied is a no-op.** If the joined file would not change,
  report `model` and write nothing.

## Risks / Trade-offs

- [The replaced span fails a gate] → green, lint, and typecheck still
  run, and a failure uses the implementer's bounded fix loop.
