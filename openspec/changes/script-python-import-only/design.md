## Context

See proposal.md. CPython already parses the listed files for identifier
renames. Import-only units were refused.

## Goals / Non-Goals

**Goals:**
- Remove unused top-level Python imported names without a model when the
  rest of the module is unchanged.

**Non-Goals:**
- Java import-only.
- Python format-only in this change.
- Live fast-model promotion.
- Sorting imports when nothing is unused.

## Decisions

### AST remainder, not a formatter

Rewrite only import statements. Compare the AST of everything else before
and after. If that remainder changes, write nothing.

### Fail closed on unprovable forms

Star imports, imports inside functions or `if` blocks, postponed
annotations, and comments on import lines cannot be proven unused from the
module AST alone.

## Risks / Trade-offs

- [Side-effect imports] → An unused bound name is dropped. A module imported
  only for import-time side effects looks unused and is refused only when
  nested or commented; a bare unused `import mod` is removed.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
