## Why

A complete ticket that named optional fields, optional chaining, or
nullish coalescing still started the ticket-assessor and the
feasibility-analyst. Those question marks are syntax, not product
questions.

## What Changes

- Treat `?:`, `?.`, and `??` as not an open question.
- A real question in the scoped sections still uses those models.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: optional syntax does not dispatch draft
  models.

## Impact

- `factory/scripts/verify-ticket.ts`
- `skills/draft/SKILL.md`
