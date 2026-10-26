## Context

See proposal.md. Java rename and import-only already tokenize identifiers
and skip strings. Format-only units were refused.

## Goals / Non-Goals

**Goals:**
- Re-space listed Java files without a model when names and literals stay
  the same.

**Non-Goals:**
- Matching google-java-format or Eclipse exactly.
- Changing line breaks other than converting `\r\n` to `\n`.
- Live fast-model promotion.

## Decisions

### Token identity, not a style guide

Keep identifier, number, string, operator, and comment token text. Convert
leading tabs to spaces and collapse interior spacing. If that token stream
changes, write nothing.

## Risks / Trade-offs

- [Layout taste] → Spacing is a small canonical join, not a vendor
  formatter. That is enough to apply a format-only unit without a model.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
