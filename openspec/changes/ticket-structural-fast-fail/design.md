## Context

`verify-ticket.ts` already fails closed for groom drafts. `/draft` reads
a normalized work item whose `body` is that markdown for groomed tickets,
and free text for tracker items that skipped grooming.

## Goals / Non-Goals

**Goals:**

- No model call when required sections, story count, or acceptance
  criteria fail the existing verifier.
- Route through `draft-route.ts` so clarify and split stops stay the same.

**Non-Goals:**

- Skipping the assessor on a structurally valid ticket.
- Changing the verifier's required sections.
- Inferring a split from ticket prose.

## Decisions

- **Reuse `verify-ticket.ts`.** Do not invent a second checklist. Force
  the body to be treated as text so a one-line description cannot be
  mistaken for a file path.
- **Too many stories or criteria are `too_large`.** Missing headings
  stay `needs_clarification` with `atomic` scope. The split
  recommendation is the verifier's bound (one story, at most three
  criteria), not a guessed breakdown.
- **A passing check still dispatches the assessor.** Durability, stale
  coordinates, and whether the ticket is one cluster remain judgement.

## Risks / Trade-offs

- [A tracker item written as free prose fails the section check] →
  intended. Groom, or add the required headings, then re-invoke `/draft`.
