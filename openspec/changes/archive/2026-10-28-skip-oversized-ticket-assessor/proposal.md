## Why

A ticket that already passed the verifier but tripped the size warning
still started a ticket-assessor. The warning exists to stop oversized
work before a model re-judges it. Draft already splits on `too_large`.

## What Changes

- When `verify-ticket.ts` passes with a size warning, write a
  `too_large` assessment from that warning and skip the assessor.
- A complete ticket with no warning and no question mark still copies a
  good verdict. A question still uses the assessor.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the ticket-assessor on a size warning.

## Impact

- `factory/scripts/ticket-structure.ts`
- `skills/draft/SKILL.md`
