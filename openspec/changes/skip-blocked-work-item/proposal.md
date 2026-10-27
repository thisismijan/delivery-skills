## Why

`/draft` still sends a blocked work item to the ticket-assessor. The
normalized item already lists the blockers. Spec'ing work that cannot
start is wasted model spend, and the conductor already refuses draft
without blocker evidence.

## What Changes

- `ticket-structure.ts` fails closed when the fetched item has any
  recorded blocker.
- `/draft` writes a clarification assessment from those references and
  does not dispatch the ticket-assessor or the feasibility analyst.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip draft assessors when the work item is
  blocked.

## Impact

- `factory/scripts/ticket-structure.ts`
- `skills/draft/SKILL.md`
