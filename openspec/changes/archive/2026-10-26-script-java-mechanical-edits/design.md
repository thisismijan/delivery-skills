## Context

See proposal.md. TypeScript uses the language service. Python uses CPython.
Java has no language service in the factory pack. A tokenizer that skips
strings and comments is enough to prove a single type rename.

## Goals / Non-Goals

**Goals:**
- Apply a Java class, interface, enum, or record rename without a model when
  the graph is complete.

**Non-Goals:**
- Method or field rename in this change.
- Import-only or format-only Java.
- Live fast-model promotion.

## Decisions

### Type declarations only

Method names share tokens with calls. A type keyword followed by the source
name is a declaration we can count. Zero or two such declarations refuse.

### Tokenizer, not javac

The installed pack must apply without compiling the target. Identifier
tokens plus an incomplete-graph scan of `.java` files are enough.

## Risks / Trade-offs

- [Method rename still uses Sonnet] → Acceptable. The helper does not guess.
- [record as a keyword] → Counted as a type keyword. Older code that uses
  record as an identifier is not treated as a type declaration of that name.

## Migration Plan

Ship the helper. Non-Java units are unchanged. Rollback is revert.

## Open Questions

None.
