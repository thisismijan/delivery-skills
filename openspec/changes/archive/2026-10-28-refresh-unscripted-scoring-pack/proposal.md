## Why

The unscripted scoring pack still describes leftover import cleanup
and omits the cases that now keep a worker after the last mechanical
slices: a Python attribute, `exec`, `serialVersionUID`, and a formatter
that changes names.

## What Changes

- Add those remaining unscripted units to `mechanical-edit-scoring.ts`.
- Keep unique Python and Java missing imports out of the pack, because
  they are now scripted.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: the representative unscripted pack matches
  the work a worker still receives.

## Impact

- `factory/scripts/mechanical-edit-scoring.ts`
- scoring tests that pin scripted ids out of the pack
