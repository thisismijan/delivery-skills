## Context

Step 2a already persists `source.md` and runs `verify-ticket.ts`. The
writer exists to turn grilling notes into the six-section template. That
work is already done when the input passed.

## Goals / Non-Goals

**Goals:**

- No writer when the approved content is the same verified input.
- Re-verify before the final path. Fail closed if the copy no longer
  passes.

**Non-Goals:**

- Skipping the writer for a multi-slice breakdown.
- Skipping path verification. The copy still runs `groom-paths.ts
  verify`.

## Decisions

- **Final name is `ticket.md`.** One verified input is one ticket. The
  writer still chooses names when it runs.
- **Any requested rewrite uses the writer.** The skip is only for
  unchanged approval of the Step 2a input.

## Risks / Trade-offs

- [The operator approved but asked for a title tweak] → that is a
  rewrite; dispatch the writer.
