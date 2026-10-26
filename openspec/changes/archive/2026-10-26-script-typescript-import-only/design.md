## Context

See proposal.md. The language service already exposes `organizeImports`.
The previous apply helper refused import-only units.

## Goals / Non-Goals

**Goals:**
- Remove unused TypeScript imports and organize remaining ones without a
  model when the edits stay in the import block.

**Non-Goals:**
- Python or Java import-only.
- Format-only in this change.
- Live fast-model promotion.

## Decisions

### Span check, not trust

Organize-imports can emit a wide span. If any change falls outside import
and import-equals declarations, refuse and write nothing.

## Risks / Trade-offs

- [Side-effect imports] → The language service keeps them. If it does not,
  the span check still prevents non-import edits.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
