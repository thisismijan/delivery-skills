## Why

A complete ticket with no open questions already skips the
ticket-assessor. Draft still started a feasibility-analyst on that same
body. Named sensitive work already skips as needs-human. An ordinary
complete ticket does not need a model to copy What to build as the
approach.

## What Changes

- When the body passes the verifier, has no size warning, has no `?` in
  the scoped sections, and does not name authentication, secrets, or a
  data migration, write a feasible verdict at medium complexity and skip
  the analyst.
- A question still uses the analyst. Named sensitive work still
  escalates without a model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip the feasibility-analyst on a complete
  ordinary ticket.

## Impact

- `factory/scripts/ticket-feasibility.ts`
- `skills/draft/SKILL.md`
