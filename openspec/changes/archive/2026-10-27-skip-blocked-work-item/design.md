## Context

The work-item contract carries `blockedBy`. Auto already stops draft
until `blockersMerged` is true. `/draft` itself still assessed a
blocked item if invoked directly.

## Goals / Non-Goals

**Goals:**

- No ticket-assessor or feasibility-analyst when any blocker is listed.
- Keep the same clarify route and terminal stop.

**Non-Goals:**

- Checking whether those blockers have merged. That stays with the
  conductor evidence flag.
- Inferring blockers from the markdown "Blocked by" section.

## Decisions

- **Trust the normalized list.** A non-empty `blockedBy` array is
  enough. Do not scrape the body.
- **Clarify, do not reject.** The ticket may be fine once blockers
  merge. Gaps name the blocking references.
- **Check blockers before the section verifier.** A blocked item should
  not also drown the note in missing-heading noise.

## Risks / Trade-offs

- [Markdown says "Nothing" but the provider listed a link] → the
  provider list wins; the operator clears the link or waits.
