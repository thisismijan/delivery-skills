## Context

Forge's default suggestion fence replaces the one commented line. Extra
lines in that fence are inserted after it. A header such as `:-0+1`
names a different span and stays with the implementer.

## Goals / Non-Goals

**Goals:**

- Apply an un-ranged suggestion whose replacement is one or more lines.

**Non-Goals:**

- Ranged headers other than the default `:-0+0`.
- Skipping the classifier, the red test, the gates, or holdout.

## Decisions

- **Replace one line.** `splice` removes the anchored line and inserts
  the suggestion lines in its place.
- **Fail closed to the implementer** for ranges, extra prose, and path
  escapes, as before.

## Risks / Trade-offs

- [The inserted lines fail a gate] → green, lint, and typecheck still
  run, and a failure uses the implementer's bounded fix loop.
