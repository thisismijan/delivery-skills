## Context

The feasibility-analyst must set `needs_human` when the change touches
authentication, secrets, or risky data migrations. `/draft` still pays
for a model to reach that same verdict.

## Goals / Non-Goals

**Goals:**

- No analyst when What to build or Acceptance criteria name those
  topics.
- Route through `draft-route.ts` so the escalate stop is unchanged.

**Non-Goals:**

- Judging whether a mention is "do not touch auth". That still
  escalates; a human reads it.
- Scanning Context or Out of scope. Mentions there are not the work.

## Decisions

- **Reuse section headings from `verify-ticket.ts`.** Only those two
  sections feed the scan.
- **Match the analyst's escalate list**, not the fast-dispatch floors.
  Concurrency and holdout stay with the analyst.
- **Empty arrays for areas and contracts.** The script did not explore
  the codebase. The escalate note is the named risk.

## Risks / Trade-offs

- ["Do not change authentication" in What to build] → still escalates.
  Fail closed. The operator can rephrase or take the human path.
