## Context

Operators often paste a ticket that already has context, a story, what
to build, and Given/When/Then criteria. They omit Out of scope and
Blocked by. The factory can name that as none without a model.

## Goals / Non-Goals

**Goals:**

- Fill only those two missing sections, then skip explorer, grilling,
  and the writer on unchanged approval.

**Non-Goals:**

- Filling Context, User stories, What to build, or Acceptance criteria.
- Inventing blockers or out-of-scope items from the codebase.

## Decisions

- **Fail closed on any other gap.** Too many stories, a non-GWT
  criterion, or a missing core section still uses exploration.
- **Write back to source.md.** Step 2a and Step 8 then see a verified
  ticket.

## Risks / Trade-offs

- [The ticket did have blockers the operator forgot to list] → they can
  request a rewrite at approval.
