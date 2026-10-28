## Why

A complete ticket that cited an HTTP query string still started the
ticket-assessor and the feasibility-analyst. That `?` is not an open
product question. Inline code has the same false trigger.

## What Changes

- Treat a `?` inside a URL or inline code as not an open question.
- A real question in the scoped sections still uses the assessor and
  the analyst.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: URL and inline-code question marks do not
  dispatch draft models.

## Impact

- `factory/scripts/verify-ticket.ts`
- `factory/scripts/ticket-structure.ts`
- `factory/scripts/ticket-feasibility.ts`
- `skills/draft/SKILL.md`
