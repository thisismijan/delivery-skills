## Context

See proposal.md. Type declarations already tokenize Java and refuse an
incomplete graph. Method names were left on today's worker because `foo(`
is both a declaration and a call.

## Goals / Non-Goals

**Goals:**
- Apply a single Java method rename without a model when the graph is
  complete.

**Non-Goals:**
- Overload sets with more than one declaration of the same name.
- Live fast-model promotion.

## Decisions

### Declaration vs call

A method declaration is an identifier followed by `(` whose previous token
is a type name or primitive, not a `.`. `obj.foo(` is a call. Two
declarations of the same name are ambiguous.

## Risks / Trade-offs

- [Unusual declarations] → Fall back to today's worker rather than guess.

## Migration Plan

Ship the helper. Rollback is revert.

## Open Questions

None.
