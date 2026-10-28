## Context

Measure already drops OpenSpec and delivery artefacts. A spec-only
change therefore reports zero files and still matched the small-review
band, which starts two lenses.

## Goals / Non-Goals

**Goals:**

- Dispatch no review-lens subagents when there is no reviewable code.

**Non-Goals:**

- Skipping holdout.
- Treating an incomplete classification as empty.

## Decisions

- **Empty is stricter than small.** Zero files and zero lines, complete,
  reversible, and no sensitive surface.
- **Unknown still uses all four.** Fail closed.

## Risks / Trade-offs

- [A binary or unreadable path was excluded from the count] → measure
  already counts binary files as one line, so they are never empty.
