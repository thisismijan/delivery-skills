## Context

See proposal.md. Import-only already uses CPython's tokenizer. Format-only
units were refused.

## Goals / Non-Goals

**Goals:**
- Re-space listed Python files without a model when names and literals stay
  the same.

**Non-Goals:**
- Matching Black or Ruff layout exactly.
- Java format-only.
- Live fast-model promotion.

## Decisions

### Token identity, not a style guide

Untokenize the existing token stream. If the parse tree or the significant
token sequence changes, write nothing.

## Risks / Trade-offs

- [Layout taste] → The rewrite is CPython's round-trip spacing, not Black.
  That is enough to apply a format-only unit without a model.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
