## Context

Structural failure and recorded blockers already skip the assessor. A
passing ticket still paid for semantic review even when it asked no
questions and already carried one to three Given/When/Then criteria.

## Goals / Non-Goals

**Goals:**

- No assessor when the ticket is complete, unblocked, not oversized,
  and has no `?` in the scoped sections.
- Copy those checkbox lines as `derivedAcceptanceCriteria`.

**Non-Goals:**

- Skipping the assessor when the ticket still asks a question.
- Treating a size warning as good. That still uses the assessor.

## Decisions

- **A `?` is an open question.** Query strings in those sections still
  go to the assessor. That is fail-closed.
- **Feasibility still runs.** This skip only replaces structural
  assessment.

## Risks / Trade-offs

- [A complete ticket is still ambiguous without a question mark] →
  feasibility and later gates still fail closed; the operator can
  clarify.
