## Why

A ticket that was complete except for Out of scope or Blocked by still
started the groom-explorer, grilling, and often the writer. Those
sections have a safe default of none.

## What Changes

- When verification fails only because those sections are missing,
  append them as `None.` and treat the input as a valid ticket.
- Any other verifier failure still uses exploration and grilling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: housekeeping-only gaps skip groom models.
- `groom`: the same fill happens before exploration.

## Impact

- `factory/scripts/verify-ticket.ts`
- `skills/groom/SKILL.md`
