## Context

Complete tickets already skip assessment. Feasibility still paid for a
codebase walk whose output, for those tickets, is an approach sketch
and a complexity signal. Medium complexity is the live standard route.
High complexity remains reserved for an analyst or a sensitive skip.

## Goals / Non-Goals

**Goals:**

- No analyst when the ticket is complete, unblocked by size, asks no
  question, and is not named sensitive work.
- Keep `complexitySignal` at `medium` so execute does not take the
  frontier path without an analyst.

**Non-Goals:**

- Skipping holdout.
- Guessing affected files. Those arrays stay empty.

## Decisions

- **Sensitive patterns still run first.** A complete ticket that names
  authentication still returns `needs_human`.
- **Approach sketch is What to build.** Collapse whitespace. Do not
  invent a landing.

## Risks / Trade-offs

- [The ticket is complete but lands on a hard module] → holdout and
  gates still fail closed; medium complexity does not under-select
  Opus without evidence.
