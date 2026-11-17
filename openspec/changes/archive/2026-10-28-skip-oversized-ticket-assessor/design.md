## Context

Complete tickets with no questions already skip the assessor. Size
warnings were the remaining pass-but-still-dispatch path. Four hundred
lines is already the verifier's small-context ceiling.

## Goals / Non-Goals

**Goals:**

- No assessor when the only remaining issue is size.
- Route as `SPLIT_REQUIRED` through the existing `too_large` path.

**Non-Goals:**

- Changing the size thresholds.
- Skipping the assessor for a question mark.

## Decisions

- **Reuse `too_large`.** Do not invent a new quality value. Draft
  already stops and asks for a split.
- **Gaps are the warning lines.** The operator sees why it was too
  large.

## Risks / Trade-offs

- [A verbose but atomic ticket is split] → that is the standing
  small-context rule. Prefer the smaller split.
