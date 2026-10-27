## Why

`/groom` still starts a codebase explorer and a grilling loop when the
input is already a structurally valid ticket. `verify-ticket.ts` already
knows that shape. An explorer and a grilling round cannot add required
sections that are already present.

## What Changes

- After resolving the output directory, run `verify-ticket.ts` on the
  input.
- When it passes, skip the explorer, grilling, and PRD, classify as a
  single ticket, and present that content for approval.
- When it fails, keep the current explorer and grilling path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: skip groom exploration when the input is
  already a valid ticket.
- Groom: verify the input before dispatching the explorer.

## Impact

- `skills/groom/SKILL.md`
- `factory/specs/groom/spec.md`
