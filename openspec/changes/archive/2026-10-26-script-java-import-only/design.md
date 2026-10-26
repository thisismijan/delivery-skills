## Context

See proposal.md. Java type and method rename already tokenizes identifiers
and skips strings. Import-only units were refused.

## Goals / Non-Goals

**Goals:**
- Remove unused `import type.name;` lines without a model when the rest of
  the file's identifier tokens stay the same.

**Non-Goals:**
- Wildcard imports.
- Reordering imports.
- Java format-only.
- Live fast-model promotion.

## Decisions

### Simple-name usage, not a compiler

Keep an import when its last identifier appears as an identifier token
outside import lines. Star imports fail closed because usage cannot be
proven from tokens.

## Risks / Trade-offs

- [Fully qualified names] → A type used only as `java.util.List` does not
  keep `import java.util.List;`. That import is unused at compile time.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
