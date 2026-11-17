## Why

`/draft` still starts a ticket-assessor on every fetched work item. Groom
already has a deterministic structural check: required sections, at most
one user story, and one to three Given/When/Then acceptance criteria.
A ticket that fails that check cannot be built as specified. Sending it
to a model only restates the missing headings.

## What Changes

- After fetching the work item, run `verify-ticket.ts` against its body.
- When the check fails, write a clarification (or split) assessment from
  the reported gaps and do not dispatch the ticket-assessor.
- When the check passes, dispatch the assessor as today. Structure is
  not a substitute for semantic judgement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the ticket-assessor when structural
  verification fails.
- Draft: run the existing ticket verifier before assessment.

## Impact

- `factory/scripts/ticket-structure.ts`
- `skills/draft/SKILL.md`
- `factory/agents/ticket-assessor.md`
