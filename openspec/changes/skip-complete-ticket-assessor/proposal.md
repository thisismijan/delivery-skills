## Why

`/draft` still started a ticket-assessor when the body already passed
the verifier, named no blockers, and asked no open questions. The
acceptance criteria are already Given/When/Then checkboxes. A model
cannot add required structure that is already present.

## What Changes

- When the body passes `verify-ticket.ts`, has no size warning, and
  Context, User stories, What to build, and Acceptance criteria contain
  no `?`, write a good atomic assessment from those criteria and skip
  the assessor.
- A question mark or a size warning still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the ticket-assessor on a complete
  ticket with no open questions.

## Impact

- `factory/scripts/ticket-structure.ts`
- `skills/draft/SKILL.md`
